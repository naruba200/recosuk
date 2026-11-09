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
 * Ranked period cards (§AN, rolling in §AO): the Collections ranked
 * section no longer shows one live-compiled list per window. The week
 * view stays one list; the month view shows 4 cards (the TRAILING
 * 4 calendar weeks — e.g. on 2026-11-09: weeks 3–4 of October plus
 * weeks 1–2 of November) and the year view 12 cards (the TRAILING
 * 12 calendar months — e.g. December 2025 through November 2026).
 * Cards follow the global mode like the lists did. Each card opens
 * a detail page with that period's song list.
 *
 * PERIOD MATH (UTC): ranked dates arrive as UTC ISO strings, so
 * calendar boundaries are computed in UTC — the same instant
 * means the same card everywhere, and tests can pin the
 * boundaries exactly. A calendar month-week splits 1–7 / 8–14 /
 * 15–21 / 22–last-day. The trailing windows are computed from
 * `nowMs` on every visit, so the card set itself rolls forward
 * as the date changes — no background worker, no stored card
 * list to advance.
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

/** One calendar month-week (1–7 / 8–14 / 15–21 / 22–last-day, UTC). */
export function monthWeekCard(
  year: number,
  month: number,
  weekIndex: number,
): RankedPeriodCard {
  const window = windowFor('month')
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const starts = [1, 8, 15, 22]
  const startDay = starts[weekIndex]
  // Weeks 1–3 are 7 days; week 4 runs to the month end (which
  // is 8–10 days in a 30/31-day month, 7 in February).
  const endDay = weekIndex === starts.length - 1 ? lastDay : startDay + 6
  return {
    granularity: 'month' as const,
    period: `${year}-${pad2(month + 1)}-w${weekIndex + 1}`,
    label: `Week ${weekIndex + 1} · ${MONTH_SHORT[month]} ${startDay}–${endDay}`,
    startMs: Date.UTC(year, month, startDay),
    endMs: Date.UTC(year, month, endDay + 1),
    window,
  }
}

/** One calendar month (UTC). */
export function monthCard(year: number, month: number): RankedPeriodCard {
  const window = windowFor('year')
  return {
    granularity: 'year' as const,
    period: `${year}-${pad2(month + 1)}`,
    label: `${MONTH_FULL[month]} ${year}`,
    startMs: Date.UTC(year, month, 1),
    endMs: Date.UTC(year, month + 1, 1),
    window,
  }
}

/**
 * The TRAILING 4 calendar month-weeks ending at `nowMs` (§AO):
 * the 4 most recent weeks whose start is at or before now, oldest
 * first. A week that has just started counts (its interval is
 * mostly future, but its ranked maps so far are real). Two months
 * of candidates always hold at least 5 started weeks (the current
 * month contributes ≥1, the previous month 4), so the take-last-4
 * never runs dry.
 */
export function trailingWeeks(nowMs: number): RankedPeriodCard[] {
  const now = new Date(nowMs)
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const candidates: RankedPeriodCard[] = []
  for (let m = month - 1; m <= month; m += 1) {
    const y = m < 0 ? year - 1 : year
    const mm = (m + 12) % 12
    for (let w = 0; w < 4; w += 1) candidates.push(monthWeekCard(y, mm, w))
  }
  return candidates
    .filter((c) => c.startMs <= nowMs)
    .sort((a, b) => a.startMs - b.startMs)
    .slice(-4)
}

/**
 * The TRAILING 12 calendar months ending at `nowMs` (§AO): the
 * current month plus the 11 before it, oldest first.
 */
export function trailingMonths(nowMs: number): RankedPeriodCard[] {
  const now = new Date(nowMs)
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const cards: RankedPeriodCard[] = []
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(year, month - i, 1))
    cards.push(monthCard(d.getUTCFullYear(), d.getUTCMonth()))
  }
  return cards
}

/** All cards for a window: week → 1, month → trailing 4 weeks, year → trailing 12 months. */
export function rankedCardsForWindow(
  windowId: RankedWindowId,
  nowMs: number,
): RankedPeriodCard[] {
  if (windowId === 'month') return trailingWeeks(nowMs)
  if (windowId === 'year') return trailingMonths(nowMs)
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
    return monthWeekCard(year, month, weekIndex)
  }
  const m = /^(\d{4})-(\d{2})$/.exec(period)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2]) - 1
  if (month < 0 || month > 11) return null
  return monthCard(year, month)
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

/** Read one stored card. Null client (unconfigured) or a
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

/**
 * Hide rule (§AO): a compilation is UNREACHABLE when the scan
 * stopped early (partial — the page cap hit before the interval
 * start was reached) AND collected nothing. The interval sits
 * beyond the scan's reach, so showing "0 maps" is noise; the
 * card is hidden instead. A failed compile stores nothing (no
 * row), so it can never be mistaken for unreachable — and a
 * transient failure still shows an error, never a silent hide.
 * An unreachable row never becomes reachable (its interval only
 * gets older), so callers must NOT recompile it on TTL expiry.
 */
export function isUnreachableCompilation(
  compilation: RankedCompilation | null | undefined,
): boolean {
  return (
    !!compilation && compilation.entries.length === 0 && compilation.partial === true
  )
}

export interface StoredHistoryEntry {
  granularity: RankedGranularity
  period: string
  label: string
  entryCount: number
  partial: boolean
  compiledAtMs: number
  windowStartMs: number
}

/**
 * History (§AO): the stored compilations for one mode, newest
 * period first. Returns null when the read fails (no client, or
 * the table does not exist yet — migration 003 not run): the
 * caller shows the honest "history needs the migration" note,
 * not an empty list. Rows with no entries (unreachable cards)
 * are not history — they are skipped. Capped at 200 rows; the
 * entries payload is read only to count it.
 */
export async function listStoredCompilations(
  client: SupabaseClient | null,
  mode: GameMode,
): Promise<StoredHistoryEntry[] | null> {
  if (!client) return null
  try {
    const { data, error } = await client
      .from(RANKED_COMPILATIONS_TABLE)
      .select('granularity,period,entries,partial,window_start,compiled_at')
      .eq('mode', mode)
      .order('window_start', { ascending: false })
      .limit(200)
    if (error || !Array.isArray(data)) return null
    const rows: StoredHistoryEntry[] = []
    for (const row of data as Record<string, unknown>[]) {
      if (typeof row.period !== 'string') continue
      if (!Array.isArray(row.entries) || row.entries.length === 0) continue
      const granularity = row.granularity as RankedGranularity
      const card = cardFromPeriod(granularity, row.period, Date.now())
      const compiledAtMs =
        typeof row.compiled_at === 'string' ? Date.parse(row.compiled_at) : NaN
      const windowStartMs =
        typeof row.window_start === 'string' ? Date.parse(row.window_start) : NaN
      rows.push({
        granularity,
        period: row.period,
        label: card ? card.label : row.period,
        entryCount: row.entries.length,
        partial: row.partial === true,
        compiledAtMs: Number.isFinite(compiledAtMs) ? compiledAtMs : 0,
        windowStartMs: Number.isFinite(windowStartMs) ? windowStartMs : 0,
      })
    }
    return rows
  } catch {
    return null
  }
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
