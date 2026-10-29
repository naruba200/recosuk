import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  proxyCall: vi.fn(),
}))

vi.mock('../osu', () => ({
  proxyCall: mocks.proxyCall,
}))

import {
  fetchBeatmapPacks,
  fetchBeatmapPacksPage,
  normalizePack,
  normalizePackList,
  normalizePackListPage,
  packDateLabel,
  packDownloadKind,
  packDownloadLabel,
  packModeFromRuleset,
  packVisibleForMode,
  paginatePackList,
  parsePackTag,
  PACKS_EMPTY_TTL_MS,
  PACKS_PAGE_SIZE,
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
      rulesetId: null,
      packType: 'tournament',
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
    expect(pack?.rulesetId).toBe(0)
    expect(pack?.packType).toBe('standard')
    expect(pack?.setMeta).toEqual([
      { id: 1, artist: 'Artist One', title: 'Title One' },
      { id: 2, artist: 'Artist Two', title: 'Title Two' },
    ])
  })

  it('keeps ruleset_id verbatim when it is an integer (including out-of-range), null otherwise', () => {
    expect(normalizePack({ tag: 'S1', name: 'P', ruleset_id: 3 })?.rulesetId).toBe(3)
    expect(normalizePack({ tag: 'S1', name: 'P', ruleset_id: 5 })?.rulesetId).toBe(5)
    expect(normalizePack({ tag: 'S1', name: 'P', ruleset_id: 'x' })?.rulesetId).toBeNull()
    expect(normalizePack({ tag: 'S1', name: 'P', ruleset_id: 1.5 })?.rulesetId).toBeNull()
    expect(normalizePack({ tag: 'S1', name: 'P' })?.rulesetId).toBeNull()
  })

  it('keeps the tag verbatim, including two-letter observed forms', () => {
    expect(normalizePack({ tag: 'ST445', name: 'Pack' })?.tag).toBe('ST445')
    expect(normalizePack({ tag: 'SM385', name: 'Pack' })?.tag).toBe('SM385')
    expect(normalizePack({ tag: 'SC172', name: 'Pack' })?.tag).toBe('SC172')
  })
})

describe('parsePackTag', () => {
  it('maps all seven documented type letters', () => {
    expect(parsePackTag('S1').type).toBe('standard')
    expect(parsePackTag('F1').type).toBe('featured')
    expect(parsePackTag('P1').type).toBe('tournament')
    expect(parsePackTag('L1').type).toBe('loved')
    expect(parsePackTag('R1').type).toBe('chart')
    expect(parsePackTag('T1').type).toBe('theme')
    expect(parsePackTag('A1').type).toBe('artist')
  })

  it('parses the observed two-letter standard forms, recording the mode letter only', () => {
    expect(parsePackTag('ST445')).toEqual({ type: 'standard', number: 445, modeLetter: 'T' })
    expect(parsePackTag('SM385')).toEqual({ type: 'standard', number: 385, modeLetter: 'M' })
    expect(parsePackTag('SC172')).toEqual({ type: 'standard', number: 172, modeLetter: 'C' })
    expect(parsePackTag('S1888')).toEqual({ type: 'standard', number: 1888, modeLetter: null })
  })

  it('is case-insensitive on the letters', () => {
    expect(parsePackTag('st445')).toEqual({ type: 'standard', number: 445, modeLetter: 'T' })
  })

  it('returns unknown, never throws, for garbage/empty/non-string input', () => {
    expect(parsePackTag('')).toEqual({ type: 'unknown', number: null, modeLetter: null })
    expect(parsePackTag('weekly-example')).toEqual({ type: 'unknown', number: null, modeLetter: null })
    expect(parsePackTag('S')).toEqual({ type: 'unknown', number: null, modeLetter: null })
    expect(parsePackTag('S12x')).toEqual({ type: 'unknown', number: null, modeLetter: null })
    expect(parsePackTag('X123')).toEqual({ type: 'unknown', number: null, modeLetter: null })
    expect(parsePackTag(null)).toEqual({ type: 'unknown', number: null, modeLetter: null })
    expect(parsePackTag(42)).toEqual({ type: 'unknown', number: null, modeLetter: null })
  })
})

describe('packModeFromRuleset', () => {
  it('maps the documented ruleset ids', () => {
    expect(packModeFromRuleset(0)).toBe('osu')
    expect(packModeFromRuleset(1)).toBe('taiko')
    expect(packModeFromRuleset(2)).toBe('fruits')
    expect(packModeFromRuleset(3)).toBe('mania')
  })

  it('returns null for absent, non-integer, and out-of-range ids', () => {
    expect(packModeFromRuleset(null)).toBeNull()
    expect(packModeFromRuleset(undefined)).toBeNull()
    expect(packModeFromRuleset(5)).toBeNull()
    expect(packModeFromRuleset(-1)).toBeNull()
    expect(packModeFromRuleset(1.5)).toBeNull()
    expect(packModeFromRuleset('0')).toBeNull()
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
      rulesetId: null,
      packType: 'standard',
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

describe('normalizePackListPage (cursor preservation)', () => {
  it('preserves a top-level cursor_string', () => {
    const page = normalizePackListPage({
      beatmap_packs: [{ tag: 'S1', name: 'Pack 1' }],
      cursor_string: 'next-page-token',
    })
    expect(page.packs.map((p) => p.tag)).toEqual(['S1'])
    expect(page.cursor).toBe('next-page-token')
  })

  it('reports no cursor when the payload carries none, an empty one, or a bare array', () => {
    expect(normalizePackListPage({ beatmap_packs: [] }).cursor).toBeNull()
    expect(
      normalizePackListPage({ beatmap_packs: [], cursor_string: '' }).cursor,
    ).toBeNull()
    expect(normalizePackListPage([{ tag: 'S1', name: 'Pack 1' }]).cursor).toBeNull()
    expect(normalizePackListPage(null).cursor).toBeNull()
  })
})

describe('packDateLabel', () => {
  it('shows just the date part of an ISO timestamp', () => {
    expect(packDateLabel('2025-01-01T00:00:00+00:00')).toBe('2025-01-01')
    expect(packDateLabel('2026-10-01')).toBe('2026-10-01')
  })

  it('shows non-ISO strings as-is, never invented', () => {
    expect(packDateLabel('Spring 2025')).toBe('Spring 2025')
  })
})

describe('packVisibleForMode', () => {
  function pack(rulesetId: number | null, tag = 'S1'): BeatmapPack {
    return { tag, name: 'Pack', beatmapsetIds: [], rulesetId, packType: 'standard' }
  }

  it('shows exact-mode matches and hides other modes', () => {
    expect(packVisibleForMode(pack(3), 'mania')).toBe(true)
    expect(packVisibleForMode(pack(3), 'osu')).toBe(false)
    expect(packVisibleForMode(pack(2), 'fruits')).toBe(true)
    expect(packVisibleForMode(pack(0), 'taiko')).toBe(false)
  })

  it('always shows packs with an unknown mode, whatever the filter', () => {
    expect(packVisibleForMode(pack(null), 'mania')).toBe(true)
    expect(packVisibleForMode(pack(5), 'osu')).toBe(true)
  })

  it('shows everything for the all-modes filter', () => {
    expect(packVisibleForMode(pack(0), 'all')).toBe(true)
    expect(packVisibleForMode(pack(null), 'all')).toBe(true)
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
      { tag: 'P1', name: 'Pack One', beatmapsetIds: [], rulesetId: null, packType: 'tournament' },
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
        rulesetId: null,
        packType: 'standard',
      },
    ])
  })
})

describe('fetchBeatmapPacksPage (type + cursor pagination)', () => {
  beforeEach(() => {
    dataCache.clear()
    mocks.proxyCall.mockReset()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-29T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends the type param, defaulting to standard', async () => {
    mocks.proxyCall.mockResolvedValue({ beatmap_packs: [] })
    await fetchBeatmapPacksPage()
    expect(mocks.proxyCall).toHaveBeenCalledWith('getBeatmapPacks', { type: 'standard' })
    await fetchBeatmapPacksPage({ type: 'featured', fresh: true })
    expect(mocks.proxyCall).toHaveBeenCalledWith('getBeatmapPacks', { type: 'featured' })
  })

  it('caches per type: switching categories refetches, switching back is cached', async () => {
    mocks.proxyCall.mockResolvedValue({ beatmap_packs: [{ tag: 'S1', name: 'One' }] })
    await fetchBeatmapPacksPage({ type: 'standard' })
    await fetchBeatmapPacksPage({ type: 'featured' })
    expect(mocks.proxyCall).toHaveBeenCalledTimes(2)
    await fetchBeatmapPacksPage({ type: 'standard' })
    expect(mocks.proxyCall).toHaveBeenCalledTimes(2)
  })

  it('merges cursor pages, dedupes by tag, and stops when the cursor is gone', async () => {
    mocks.proxyCall
      .mockResolvedValueOnce({
        beatmap_packs: [
          { tag: 'S1', name: 'One' },
          { tag: 'S2', name: 'Two' },
        ],
        cursor_string: 'page-2',
      })
      .mockResolvedValueOnce({
        beatmap_packs: [
          { tag: 'S2', name: 'Two' },
          { tag: 'S3', name: 'Three' },
        ],
        cursor_string: null,
      })
    const first = await fetchBeatmapPacksPage({ type: 'standard' })
    expect(first.packs.map((p) => p.tag)).toEqual(['S1', 'S2'])
    expect(first.cursor).toBe('page-2')
    expect(mocks.proxyCall).toHaveBeenLastCalledWith('getBeatmapPacks', { type: 'standard' })

    const merged = await fetchBeatmapPacksPage({ type: 'standard', cursor: 'page-2' })
    expect(merged.packs.map((p) => p.tag)).toEqual(['S1', 'S2', 'S3'])
    expect(merged.cursor).toBeNull()
    expect(mocks.proxyCall).toHaveBeenLastCalledWith('getBeatmapPacks', {
      type: 'standard',
      cursor_string: 'page-2',
    })
    expect(mocks.proxyCall).toHaveBeenCalledTimes(2)
  })

  it('fresh replaces the buffered list instead of appending', async () => {
    mocks.proxyCall
      .mockResolvedValueOnce({
        beatmap_packs: [{ tag: 'S1', name: 'One' }],
        cursor_string: 'page-2',
      })
      .mockResolvedValueOnce({ beatmap_packs: [{ tag: 'S9', name: 'Nine' }] })
    await fetchBeatmapPacksPage({ type: 'standard' })
    const fresh = await fetchBeatmapPacksPage({ type: 'standard', fresh: true })
    expect(fresh.packs.map((p) => p.tag)).toEqual(['S9'])
    expect(fresh.cursor).toBeNull()
  })
})

describe('paginatePackList (batch 12, part 10; fetch order, no period grouping)', () => {
  function pack(name: string, tag = ''): BeatmapPack {
    return { tag, name, beatmapsetIds: [], rulesetId: null, packType: 'standard' }
  }

  function many(count: number): BeatmapPack[] {
    return Array.from({ length: count }, (_, i) => pack(`Pack ${i + 1}`, `P${i + 1}`))
  }

  it('caps the first chunk at PACKS_PAGE_SIZE in fetch order', () => {
    const { visible, remaining } = paginatePackList(many(30), PACKS_PAGE_SIZE)
    expect(PACKS_PAGE_SIZE).toBe(12)
    expect(visible).toHaveLength(12)
    expect(remaining).toBe(18)
    expect(visible.map((p) => p.name)).toEqual(
      Array.from({ length: 12 }, (_, i) => `Pack ${i + 1}`),
    )
  })

  it('reveals the next chunk and reports exhaustion', () => {
    const all = many(30)
    const second = paginatePackList(all, PACKS_PAGE_SIZE * 2)
    expect(second.visible).toHaveLength(24)
    expect(second.remaining).toBe(6)
    const exhausted = paginatePackList(all, 30)
    expect(exhausted.visible).toHaveLength(30)
    expect(exhausted.remaining).toBe(0)
    const over = paginatePackList(all, 999)
    expect(over.visible).toHaveLength(30)
    expect(over.remaining).toBe(0)
  })

  it('handles empty and non-positive counts', () => {
    expect(paginatePackList([], 12)).toEqual({ visible: [], remaining: 0 })
    expect(paginatePackList(many(5), 0)).toEqual({ visible: [], remaining: 5 })
    expect(paginatePackList(many(5), -3).visible).toEqual([])
  })
})

describe('packDownloadKind / packDownloadLabel (batch 12, part 10)', () => {
  it('archive kind + "Download pack" label when the API provides a url', () => {
    const pack: BeatmapPack = {
      tag: 'S1',
      name: 'Pack',
      url: 'https://osu.ppy.sh/beatmaps/packs/S1/download',
      beatmapsetIds: [1, 2, 3],
      rulesetId: null,
      packType: 'standard',
    }
    expect(packDownloadKind(pack)).toBe('archive')
    expect(packDownloadLabel(pack)).toBe('Download pack')
  })

  it('all-maps kind with the count once contents are known', () => {
    const pack: BeatmapPack = {
      tag: 'S1',
      name: 'Pack',
      beatmapsetIds: [1, 2, 3],
      rulesetId: null,
      packType: 'standard',
    }
    expect(packDownloadKind(pack)).toBe('all-maps')
    expect(packDownloadLabel(pack)).toBe('Download all (3 maps)')
  })

  it('all-maps kind with a count-less label before contents load, and empty url counts as absent', () => {
    expect(
      packDownloadLabel({ tag: 'S1', name: 'Pack', beatmapsetIds: [], rulesetId: null, packType: 'standard' }),
    ).toBe('Download all maps')
    expect(
      packDownloadKind({ tag: 'S1', name: 'Pack', url: '', beatmapsetIds: [], rulesetId: null, packType: 'standard' }),
    ).toBe('all-maps')
  })
})
