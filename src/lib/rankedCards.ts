import type { SupabaseClient } from '@supabase/supabase-js'
import {
  RANKED_WINDOWS,
  fetchRankedCompilationForInterval,
  type RankedCompilation,
  type RankedWindow,
  type RankedWindowId,
} from './rankedLists'
import type { GameMode } from './mode'
import { modeLabel } from './mode'

/**
 * Ranked period cards (§AN): the Collections ranked section no
 * longer shows one live-compiled list per window. The week view
 * stays one list; the month view shows 4 cards (the 4 weeks of
 * the CURRENT calendar month) and the year view 12 cards (the 12
 * months of the CURRENT calendar year). Cards follow the global
 * mode like the lists did. Each card opens a detail page with
 * that period's song list.
 *
 * PERIOD MATH (UTC): ranked dates arrive as UTC ISO strings, so
 * calendar boundaries are computed in UTC — the same instant
 * means the same card everywhere, and tests can pin the
 * boundaries exactly. Month weeks split 1–7 / 8–14 / 15–21 /
 * 22–last-day; a week or month that has not started yet still
 * gets a card, and its compile is one cheap page (every set is
 * older than the interval start, so the scan stops at once).
 */

export type RankedGranularity = RankedWindowId

export interface RankedPeriodCard {
  granularity: RankedGranularity
  /**
   * Stable period key: 'current' for the rolling week,
   * 'YYYY-MM-wN' for a month week, 'YYYY-MM' for a year month.
   * Part of the DB row key and the detail-page route.
   */
  period: string
  label: string
  startMs: number
  endMs: number
  window: RankedWindow
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function windowFor(id: RankedWindowId): RankedWindow {
  return RANKED_WINDOWS.find((w) => w.id === id) ?? RANKED_WINDOWS[0]
}

/** The rolling 7-day week as a single card (period 'current'). */
export function weekCard(nowMs: number): RankedPeriodCard {
  const window = windowFor('week')
  return {
    granularity: 'week',
    period: 'current',
    label: 'This week',
    startMs: nowMs - window.days * 24 * 60 * 60 * 1000,
    endMs: nowMs,
    window,
  }
}

/** The 4 weeks of the calendar month containing `nowMs` (UTC). */
export function weeksOfMonth(nowMs: number): RankedPeriodCard[] {
  const now = new Date(nowMs)
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const window = windowFor('month')
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const starts = [1, 8, 15, 22]
  return starts.map((startDay, i) => {
    // Weeks 1–3 are 7 days; week 4 runs to the month end (which
    // is 8–10 days in a 30/31-day month, 7 in February).
    const endDay = i === starts.length - 1 ? lastDay : startDay + 6
    return {
      granularity: 'month' as const,
      period: `${year}-${pad2(month + 1)}-w${i + 1}`,
      label: `Week ${i + 1} · ${MONTH_SHORT[month]} ${startDay}–${endDay}`,
      startMs: Date.UTC(year, month, startDay),
      endMs: Date.UTC(year, month, endDay + 1),
      window,
    }
  })
}

/** The 12 months of the calendar year containing `nowMs` (UTC). */
export function monthsOfYear(nowMs: number): RankedPeriodCard[] {
  const year = new Date(nowMs).getUTCFullYear()
  const window = windowFor('year')
  return Array.from({ length: 12 }, (_, m) => ({
    granularity: 'year' as const,
    period: `${year}-${pad2(m + 1)}`,
    label: `${MONTH_FULL[m]} ${year}`,
    startMs: Date.UTC(year, m, 1),
    endMs: Date.UTC(year, m + 1, 1),
    window,
  }))
}

/** All cards for a window: week → 1, month → 4, year → 12. */
export function rankedCardsForWindow(
  windowId: RankedWindowId,
  nowMs: number,
): RankedPeriodCard[] {
  if (windowId === 'month') return weeksOfMonth(nowMs)
  if (windowId === 'year') return monthsOfYear(nowMs)
  return [weekCard(nowMs)]
}

/**
 * Rebuild a card from its period key (detail-page routes, old
 * bookmarks): the key carries the calendar period, so a card
 * from a past month/year still resolves after the current
 * month/year has moved on. Returns null for an unparseable key.
 * 'current' (the rolling week) resolves against `nowMs`.
 */
export function cardFromPeriod(
  granularity: RankedGranularity,
  period: string,
  nowMs: number,
): RankedPeriodCard | null {
  if (granularity === 'week') {
    return period === 'current' ? weekCard(nowMs) : null
  }
  if (granularity === 'month') {
    const m = /^(\d{4})-(\d{2})-w([1-4])$/.exec(period)
    if (!m) return null
    const year = Number(m[1])
    const month = Number(m[2]) - 1
    const weekIndex = Number(m[3]) - 1
    if (month < 0 || month > 11) return null
    const cards = weeksOfMonth(Date.UTC(year, month, 15))
    return cards[weekIndex] ?? null
  }
  const m = /^(\d{4})-(\d{2})$/.exec(period)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2]) - 1
  if (month < 0 || month > 11) return null
  return monthsOfYear(Date.UTC(year, month, 15))[month] ?? null
}

/** Saved-list name for one card's compilation. */
export function rankedCardListName(mode: GameMode, card: RankedPeriodCard): string {
  return `Top 50 Ranked — ${modeLabel(mode)} — ${card.label}`
}

// ---------------------------------------------------------------------------
// Database-backed storage (migration 003)
// ---------------------------------------------------------------------------

export const RANKED_COMPILATIONS_TABLE = 'ranked_compilations'

/** Shown when a card has nothing cached and the live compile fails. */
export const RANKED_CARD_COMPILE_ERROR =
  'Could not compile this list just now — osu! or the proxy may be busy.'

export interface StoredRankedCompilation {
  compilation: RankedCompilation
  /** ms since epoch when the row was compiled. */
  compiledAtMs: number
}

function asStoredRow(row: unknown): StoredRankedCompilation | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  if (!Array.isArray(r.entries)) return null
  const compiledAtMs = typeof r.compiled_at === 'string' ? Date.parse(r.compiled_at) : NaN
  if (!Number.isFinite(compiledAtMs)) return null
  const entries = r.entries as RankedCompilation['entries']
  // A stored row with a malformed entry is treated as missing —
  // the caller recompiles instead of showing invented rows.
  if (!entries.every((e) => e && typeof e === 'object' && e.candidate && typeof e.candidate.beatmapsetId === 'number')) {
    return null
  }
  return {
    compilation: {
      entries,
      partial: r.partial === true,
      scanned: typeof r.scanned === 'number' ? r.scanned : 0,
      windowStart: typeof r.window_start === 'string' ? r.window_start : new Date(compiledAtMs).toISOString(),
    },
    compiledAtMs,
  }
}

/** Read one stored card. Null client (demo/unconfigured) or a
 *  missing/malformed row reads as "not stored" — never an error. */
export async function loadStoredCompilation(
  client: SupabaseClient | null,
  mode: GameMode,
  granularity: RankedGranularity,
  period: string,
): Promise<StoredRankedCompilation | null> {
  if (!client) return null
  try {
    const { data, error } = await client
      .from(RANKED_COMPILATIONS_TABLE)
      .select('entries,partial,scanned,window_start,compiled_at')
      .eq('mode', mode)
      .eq('granularity', granularity)
      .eq('period', period)
      .maybeSingle()
    if (error || !data) return null
    return asStoredRow(data)
  } catch {
    return null
  }
}

/** Store (upsert) one card's compilation. Best-effort: returns
 *  false when the client is null, the user is a guest (RLS allows
 *  inserts for signed-in users only), or the write fails — the
 *  caller keeps the in-memory compilation either way. */
export async function storeCompilation(
  client: SupabaseClient | null,
  mode: GameMode,
  granularity: RankedGranularity,
  period: string,
  compilation: RankedCompilation,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!client) return false
  try {
    const { error } = await client
      .from(RANKED_COMPILATIONS_TABLE)
      .upsert(
        {
          mode,
          granularity,
          period,
          entries: compilation.entries,
          partial: compilation.partial,
          scanned: compilation.scanned,
          window_start: compilation.windowStart,
          compiled_at: new Date(nowMs).toISOString(),
        },
        { onConflict: 'mode,granularity,period' },
      )
    return !error
  } catch {
    return false
  }
}

/** Freshness: compiled within the window's TTL. */
export function isCompilationFresh(
  compiledAtMs: number,
  ttlMs: number,
  nowMs: number,
): boolean {
  return Number.isFinite(compiledAtMs) && nowMs - compiledAtMs < ttlMs
}

/** Live-compile one card (used when its row is missing or stale).
 *  Goes through the in-memory dataCache too, so a card compiled
 *  moments ago in this session is not scanned twice. */
export async function compileCardCompilation(
  mode: GameMode,
  card: RankedPeriodCard,
  opts: { fresh?: boolean; now?: number } = {},
): Promise<RankedCompilation> {
  return fetchRankedCompilationForInterval(
    mode,
    card.window,
    card.startMs,
    card.endMs,
    opts,
  )
}
