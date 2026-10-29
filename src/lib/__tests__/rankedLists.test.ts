import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  RANKED_SCAN_MAX_PAGES,
  RANKED_TOP_N,
  RANKED_WINDOWS,
  compileRankedList,
  fetchRankedCompilation,
  rankedListName,
  rankedSetToCandidate,
  saveCompilationAsList,
  type RankedEntry,
} from '../rankedLists'
import type { SearchBeatmapset, SearchPage } from '../recommend'
import type { GameMode } from '../mode'
import { FakeDb } from './fakeSupabase'

const mocks = vi.hoisted(() => ({
  proxyCall: vi.fn(),
}))

vi.mock('../osu', () => ({
  proxyCall: mocks.proxyCall,
}))

/** Fixed "now" for window math: 2026-10-29T12:00:00Z. */
const NOW = Date.parse('2026-10-29T12:00:00.000Z')

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

function pagesFetcher(pages: SearchPage[]) {
  const calls: Array<string | null | undefined> = []
  return {
    calls,
    fetchPage: async (cursor: string | null | undefined): Promise<SearchPage> => {
      calls.push(cursor)
      const index = cursor === undefined ? 0 : Number(cursor)
      return pages[index] ?? { beatmapsets: [], cursor_string: null }
    },
  }
}

function page(sets: SearchBeatmapset[], cursor: string | null): SearchPage {
  return { beatmapsets: sets, cursor_string: cursor }
}

const week = RANKED_WINDOWS[0]
const month = RANKED_WINDOWS[1]

describe('ranked compilation windows', () => {
  it('includes sets ranked exactly at the window start (inclusive), excludes older ones', async () => {
    const start = new Date(NOW - 7 * 24 * 60 * 60 * 1000).toISOString()
    const justBefore = new Date(NOW - 7 * 24 * 60 * 60 * 1000 - 1000).toISOString()
    const { fetchPage } = pagesFetcher([
      page(
        [
          set(1, start, 10),
          set(2, justBefore, 999),
          set(3, new Date(NOW - 6 * 24 * 60 * 60 * 1000).toISOString(), 5),
        ],
        null,
      ),
    ])
    const compiled = await compileRankedList({ mode: 'mania', window: week, now: NOW, fetchPage })
    expect(compiled.entries.map((e) => e.candidate.beatmapsetId)).toEqual([1, 3])
    expect(compiled.partial).toBe(false)
  })

  it('sorts by play count desc after window filtering and caps at 50', async () => {
    const sets = Array.from({ length: 60 }, (_, i) =>
      set(100 + i, new Date(NOW - 1000).toISOString(), i),
    )
    const { fetchPage } = pagesFetcher([page(sets, null)])
    const compiled = await compileRankedList({ mode: 'mania', window: week, now: NOW, fetchPage })
    expect(compiled.entries).toHaveLength(RANKED_TOP_N)
    expect(compiled.entries[0].candidate.beatmapsetId).toBe(159)
    expect(compiled.entries[0].rank).toBe(1)
    expect(compiled.entries[49].rank).toBe(50)
    const plays = compiled.entries.map((e) => e.candidate.playCount)
    expect([...plays].sort((a, b) => b - a)).toEqual(plays)
  })

  it('stops scanning once results are older than the window start (no extra pages)', async () => {
    const { calls, fetchPage } = pagesFetcher([
      page(
        [set(1, new Date(NOW - 1000).toISOString(), 10), set(2, new Date(NOW - 30 * 24 * 60 * 60 * 1000).toISOString(), 99)],
        '1',
      ),
      page([set(3, new Date(NOW - 1000).toISOString(), 50)], null),
    ])
    const compiled = await compileRankedList({ mode: 'mania', window: week, now: NOW, fetchPage })
    expect(calls).toHaveLength(1)
    expect(compiled.entries.map((e) => e.candidate.beatmapsetId)).toEqual([1])
    expect(compiled.partial).toBe(false)
  })

  it('flags partial when the page cap hits before the window start is reached', async () => {
    const pages = Array.from({ length: RANKED_SCAN_MAX_PAGES }, (_, i) =>
      page([set(200 + i, new Date(NOW - 1000).toISOString(), i)], String(i + 1)),
    )
    const { calls, fetchPage } = pagesFetcher(pages)
    const compiled = await compileRankedList({ mode: 'mania', window: week, now: NOW, fetchPage })
    expect(calls).toHaveLength(RANKED_SCAN_MAX_PAGES)
    expect(compiled.partial).toBe(true)
    expect(compiled.entries).toHaveLength(RANKED_SCAN_MAX_PAGES)
  })

  it('is not partial when the cursor runs out before the cap', async () => {
    const { fetchPage } = pagesFetcher([
      page([set(1, new Date(NOW - 1000).toISOString(), 10)], '1'),
      page([set(2, new Date(NOW - 1000).toISOString(), 20)], null),
    ])
    const compiled = await compileRankedList({ mode: 'mania', window: week, now: NOW, fetchPage })
    expect(compiled.partial).toBe(false)
  })

  it('skips sets with a missing ranked date without stopping the scan', async () => {
    const { calls, fetchPage } = pagesFetcher([
      page([set(1, null, 10)], '1'),
      page([set(2, new Date(NOW - 1000).toISOString(), 20)], null),
    ])
    const compiled = await compileRankedList({ mode: 'mania', window: week, now: NOW, fetchPage })
    expect(calls).toHaveLength(2)
    expect(compiled.entries.map((e) => e.candidate.beatmapsetId)).toEqual([2])
  })

  it('dedupes a set seen on two pages', async () => {
    const { fetchPage } = pagesFetcher([
      page([set(1, new Date(NOW - 1000).toISOString(), 10)], '1'),
      page([set(1, new Date(NOW - 1000).toISOString(), 10)], null),
    ])
    const compiled = await compileRankedList({ mode: 'mania', window: week, now: NOW, fetchPage })
    expect(compiled.entries).toHaveLength(1)
  })
})

describe('ranked candidate mapping', () => {
  it('excludes sets with no difficulty in the current mode', async () => {
    const { fetchPage } = pagesFetcher([
      page(
        [
          set(1, new Date(NOW - 1000).toISOString(), 10, [{ mode: 'osu', sr: 5 }]),
          set(2, new Date(NOW - 1000).toISOString(), 20, [{ mode: 'mania', sr: 5 }]),
        ],
        null,
      ),
    ])
    const compiled = await compileRankedList({ mode: 'mania', window: week, now: NOW, fetchPage })
    expect(compiled.entries.map((e) => e.candidate.beatmapsetId)).toEqual([2])
  })

  it('picks the median-SR in-mode difficulty and reports the SR range', () => {
    const candidate = rankedSetToCandidate(
      set(7, new Date(NOW - 1000).toISOString(), 42, [
        { mode: 'mania', sr: 2 },
        { mode: 'mania', sr: 4 },
        { mode: 'mania', sr: 6 },
      ]),
      'mania',
    )
    expect(candidate?.sr).toBe(4)
    expect(candidate?.srMin).toBe(2)
    expect(candidate?.srMax).toBe(6)
    expect(candidate?.playCount).toBe(42)
    expect(candidate?.reason).toContain('Ranked')
  })

  it('returns null for a malformed set or a set with no difficulties', () => {
    expect(rankedSetToCandidate(null as unknown as SearchBeatmapset, 'mania')).toBeNull()
    expect(
      rankedSetToCandidate(set(9, new Date(NOW - 1000).toISOString(), 1, []), 'mania'),
    ).toBeNull()
  })
})

describe('ranked compilation cache', () => {
  it('caches per mode+window and refresh bypasses the cache', async () => {
    mocks.proxyCall.mockReset()
    mocks.proxyCall.mockResolvedValue(
      page([set(1, new Date(NOW - 1000).toISOString(), 10)], null),
    )
    const first = await fetchRankedCompilation('mania', week, { now: NOW })
    const second = await fetchRankedCompilation('mania', week, { now: NOW })
    expect(mocks.proxyCall).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
    await fetchRankedCompilation('mania', week, { now: NOW, fresh: true })
    expect(mocks.proxyCall).toHaveBeenCalledTimes(2)
    await fetchRankedCompilation('osu', week, { now: NOW })
    expect(mocks.proxyCall).toHaveBeenCalledTimes(3)
    expect(mocks.proxyCall).toHaveBeenCalledWith(
      'searchBeatmapsets',
      expect.objectContaining({
        filters: { status: 'ranked', sort: 'ranked_desc' },
      }),
    )
  })
})

describe('save compilation as list', () => {
  function client(db: FakeDb): SupabaseClient {
    return db as unknown as SupabaseClient
  }

  function entry(id: number): RankedEntry {
    const candidate = rankedSetToCandidate(
      set(id, new Date(NOW - 1000).toISOString(), id),
      'mania',
    )
    if (!candidate) throw new Error('test setup: no candidate')
    return { candidate, rank: 1, rankedDate: new Date(NOW - 1000).toISOString() }
  }

  it('names the list Top 50 Ranked — Mode — Window', () => {
    expect(rankedListName('mania' as GameMode, month)).toBe(
      'Top 50 Ranked — Mania — Last 4 weeks',
    )
  })

  it('creates the list and adds every entry when none exists', async () => {
    const db = new FakeDb()
    const result = await saveCompilationAsList(client(db), 'u1', {
      name: 'Top 50 Ranked — Mania — This week',
      mode: 'mania',
      entries: [entry(101), entry(102)],
    })
    expect(result).toEqual({
      listName: 'Top 50 Ranked — Mania — This week',
      added: 2,
      alreadyHad: 0,
      total: 2,
    })
    expect(db.tables['list_items']).toHaveLength(2)
  })

  it('reuses an existing same-named list and adds only missing sets', async () => {
    const db = new FakeDb({
      lists: [
        {
          id: 'l1',
          user_id: 'u1',
          name: 'Top 50 Ranked — Mania — This week',
          is_public: false,
          created_at: '2026-10-01T00:00:00Z',
        },
      ],
      list_items: [
        {
          id: 'i1',
          list_id: 'l1',
          beatmapset_id: 101,
          beatmap_id: 1010,
          mode: 'mania',
          added_at: '2026-10-01T00:00:00Z',
        },
      ],
    })
    const result = await saveCompilationAsList(client(db), 'u1', {
      name: 'Top 50 Ranked — Mania — This week',
      mode: 'mania',
      entries: [entry(101), entry(102)],
    })
    expect(result.added).toBe(1)
    expect(result.alreadyHad).toBe(1)
    expect(result.total).toBe(2)
    expect(db.tables['lists']).toHaveLength(1)
    expect(db.tables['list_items']).toHaveLength(2)
  })
})
