/**
 * Type declarations for the nightly refresh script
 * (`scripts/nightly-ranked-refresh.mjs`, §AO item 9). The script
 * is plain Node (no deps) and ships untyped; this file exists
 * only so `tsc -b` can check `nightlyRefresh.test.ts`. If the
 * script's exports change, update this file in the same commit.
 */

export interface RefreshCard {
  mode: string
  granularity: string
  period: string
  ttlMs: number
}

export interface StoredRefreshRow {
  mode: string
  granularity: string
  period: string
  entries: unknown[]
  partial: boolean
  compiled_at: string
}

export interface RefreshSummary {
  refreshed: number
  skipped: number
  failed: Array<{
    mode: string
    granularity: string
    period: string
    error: string
  }>
}

export const GAME_MODES: string[]
export const RANKED_TTLS: Record<string, number>

export function listCurrentCards(nowMs: number): RefreshCard[]
export function trailingWeekPeriods(nowMs: number): string[]
export function trailingMonthPeriods(nowMs: number): string[]
export function selectStaleCards(
  cards: RefreshCard[],
  stored: StoredRefreshRow[],
  nowMs: number,
): RefreshCard[]
export function main(opts: {
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>
  env: Record<string, string | undefined>
  nowMs: number
  log: (message: string) => void
}): Promise<RefreshSummary>
