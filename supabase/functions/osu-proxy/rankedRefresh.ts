// RecOsuk ranked refresh (§AO) — shared pure helpers for the
// `refreshRanked` Edge Function action (nightly auto-update job).
//
// DEPENDENCY-FREE BY DESIGN: no Deno globals, no imports, no
// I/O. The Deno function imports this file relatively
// (`./rankedRefresh.ts`), and the client test suite imports it
// too — the cross-check tests in
// src/lib/__tests__/rankedRefresh.test.ts run this module against
// src/lib/rankedCards.ts / src/lib/rankedLists.ts on identical
// inputs, so the two implementations cannot drift silently: the
// tests are the drift guard.
//
// What lives here:
//  - `checkRefreshToken` — the shared-secret gate for refreshRanked.
//  - `resolveRefreshInterval` — (granularity, period) → [start, end),
//    the same UTC calendar math as `cardFromPeriod` in rankedCards.
//  - `scanRankedInterval` — the ranked-scan paging loop: newest-
//    ranked-first pages, skip sets newer than the interval end,
//    collect in-window sets, stop at the first set older than the
//    interval start. Same 20-page cap, same partial rule as the
//    client compile (`compileRankedList`). The caller maps collected
//    sets to entries and sorts by play count (that mapping lives
//    with each caller — the client has rankedSetToCandidate, the
//    function mirrors it, and the cross-check tests pin them to
//    the same fixtures).

// ---------------------------------------------------------------------------
// Shared-secret gate
// ---------------------------------------------------------------------------

/**
 * Constant-time-ish comparison for the refresh token: a missing or
 * empty token on either side never matches, and the loop never
 * exits early on a mismatch (so a wrong token costs the same
 * work as a right one). Returns false for non-string inputs.
 */
export function checkRefreshToken(
  provided: unknown,
  expected: unknown,
): boolean {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false
  if (provided.length === 0 || expected.length === 0) return false
  if (provided.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

// ---------------------------------------------------------------------------
// Interval resolution (mirror of cardFromPeriod / weekCard)
// ---------------------------------------------------------------------------

export type RefreshGranularity = 'week' | 'month' | 'year'

export interface RefreshInterval {
  startMs: number
  endMs: number
}

/**
 * Resolve (granularity, period) to its [startMs, endMs) interval
 * (UTC), or null for an unparseable key. The keys are the same
 * ones the client uses: 'current' for the rolling week,
 * 'YYYY-MM-wN' for a month week, 'YYYY-MM' for a year month.
 * A week or month that has not started yet still resolves — its
 * compile is one cheap page (every set is older than the start).
 */
export function resolveRefreshInterval(
  granularity: string,
  period: string,
  nowMs: number,
): RefreshInterval | null {
  if (granularity === 'week') {
    if (period !== 'current') return null
    return { startMs: nowMs - 7 * 24 * 60 * 60 * 1000, endMs: nowMs }
  }
  if (granularity === 'month') {
    const m = /^(\d{4})-(\d{2})-w([1-4])$/.exec(period)
    if (!m) return null
    const year = Number(m[1])
    const month = Number(m[2]) - 1
    const weekIndex = Number(m[3]) - 1
    if (month < 0 || month > 11) return null
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    const starts = [1, 8, 15, 22]
    const startDay = starts[weekIndex]
    const endDay = weekIndex === starts.length - 1 ? lastDay : startDay + 6
    return {
      startMs: Date.UTC(year, month, startDay),
      endMs: Date.UTC(year, month, endDay + 1),
    }
  }
  if (granularity === 'year') {
    const m = /^(\d{4})-(\d{2})$/.exec(period)
    if (!m) return null
    const year = Number(m[1])
    const month = Number(m[2]) - 1
    if (month < 0 || month > 11) return null
    return { startMs: Date.UTC(year, month, 1), endMs: Date.UTC(year, month + 1, 1) }
  }
  return null
}

// ---------------------------------------------------------------------------
// Candidate mapping + full compile pipeline
// ---------------------------------------------------------------------------
//
// The function needs the same entries the client renders
// (RankedEntry: candidate + rank + rankedDate), so the mapping
// from a search set to a row candidate lives here too — a mirror
// of `rankedSetToCandidate` in src/lib/rankedLists.ts. The
// cross-check tests run both mappers on identical fixtures and
// assert identical candidates, so a change to one without the
// other fails the suite instead of drifting silently.

export interface RefreshDifficulty {
  id: number
  mode: string
  version?: string
  difficulty_rating: number
  bpm?: number
  total_length?: number
  cs?: number
  ar?: number
  od?: number
  checksum?: string
  last_updated?: string
}

export interface RefreshSet {
  id: number
  title?: string
  artist?: string
  creator?: string
  status?: string
  play_count?: number
  favourite_count?: number
  ranked_date?: string | null
  tags?: string
  covers?: { card?: string; cover?: string }
  beatmaps?: RefreshDifficulty[]
}

/** Row candidate, shaped exactly like the client's RecCandidate. */
export interface RefreshCandidate {
  beatmapsetId: number
  beatmapId: number
  title: string
  artist: string
  creator: string
  version: string
  cover?: string
  sr: number
  srMin: number
  srMax: number
  difficulties: Array<{
    beatmapId: number
    mode: string
    checksum?: string
    lastUpdated?: string
  }>
  bpm: number
  lengthSec: number
  cs: number
  ar: number
  od: number
  tags: string[]
  status: string
  playCount: number
  favouriteCount: number
  popularity: number
  score: number
  ppPotential: number
  reason: string
}

export interface RefreshEntry {
  candidate: RefreshCandidate
  rank: number
  rankedDate: string
}

/** Same rule as the client's splitTags: lowercase, split on
 *  whitespace/commas, drop empties. */
export function refreshSplitTags(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .toLowerCase()
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

/**
 * Convert a search set to a row candidate. The representative
 * difficulty is the MEDIAN star rating among the set's in-mode
 * difficulties; SR range, tags, play/favourite counts follow the
 * client rules. Null when the set has no playable difficulty in
 * the mode — the set is excluded, never faked.
 */
export function refreshSetToCandidate(
  set: RefreshSet,
  mode: string,
): RefreshCandidate | null {
  if (!set || typeof set.id !== 'number') return null
  const inMode = (set.beatmaps ?? []).filter(
    (b): b is RefreshDifficulty =>
      !!b &&
      b.mode === mode &&
      typeof b.id === 'number' &&
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
    difficulties: inMode.map((b) => ({
      beatmapId: b.id,
      mode,
      checksum:
        typeof b.checksum === 'string' && b.checksum !== '' ? b.checksum : undefined,
      lastUpdated:
        typeof b.last_updated === 'string' && b.last_updated !== '' ? b.last_updated : undefined,
    })),
    bpm: diff.bpm ?? 0,
    lengthSec: diff.total_length ?? 0,
    cs: diff.cs ?? 0,
    ar: diff.ar ?? 0,
    od: diff.od ?? 0,
    tags: refreshSplitTags(set.tags),
    status: set.status ?? '',
    playCount: set.play_count ?? 0,
    favouriteCount: set.favourite_count ?? 0,
    popularity: 0,
    score: 0,
    ppPotential: 0,
    reason: rankedLabel ? `Ranked ${rankedLabel}` : '',
  }
}

/** Top-N entries per compilation, same as the client. */
export const REFRESH_TOP_N = 50

/**
 * Full compile: scan the interval, map collected sets to
 * candidates, sort by play count AFTER window filtering (ties:
 * newer ranked first, then higher set id), take the top 50.
 * Returns the same shape the client stores in ranked_compilations.
 */
export async function compileRefreshCompilation(opts: {
  mode: string
  startMs: number
  endMs: number | null
  fetchPage: RefreshPageFetcher<RefreshSet>
}): Promise<{
  entries: RefreshEntry[]
  partial: boolean
  scanned: number
  windowStart: string
  seeded: boolean
  seedIgnored: boolean
}> {
  const scan = await scanRankedInterval({
    startMs: opts.startMs,
    endMs: opts.endMs,
    // Seeded scan (§AO item 8) — same rule as the client compile:
    // start at the window end so a past interval is reached
    // directly instead of paging from the newest set.
    seedCursor: opts.endMs !== null ? buildSeedCursor(opts.endMs) : undefined,
    fetchPage: opts.fetchPage,
  })
  const ranked = scan.collected
    .map(({ set, rankedMs }) => {
      const candidate = refreshSetToCandidate(set, opts.mode)
      return candidate ? { candidate, rankedMs } : null
    })
    .filter((e): e is { candidate: RefreshCandidate; rankedMs: number } => e !== null)
    .sort(
      (a, b) =>
        b.candidate.playCount - a.candidate.playCount ||
        b.rankedMs - a.rankedMs ||
        b.candidate.beatmapsetId - a.candidate.beatmapsetId,
    )
    .slice(0, REFRESH_TOP_N)
    .map(({ candidate, rankedMs }, i) => ({
      candidate,
      rank: i + 1,
      rankedDate: new Date(rankedMs).toISOString(),
    }))
  return {
    entries: ranked,
    partial: scan.partial,
    scanned: scan.scanned,
    windowStart: scan.windowStart,
    seeded: scan.seeded,
    seedIgnored: scan.seedIgnored,
  }
}

// ---------------------------------------------------------------------------
// Scan loop (mirrors the client compile — see compileRankedList)
// ---------------------------------------------------------------------------

/** Scan cap: 20 search pages, same as the client compile. */
export const REFRESH_SCAN_MAX_PAGES = 20

export interface RefreshScanSet {
  id: number
  ranked_date?: string | null
}

export interface RefreshScanPage<TSet extends RefreshScanSet = RefreshScanSet> {
  beatmapsets: TSet[]
  cursor_string?: string | null
}

export type RefreshPageFetcher<TSet extends RefreshScanSet = RefreshScanSet> = (
  cursor: string | null | undefined,
) => Promise<RefreshScanPage<TSet>>

export type RefreshScanStop = 'reached-start' | 'exhausted' | 'cap-hit'

export interface RefreshScanResult<TSet extends RefreshScanSet = RefreshScanSet> {
  /** In-window sets, with their ranked instant (window proof). */
  collected: Array<{ set: TSet; rankedMs: number }>
  /** True when the page cap hit before the window start was
   *  reached: the list may be missing in-window sets. */
  partial: boolean
  /** Search sets examined (diagnostics, not displayed). */
  scanned: number
  /** Sets skipped for being newer than the interval end. */
  skippedNewer: number
  pages: number
  stop: RefreshScanStop
  /** True when a seed cursor was used for the first page. */
  seeded: boolean
  /** True when the first (seeded) page held a set newer than the
   *  interval end — the API ignored the seed and served the
   *  unseeded newest page. The compile still works, but the
   *  hide rule could then eat a reachable card. */
  seedIgnored: boolean
  /** Inclusive window start, ISO string. */
  windowStart: string
}

function parseRankedDate(raw: unknown): number | null {
  if (typeof raw !== 'string' || raw === '') return null
  const ms = Date.parse(raw)
  return Number.isFinite(ms) ? ms : null
}

/** Same helper as `buildSeedCursor` in `src/lib/rankedLists.ts`
 *  (the two files cannot share an import — the Edge Function is
 *  deployed from its own directory). The cross-check test
 *  `seededScanMatchesFunction` pins them equal. */
export function buildSeedCursor(endMs: number): string {
  return btoa(JSON.stringify({ approved_date: endMs, id: 0 })).replace(/=+$/, '')
}

/**
 * Page osu! search newest-ranked-first over [startMs, endMs):
 * skip sets newer than endMs, collect sets at/after startMs,
 * stop at the first set older than startMs. The whole page is
 * processed even after an out-of-window set appears (in-page
 * noise must not drop an in-window set sitting later in the
 * same page); the scan stops AFTER the page is processed.
 * The window start is INCLUSIVE — a set ranked exactly at the
 * start instant belongs to the window. Sets with a missing or
 * unparseable ranked date are excluded but do NOT stop the scan.
 */
export async function scanRankedInterval<TSet extends RefreshScanSet>(opts: {
  startMs: number
  endMs: number | null
  /** First cursor handed to the fetcher. The caller seeds it at
   *  `endMs` (see `buildSeedCursor`) so a past interval is
   *  reached directly instead of paging from the newest set. */
  seedCursor?: string | null
  fetchPage: RefreshPageFetcher<TSet>
  maxPages?: number
}): Promise<RefreshScanResult<TSet>> {
  const maxPages = opts.maxPages ?? REFRESH_SCAN_MAX_PAGES
  const seeded = opts.seedCursor != null
  const collected = new Map<number, { set: TSet; rankedMs: number }>()
  let cursor: string | null | undefined = opts.seedCursor ?? undefined
  let pages = 0
  let scanned = 0
  let skippedNewer = 0
  let reachedStart = false
  let exhausted = false
  let seedIgnored = false

  while (pages < maxPages) {
    const page = await opts.fetchPage(cursor)
    pages += 1
    for (const set of page.beatmapsets ?? []) {
      if (!set || typeof set.id !== 'number' || collected.has(set.id)) continue
      scanned += 1
      const rankedMs = parseRankedDate(set.ranked_date)
      if (rankedMs === null) continue
      if (opts.endMs !== null && rankedMs >= opts.endMs) {
        skippedNewer += 1
        if (seeded && pages === 1) seedIgnored = true
        continue
      }
      if (rankedMs >= opts.startMs) {
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

  const partial = !reachedStart && !exhausted && pages >= maxPages
  return {
    collected: [...collected.values()],
    partial,
    scanned,
    skippedNewer,
    pages,
    stop: reachedStart ? 'reached-start' : exhausted ? 'exhausted' : 'cap-hit',
    seeded,
    seedIgnored,
    windowStart: new Date(opts.startMs).toISOString(),
  }
}
