import type { SupabaseClient } from '@supabase/supabase-js'
import { proxyCall } from './osu'
import { dataCache } from './dataCache'
import type { GameMode } from './mode'
import { modeLabel } from './mode'
import type { RecCandidate, SearchBeatmapset, SearchPage } from './recommend'
import { splitTags } from './recommend'
import { addToList, createList, loadListItems, loadLists } from './lists'

/**
 * Ranked compilation lists (batch 9): the most-played beatmaps
 * ranked inside a recent window, compiled live from osu! search —
 * one list per mode, following the app's global mode state.
 *
 * COMPILATION METHOD (the honest one): page through search sorted
 * newest-ranked-first (`sort: ranked_desc`, `status: ranked`),
 * keep sets whose ranked date falls inside the window, and stop
 * as soon as results are older than the window start. Only THEN
 * sort the collected sets by play count and take the top 50.
 * Paging by plays instead would bury recent maps under ancient
 * popular ones — the window filter must come first, the play
 * sort second. No Edge Function change was needed: the proxy
 * already passes `status`/`sort` through (see searchBeatmapsets),
 * and `ranked_date`/`play_count` arrive on the search payload.
 *
 * WINDOW RULE: the window start is INCLUSIVE — a set ranked
 * exactly at the start instant belongs to the window.
 * Sets with a missing/unparseable ranked date are excluded
 * (their recency cannot be verified) but do NOT stop the scan.
 */

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

export type RankedWindowId = 'week' | 'month' | 'year'

export interface RankedWindow {
  id: RankedWindowId
  /** Tab label. */
  tabLabel: string
  /** Label used in the saved-list name. */
  listLabel: string
  /** Window length in days. */
  days: number
  /** Client cache TTL: lists change slowly, longer windows slower. */
  ttlMs: number
}

export const RANKED_WINDOWS: RankedWindow[] = [
  { id: 'week', tabLabel: 'This week', listLabel: 'This week', days: 7, ttlMs: 60 * 60 * 1000 },
  { id: 'month', tabLabel: 'Last 4 weeks', listLabel: 'Last 4 weeks', days: 28, ttlMs: 6 * 60 * 60 * 1000 },
  { id: 'year', tabLabel: 'This year', listLabel: 'This year', days: 365, ttlMs: 24 * 60 * 60 * 1000 },
]

export const RANKED_TOP_N = 50

/** Scan cap: 20 search pages so the year window cannot hang the page. */
export const RANKED_SCAN_MAX_PAGES = 20

// ---------------------------------------------------------------------------
// Candidate mapping (compilation-local, not personalised)
// ---------------------------------------------------------------------------

/**
 * Convert a search set to a row candidate. Unlike the recommendation
 * engine's pick (closest to the player's comfort edge), a
 * compilation has no player profile: the representative difficulty
 * is the MEDIAN star rating among the set's in-mode difficulties.
 * SR range, tags, play/favourite counts follow the same rules as
 * setToCandidate. Returns null when the set has no playable
 * difficulty in the mode — the set is excluded, never faked.
 */
export function rankedSetToCandidate(
  set: SearchBeatmapset,
  mode: GameMode,
): RecCandidate | null {
  if (!set || typeof set.id !== 'number') return null
  const inMode = (set.beatmaps ?? []).filter(
    (b) =>
      b &&
      b.mode === mode &&
      typeof b.difficulty_rating === 'number' &&
      Number.isFinite(b.difficulty_rating),
  )
  if (inMode.length === 0) return null
  const sorted = [...inMode].sort((a, b) => a.difficulty_rating - b.difficulty_rating)
  const diff = sorted[Math.floor(sorted.length / 2)]
  const srs = sorted.map((b) => b.difficulty_rating)
  const rankedLabel =
    typeof set.ranked_date === 'string' && set.ranked_date !== ''
      ? set.ranked_date.slice(0, 10)
      : ''
  return {
    beatmapsetId: set.id,
    beatmapId: diff.id,
    title: set.title ?? '',
    artist: set.artist ?? '',
    creator: set.creator ?? '',
    version: diff.version ?? '',
    cover: set.covers?.card ?? set.covers?.cover,
    sr: diff.difficulty_rating,
    srMin: Math.min(...srs),
    srMax: Math.max(...srs),
    bpm: diff.bpm ?? 0,
    lengthSec: diff.total_length ?? 0,
    cs: diff.cs ?? 0,
    ar: diff.ar ?? 0,
    od: diff.od ?? 0,
    tags: splitTags(set.tags),
    status: set.status ?? '',
    playCount: set.play_count ?? 0,
    favouriteCount: set.favourite_count ?? 0,
    popularity: 0,
    score: 0,
    ppPotential: 0,
    reason: rankedLabel ? `Ranked ${rankedLabel}` : '',
  }
}

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

export interface RankedEntry {
  candidate: RecCandidate
  rank: number
  /** ISO ranked date of the set (window membership proof). */
  rankedDate: string
}

export interface RankedCompilation {
  entries: RankedEntry[]
  /** True when the page cap hit before the window start was
   *  reached: the list may be missing in-window sets and must be
   *  labelled partial in the UI, never presented as definitive. */
  partial: boolean
  /** Search sets examined (for diagnostics/copy, not displayed). */
  scanned: number
  /** Inclusive window start, ISO string. */
  windowStart: string
}

/** One search page; injectable so tests drive the scan without live calls. */
export type RankedPageFetcher = (
  cursor: string | null | undefined,
) => Promise<SearchPage>

function parseRankedDate(raw: unknown): number | null {
  if (typeof raw !== 'string' || raw === '') return null
  const ms = Date.parse(raw)
  return Number.isFinite(ms) ? ms : null
}

export async function compileRankedList(opts: {
  mode: GameMode
  window: RankedWindow
  now?: number
  fetchPage: RankedPageFetcher
}): Promise<RankedCompilation> {
  const now = opts.now ?? Date.now()
  const windowStartMs = now - opts.window.days * 24 * 60 * 60 * 1000
  const collected = new Map<number, { set: SearchBeatmapset; rankedMs: number }>()
  let cursor: string | null | undefined
  let pages = 0
  let scanned = 0
  let reachedStart = false
  let exhausted = false

  while (pages < RANKED_SCAN_MAX_PAGES) {
    const page = await opts.fetchPage(cursor)
    pages += 1
    // The whole page is processed even after an out-of-window set
    // appears: sort order is newest-ranked-first, but in-page
    // noise must not drop an in-window set sitting later in the
    // same page. The scan stops AFTER the page is processed.
    for (const set of page.beatmapsets ?? []) {
      if (!set || typeof set.id !== 'number' || collected.has(set.id)) continue
      scanned += 1
      const rankedMs = parseRankedDate(set.ranked_date)
      if (rankedMs === null) continue
      if (rankedMs >= windowStartMs) {
        collected.set(set.id, { set, rankedMs })
      } else {
        reachedStart = true
      }
    }
    if (reachedStart) break
    const next = page.cursor_string ?? null
    if (!next) {
      exhausted = true
      break
    }
    cursor = next
  }

  const partial = !reachedStart && !exhausted && pages >= RANKED_SCAN_MAX_PAGES

  // Play-count sort AFTER window filtering — never search order.
  // Ties: newer ranked first, then higher set id (deterministic).
  const ranked = [...collected.values()]
    .map(({ set, rankedMs }) => {
      const candidate = rankedSetToCandidate(set, opts.mode)
      return candidate ? { candidate, rankedMs } : null
    })
    .filter((e): e is { candidate: RecCandidate; rankedMs: number } => e !== null)
    .sort(
      (a, b) =>
        b.candidate.playCount - a.candidate.playCount ||
        b.rankedMs - a.rankedMs ||
        b.candidate.beatmapsetId - a.candidate.beatmapsetId,
    )
    .slice(0, RANKED_TOP_N)
    .map(({ candidate, rankedMs }, i) => ({
      candidate,
      rank: i + 1,
      rankedDate: new Date(rankedMs).toISOString(),
    }))

  return {
    entries: ranked,
    partial,
    scanned,
    windowStart: new Date(windowStartMs).toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Wiring: proxy paging + client cache
// ---------------------------------------------------------------------------

function normalizePage(page: unknown): SearchPage {
  if (!page || typeof page !== 'object' || !Array.isArray((page as SearchPage).beatmapsets)) {
    const total =
      page && typeof page === 'object' && typeof (page as SearchPage).total === 'number'
        ? (page as SearchPage).total
        : undefined
    return { beatmapsets: [], cursor_string: null, total }
  }
  return page as SearchPage
}

export async function fetchRankedPage(
  mode: GameMode,
  cursor: string | null | undefined,
): Promise<SearchPage> {
  return normalizePage(
    await proxyCall<SearchPage>('searchBeatmapsets', {
      mode,
      cursor_string: cursor ?? undefined,
      filters: { status: 'ranked', sort: 'ranked_desc' },
    }),
  )
}

export function rankedCompilationCacheKey(mode: GameMode, windowId: RankedWindowId): string {
  return JSON.stringify(['ranked-compilation', mode, windowId])
}

/**
 * Cached compilation: dataCache (in-memory, per the cache's own
 * contract) keyed by mode+window, TTL per window. `fresh` bypasses
 * the cache read (manual refresh) and overwrites the entry.
 */
export async function fetchRankedCompilation(
  mode: GameMode,
  window: RankedWindow,
  opts: { fresh?: boolean; now?: number } = {},
): Promise<RankedCompilation> {
  const key = rankedCompilationCacheKey(mode, window.id)
  if (!opts.fresh) {
    const hit = dataCache.get<RankedCompilation>(key)
    if (hit) return hit
  }
  const compiled = await compileRankedList({
    mode,
    window,
    now: opts.now,
    fetchPage: (cursor) => fetchRankedPage(mode, cursor),
  })
  dataCache.set(key, compiled, window.ttlMs)
  return compiled
}

// ---------------------------------------------------------------------------
// Save the whole compilation as one user list (M5 lists)
// ---------------------------------------------------------------------------

export function rankedListName(mode: GameMode, window: RankedWindow): string {
  return `Top 50 Ranked — ${modeLabel(mode)} — ${window.listLabel}`
}

/**
 * Save all entries as one list. A list with the exact same name is
 * reused and only missing sets are added (the upsert in addToList
 * would dedupe anyway, but the counts reported back must be
 * honest: added vs already-there). Throws with the lists
 * service's message on failure — callers show it, never a fake
 * success.
 */
export async function saveCompilationAsList(
  client: SupabaseClient | null,
  userId: string,
  opts: { name: string; mode: GameMode; entries: RankedEntry[] },
): Promise<{ listName: string; added: number; alreadyHad: number; total: number }> {
  const lists = await loadLists(client, userId)
  let list = lists.find((l) => l.name === opts.name) ?? null
  if (!list) {
    list = await createList(client, userId, opts.name)
  }
  const existing = await loadListItems(client, list.id)
  const have = new Set(existing.map((i) => i.beatmapset_id))
  let added = 0
  for (const entry of opts.entries) {
    if (have.has(entry.candidate.beatmapsetId)) continue
    await addToList(client, {
      listId: list.id,
      beatmapsetId: entry.candidate.beatmapsetId,
      beatmapId: entry.candidate.beatmapId,
      mode: opts.mode,
    })
    added += 1
  }
  return {
    listName: list.name,
    added,
    alreadyHad: opts.entries.length - added,
    total: opts.entries.length,
  }
}
