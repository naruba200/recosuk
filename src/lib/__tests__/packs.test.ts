import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  proxyCall: vi.fn(),
}))

vi.mock('../osu', () => ({
  proxyCall: mocks.proxyCall,
}))

import {
  fetchBeatmapPacks,
  groupPacks,
  normalizePack,
  normalizePackList,
  packPeriod,
  PACKS_EMPTY_TTL_MS,
  type BeatmapPack,
} from '../packs'
import { dataCache } from '../dataCache'

describe('normalizePack', () => {
  it('reads tag/name/url/date and ids from beatmapsets objects', () => {
    expect(
      normalizePack({
        tag: 'P1234',
        name: 'Beatmap Pack #1234',
        url: 'https://example.test/packs/P1234',
        date: '2026-10-01',
        beatmapsets: [{ id: 1 }, { id: 2 }, { id: 2 }],
      }),
    ).toEqual({
      tag: 'P1234',
      name: 'Beatmap Pack #1234',
      url: 'https://example.test/packs/P1234',
      date: '2026-10-01',
      beatmapsetIds: [1, 2],
    })
  })

  it('reads ids from a plain beatmapset_ids array', () => {
    expect(normalizePack({ tag: 'P1', name: 'Pack', beatmapset_ids: [7, 8] })?.beatmapsetIds).toEqual([7, 8])
  })

  it('falls back to the name when the tag is missing, and vice versa', () => {
    expect(normalizePack({ name: 'Only Name' })?.tag).toBe('Only Name')
    expect(normalizePack({ tag: 'only-tag' })?.name).toBe('only-tag')
  })

  it('returns null for entries with neither tag nor name, and for non-objects', () => {
    expect(normalizePack({})).toBeNull()
    expect(normalizePack(null)).toBeNull()
    expect(normalizePack('pack')).toBeNull()
    expect(normalizePack({ beatmapsets: [{ id: 1 }] })).toBeNull()
  })

  it('tolerates a list entry without beatmapsets (ids filled by the detail call)', () => {
    expect(normalizePack({ tag: 'P9', name: 'Pack 9' })?.beatmapsetIds).toEqual([])
  })

  it('reads the documented BeatmapPack shape (osu! API docs, BeatmapPack object)', () => {
    // Every field below is a documented BeatmapPack field; beatmapsets
    // entries are documented Beatmapset objects (id/artist/title).
    const pack = normalizePack({
      author: 'osu!',
      date: '2025-01-01T00:00:00+00:00',
      name: 'Beatmap Pack #1234',
      no_diff_reduction: false,
      ruleset_id: 0,
      tag: 'S1234',
      url: 'https://osu.ppy.sh/beatmaps/packs/S1234',
      beatmapsets: [
        { id: 1, artist: 'Artist One', title: 'Title One' },
        { id: 2, artist: 'Artist Two', title: 'Title Two' },
      ],
    })
    expect(pack?.tag).toBe('S1234')
    expect(pack?.name).toBe('Beatmap Pack #1234')
    expect(pack?.url).toBe('https://osu.ppy.sh/beatmaps/packs/S1234')
    expect(pack?.date).toBe('2025-01-01T00:00:00+00:00')
    expect(pack?.beatmapsetIds).toEqual([1, 2])
    expect(pack?.setMeta).toEqual([
      { id: 1, artist: 'Artist One', title: 'Title One' },
      { id: 2, artist: 'Artist Two', title: 'Title Two' },
    ])
  })
})

describe('normalizePackList', () => {
  it('accepts a bare array and a { packs } envelope, skipping bad entries', () => {
    const raw = [{ tag: 'A', name: 'A' }, null, { tag: 'B', name: 'B' }]
    expect(normalizePackList(raw).map((p) => p.tag)).toEqual(['A', 'B'])
    expect(normalizePackList({ packs: raw }).map((p) => p.tag)).toEqual(['A', 'B'])
    expect(normalizePackList({})).toEqual([])
    expect(normalizePackList(null)).toEqual([])
  })

  it('accepts the documented { beatmap_packs: [...] } shape (GET /beatmaps/packs)', () => {
    // Regression: the deployed proxy passes osu!'s response through
    // unchanged, so the list arrives under `beatmap_packs`, not
    // `packs`. Dropping it left Collections on "osu! returned no
    // packs" forever. Entries carry the documented BeatmapPack fields.
    const payload = {
      beatmap_packs: [
        {
          tag: 'S1234',
          name: 'Beatmap Pack #1234',
          url: 'https://osu.ppy.sh/beatmaps/packs/S1234',
          date: '2025-01-01T00:00:00+00:00',
          author: 'osu!',
        },
        { tag: 'S1235', name: 'Beatmap Pack #1235' },
        null,
      ],
    }
    const packs = normalizePackList(payload)
    expect(packs.map((p) => p.tag)).toEqual(['S1234', 'S1235'])
    expect(packs[0]).toMatchObject({
      name: 'Beatmap Pack #1234',
      url: 'https://osu.ppy.sh/beatmaps/packs/S1234',
      date: '2025-01-01T00:00:00+00:00',
    })
  })

  it('prefers beatmap_packs over packs when both envelopes are present', () => {
    const payload = {
      beatmap_packs: [{ tag: 'REAL', name: 'Real Pack' }],
      packs: [{ tag: 'STALE', name: 'Stale Pack' }],
    }
    expect(normalizePackList(payload).map((p) => p.tag)).toEqual(['REAL'])
  })

  it('an empty beatmap_packs array is the documented empty result, not a fallback trigger', () => {
    expect(
      normalizePackList({ beatmap_packs: [], packs: [{ tag: 'X', name: 'X' }] }),
    ).toEqual([])
  })
})

describe('fetchBeatmapPacks caching (item E1)', () => {
  beforeEach(() => {
    dataCache.clear()
    mocks.proxyCall.mockReset()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-29T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not serve an empty list from the hour-long cache: it expires after 60s', async () => {
    expect(PACKS_EMPTY_TTL_MS).toBe(60 * 1000)
    mocks.proxyCall
      .mockResolvedValueOnce({ packs: [] })
      .mockResolvedValueOnce({ packs: [{ tag: 'P1', name: 'Pack One' }] })

    expect(await fetchBeatmapPacks()).toEqual([])
    expect(mocks.proxyCall).toHaveBeenCalledTimes(1)

    // 30s later the empty entry is still live — no refetch yet.
    vi.setSystemTime(new Date('2026-10-29T00:00:30Z'))
    expect(await fetchBeatmapPacks()).toEqual([])
    expect(mocks.proxyCall).toHaveBeenCalledTimes(1)

    // Past 60s the empty entry is gone: a fresh fetch runs and the
    // page recovers instead of sitting on the stale empty list.
    vi.setSystemTime(new Date('2026-10-29T00:01:01Z'))
    expect(await fetchBeatmapPacks()).toEqual([
      { tag: 'P1', name: 'Pack One', beatmapsetIds: [] },
    ])
    expect(mocks.proxyCall).toHaveBeenCalledTimes(2)
  })

  it('still caches a non-empty list for the full hour', async () => {
    mocks.proxyCall.mockResolvedValue({ packs: [{ tag: 'P1', name: 'Pack One' }] })

    await fetchBeatmapPacks()
    vi.setSystemTime(new Date('2026-10-29T00:30:00Z'))
    await fetchBeatmapPacks()
    expect(mocks.proxyCall).toHaveBeenCalledTimes(1)
  })

  it('fresh: true bypasses even a live empty-cache entry (the Retry button path)', async () => {
    mocks.proxyCall
      .mockResolvedValueOnce({ packs: [] })
      .mockResolvedValueOnce({ packs: [{ tag: 'P1', name: 'Pack One' }] })

    expect(await fetchBeatmapPacks()).toEqual([])
    const retried = await fetchBeatmapPacks({ fresh: true })
    expect(retried).toHaveLength(1)
    expect(mocks.proxyCall).toHaveBeenCalledTimes(2)
  })

  it('fetches through the documented { beatmap_packs } envelope end to end', async () => {
    mocks.proxyCall.mockResolvedValue({
      beatmap_packs: [
        {
          tag: 'S1234',
          name: 'Beatmap Pack #1234',
          url: 'https://osu.ppy.sh/beatmaps/packs/S1234',
          date: '2025-01-01T00:00:00+00:00',
        },
      ],
    })

    expect(await fetchBeatmapPacks()).toEqual([
      {
        tag: 'S1234',
        name: 'Beatmap Pack #1234',
        url: 'https://osu.ppy.sh/beatmaps/packs/S1234',
        date: '2025-01-01T00:00:00+00:00',
        beatmapsetIds: [],
      },
    ])
  })
})

describe('packPeriod grouping', () => {
  function pack(name: string, tag = ''): BeatmapPack {
    return { tag, name, beatmapsetIds: [] }
  }

  it('groups weekly/monthly/yearly by name text, year included', () => {
    expect(packPeriod(pack('Weekly Beatmap Pack'))).toBe('weekly')
    expect(packPeriod(pack('Beatmap Pack — Week 42'))).toBe('weekly')
    expect(packPeriod(pack('Monthly Pack'))).toBe('monthly')
    expect(packPeriod(pack('Yearly Pack 2025'))).toBe('yearly')
    expect(packPeriod(pack('Beatmap Pack #1234', '2025-pack'))).toBe('yearly')
  })

  it('puts unlabelled packs in Curated', () => {
    expect(packPeriod(pack('Beatmap Pack #1234', 'P1234'))).toBe('curated')
    expect(packPeriod(pack('Community Picks'))).toBe('curated')
  })

  it('groups packs into ordered buckets, empty buckets included', () => {
    const grouped = groupPacks([
      pack('Weekly A'),
      pack('Monthly B'),
      pack('Yearly C'),
      pack('Random D'),
      pack('Weekly E'),
    ])
    expect(grouped.weekly.map((p) => p.name)).toEqual(['Weekly A', 'Weekly E'])
    expect(grouped.monthly.map((p) => p.name)).toEqual(['Monthly B'])
    expect(grouped.yearly.map((p) => p.name)).toEqual(['Yearly C'])
    expect(grouped.curated.map((p) => p.name)).toEqual(['Random D'])
  })
})
