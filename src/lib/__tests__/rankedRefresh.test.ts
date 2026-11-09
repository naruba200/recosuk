import { describe, expect, it } from 'vitest'
import {
  RANKED_SCAN_MAX_PAGES,
  RANKED_WINDOWS,
  buildSeedCursor as buildClientSeedCursor,
  compileRankedList,
  rankedSetToCandidate,
} from '../rankedLists'
import { cardFromPeriod, weekCard } from '../rankedCards'
import {
  buildSeedCursor as buildFunctionSeedCursor,
  checkRefreshToken,
  compileRefreshCompilation,
  refreshSetToCandidate,
  resolveRefreshInterval,
  scanRankedInterval,
} from '../../../supabase/functions/osu-proxy/rankedRefresh'
import type { SearchBeatmapset, SearchPage } from '../recommend'
import type { GameMode } from '../mode'

/**
 * §AO — drift guard for the nightly refresh job. The Edge
 * Function (`refreshRanked`) cannot import the client, so the
 * scan loop, the interval math, and the candidate mapping exist
 * twice: once in src/lib (rankedCards/rankedLists) and once in
 * supabase/functions/osu-proxy/rankedRefresh.ts. These tests run
 * both implementations on IDENTICAL inputs and assert identical
 * outputs — a change to one without the other fails the suite
 * instead of drifting silently.
 */

/** Fixed "now": 2026-11-09T12:00:00Z. */
const NOW = Date.parse('2026-11-09T12:00:00.000Z')

function diff(id: number, mode: string, sr: number) {
  return { id, mode, version: `Diff ${sr}`, difficulty_rating: sr, bpm: 170, total_length: 120, cs: 4, ar: 9, od: 8 }
}

function set(
  id: number,
  rankedDate: string | null,
  playCount: number,
  modes: { mode: string; sr: number }[] = [{ mode: 'mania', sr: 4 }],
): SearchBeatmapset {
  return {
    id,
    title: `Title ${id}`,
    artist: `Artist ${id}`,
    creator: 'mapper',
    status: 'ranked',
    play_count: playCount,
    favourite_count: 0,
    ranked_date: rankedDate,
    covers: { card: `cover-${id}` },
    beatmaps: modes.map((m, i) => diff(id * 10 + i, m.mode, m.sr)),
  }
}

function page(sets: SearchBeatmapset[], cursor: string | null): SearchPage {
  return { beatmapsets: sets, cursor_string: cursor }
}

function pagesFetcher(pages: SearchPage[]) {
  return async (cursor: string | null | undefined): Promise<SearchPage> => {
    // Numeric cursors are page indices (the fake's chaining).
    // Any other cursor is the seeded cursor (§AO item 8): the API
    // jumps to the interval start, so it serves page 0.
    const index = cursor === undefined || cursor === null ? 0 : /^\d+$/.test(cursor) ? Number(cursor) : 0
    return pages[index] ?? { beatmapsets: [], cursor_string: null }
  }
}

function recordingFetcher(pages: SearchPage[]) {
  const calls: Array<string | null | undefined> = []
  const fetch = pagesFetcher(pages)
  return {
    calls,
    fetchPage: async (cursor: string | null | undefined): Promise<SearchPage> => {
      calls.push(cursor)
      return fetch(cursor)
    },
  }
}

describe('checkRefreshToken', () => {
  it('matches only the exact token, never an empty or wrong one', () => {
    expect(checkRefreshToken('abc', 'abc')).toBe(true)
    expect(checkRefreshToken('abd', 'abc')).toBe(false)
    expect(checkRefreshToken('ab', 'abc')).toBe(false)
    expect(checkRefreshToken('abcd', 'abc')).toBe(false)
    expect(checkRefreshToken('', 'abc')).toBe(false)
    expect(checkRefreshToken('abc', '')).toBe(false)
    expect(checkRefreshToken(null, 'abc')).toBe(false)
    expect(checkRefreshToken('abc', null)).toBe(false)
    expect(checkRefreshToken(undefined, undefined)).toBe(false)
    expect(checkRefreshToken(123, 'abc')).toBe(false)
  })
})

describe('resolveRefreshInterval vs cardFromPeriod (§AO drift guard)', () => {
  it('resolves the same intervals as the client for every key shape', () => {
    const keys: Array<[string, string]> = [
      ['month', '2026-11-w1'],
      ['month', '2026-10-w4'],
      ['month', '2026-02-w4'],
      ['year', '2026-01'],
      ['year', '2025-12'],
      ['year', '2027-06'],
    ]
    for (const [granularity, period] of keys) {
      const client = cardFromPeriod(
        granularity as 'month' | 'year',
        period,
        NOW,
      )
      const fn = resolveRefreshInterval(granularity, period, NOW)
      expect(fn, `${granularity}/${period}`).not.toBeNull()
      expect(fn?.startMs).toBe(client?.startMs)
      expect(fn?.endMs).toBe(client?.endMs)
    }
  })

  it('resolves the rolling week from "current" like weekCard', () => {
    const client = weekCard(NOW)
    const fn = resolveRefreshInterval('week', 'current', NOW)
    expect(fn?.startMs).toBe(client.startMs)
    expect(fn?.endMs).toBe(client.endMs)
  })

  it('returns null for unparseable keys, like cardFromPeriod', () => {
    expect(resolveRefreshInterval('month', '2026-13-w1', NOW)).toBeNull()
    expect(resolveRefreshInterval('month', '2026-11-w5', NOW)).toBeNull()
    expect(resolveRefreshInterval('month', '2026-11', NOW)).toBeNull()
    expect(resolveRefreshInterval('year', '2026-11-w1', NOW)).toBeNull()
    expect(resolveRefreshInterval('year', '2026-00', NOW)).toBeNull()
    expect(resolveRefreshInterval('week', '2026-11-w1', NOW)).toBeNull()
    expect(resolveRefreshInterval('day', '2026-11-09', NOW)).toBeNull()
  })
})

describe('scanRankedInterval vs compileRankedList (§AO drift guard)', () => {
  const window = RANKED_WINDOWS[1] // month window, for the explicit interval
  const startMs = Date.UTC(2026, 10, 1)
  const endMs = Date.UTC(2026, 10, 8)

  it('collects the same in-window sets, skips newer ones, stops at the start', async () => {
    const pages = [
      page(
        [
          set(1, '2026-11-03T00:00:00.000Z', 10),
          set(2, '2026-11-20T00:00:00.000Z', 99), // newer than end: skipped
          set(3, '2026-11-01T00:00:00.000Z', 5), // exactly at start: included
          set(4, '2026-10-31T23:59:59.000Z', 50), // older: stops the scan
        ],
        '1',
      ),
      page([set(5, '2026-11-05T00:00:00.000Z', 7)], null),
    ]
    const client = await compileRankedList({
      mode: 'mania' as GameMode,
      window,
      startMs,
      endMs,
      fetchPage: pagesFetcher(pages),
    })
    const fn = await scanRankedInterval({
      startMs,
      endMs,
      fetchPage: pagesFetcher(pages),
    })
    expect(fn.collected.map((c) => c.set.id).sort()).toEqual([1, 3])
    expect(client.entries.map((e) => e.candidate.beatmapsetId).sort()).toEqual([1, 3])
    expect(fn.partial).toBe(client.partial)
    expect(fn.scanned).toBe(client.scanned)
    expect(fn.skippedNewer).toBe(1)
    expect(fn.stop).toBe('reached-start')
    expect(fn.windowStart).toBe(client.windowStart)
  })

  it('flags partial identically when the page cap hits', async () => {
    const pages = Array.from({ length: RANKED_SCAN_MAX_PAGES }, (_, i) =>
      page([set(100 + i, '2026-11-05T00:00:00.000Z', i)], String(i + 1)),
    )
    const client = await compileRankedList({
      mode: 'mania' as GameMode,
      window,
      startMs,
      endMs,
      fetchPage: pagesFetcher(pages),
    })
    const fn = await scanRankedInterval({
      startMs,
      endMs,
      fetchPage: pagesFetcher(pages),
    })
    expect(fn.partial).toBe(true)
    expect(client.partial).toBe(true)
    expect(fn.pages).toBe(RANKED_SCAN_MAX_PAGES)
    expect(fn.stop).toBe('cap-hit')
    expect(fn.collected).toHaveLength(RANKED_SCAN_MAX_PAGES)
    expect(fn.scanned).toBe(client.scanned)
  })

  it('reports exhausted identically when the cursor runs out', async () => {
    const pages = [page([set(1, '2026-11-03T00:00:00.000Z', 10)], null)]
    const client = await compileRankedList({
      mode: 'mania' as GameMode,
      window,
      startMs,
      endMs,
      fetchPage: pagesFetcher(pages),
    })
    const fn = await scanRankedInterval({
      startMs,
      endMs,
      fetchPage: pagesFetcher(pages),
    })
    expect(fn.partial).toBe(false)
    expect(client.partial).toBe(false)
    expect(fn.stop).toBe('exhausted')
    expect(fn.collected.map((c) => c.set.id)).toEqual([1])
  })
})

describe('refreshSetToCandidate vs rankedSetToCandidate (§AO drift guard)', () => {
  it('maps the same candidate for a multi-difficulty set', () => {
    const s = set(7, '2026-11-03T00:00:00.000Z', 42, [
      { mode: 'mania', sr: 3.5 },
      { mode: 'mania', sr: 4.2 },
      { mode: 'mania', sr: 5.1 },
      { mode: 'osu', sr: 2.0 },
    ])
    const client = rankedSetToCandidate(s, 'mania' as GameMode)
    const fn = refreshSetToCandidate(s, 'mania')
    expect(fn).toEqual(client)
  })

  it('returns null for both when the set has no in-mode difficulty', () => {
    const s = set(8, '2026-11-03T00:00:00.000Z', 1, [{ mode: 'osu', sr: 4 }])
    expect(rankedSetToCandidate(s, 'mania' as GameMode)).toBeNull()
    expect(refreshSetToCandidate(s, 'mania')).toBeNull()
  })
})

describe('seeded scan (§AO item 8 — client vs function)', () => {
  const startMs = Date.UTC(2026, 10, 1)
  const endMs = Date.UTC(2026, 10, 8)

  function decodeSeed(seed: string): unknown {
    return JSON.parse(Buffer.from(seed, 'base64').toString('utf8'))
  }

  it('buildSeedCursor is identical in both implementations and matches the API shape', () => {
    for (const ms of [endMs, Date.UTC(2026, 0, 1), Date.UTC(2007, 9, 6, 17, 46, 31)]) {
      expect(buildFunctionSeedCursor(ms)).toBe(buildClientSeedCursor(ms))
      expect(buildClientSeedCursor(ms)).not.toContain('=')
      expect(decodeSeed(buildClientSeedCursor(ms))).toEqual({ approved_date: ms, id: 0 })
    }
  })

  it('seededScanMatchesFunction: same seed, same entries, same flags', async () => {
    const pages = [
      page(
        [
          set(1, '2026-11-03T00:00:00.000Z', 10),
          set(2, '2026-11-04T00:00:00.000Z', 30),
          set(3, '2026-11-02T00:00:00.000Z', 20),
          set(4, '2026-10-31T00:00:00.000Z', 999), // older: stops the scan
        ],
        null,
      ),
    ]
    const clientFetch = recordingFetcher(pages)
    const fnFetch = recordingFetcher(pages)
    const client = await compileRankedList({
      mode: 'mania' as GameMode,
      window: RANKED_WINDOWS[1],
      startMs,
      endMs,
      fetchPage: clientFetch.fetchPage,
    })
    const fn = await compileRefreshCompilation({
      mode: 'mania',
      startMs,
      endMs,
      fetchPage: fnFetch.fetchPage,
    })
    // Both start from the same seed cursor.
    expect(clientFetch.calls[0]).toBe(buildClientSeedCursor(endMs))
    expect(fnFetch.calls[0]).toBe(buildFunctionSeedCursor(endMs))
    expect(decodeSeed(clientFetch.calls[0] as string)).toEqual({ approved_date: endMs, id: 0 })
    expect(fn.entries).toEqual(client.entries)
    expect(fn.partial).toBe(client.partial)
    expect(fn.scanned).toBe(client.scanned)
    expect(fn.windowStart).toBe(client.windowStart)
    expect(fn.seeded).toBe(client.seeded)
    expect(fn.seedIgnored).toBe(client.seedIgnored)
    expect(fn.seeded).toBe(true)
    expect(fn.seedIgnored).toBe(false)
  })

  it('seedIgnored matches when the first page holds a newer set', async () => {
    const pages = [
      page(
        [
          set(9, '2026-11-20T00:00:00.000Z', 99), // newer than end: seed ignored
          set(1, '2026-11-03T00:00:00.000Z', 10),
          set(4, '2026-10-31T00:00:00.000Z', 999),
        ],
        null,
      ),
    ]
    const client = await compileRankedList({
      mode: 'mania' as GameMode,
      window: RANKED_WINDOWS[1],
      startMs,
      endMs,
      fetchPage: pagesFetcher(pages),
    })
    const fn = await compileRefreshCompilation({
      mode: 'mania',
      startMs,
      endMs,
      fetchPage: pagesFetcher(pages),
    })
    expect(fn.entries).toEqual(client.entries)
    expect(fn.seedIgnored).toBe(true)
    expect(client.seedIgnored).toBe(true)
  })
})

describe('compileRefreshCompilation vs compileRankedList (full pipeline)', () => {
  it('produces identical entries for the same pages', async () => {
    const pages = [
      page(
        [
          set(1, '2026-11-03T00:00:00.000Z', 10),
          set(2, '2026-11-04T00:00:00.000Z', 30),
          set(3, '2026-11-02T00:00:00.000Z', 20),
          set(4, '2026-10-31T00:00:00.000Z', 999), // older: stops the scan
        ],
        null,
      ),
    ]
    const client = await compileRankedList({
      mode: 'mania' as GameMode,
      window: RANKED_WINDOWS[1],
      startMs: Date.UTC(2026, 10, 1),
      endMs: Date.UTC(2026, 10, 8),
      fetchPage: pagesFetcher(pages),
    })
    const fn = await compileRefreshCompilation({
      mode: 'mania',
      startMs: Date.UTC(2026, 10, 1),
      endMs: Date.UTC(2026, 10, 8),
      fetchPage: pagesFetcher(pages),
    })
    expect(fn.entries).toEqual(client.entries)
    expect(fn.partial).toBe(client.partial)
    expect(fn.scanned).toBe(client.scanned)
    expect(fn.windowStart).toBe(client.windowStart)
  })
})
