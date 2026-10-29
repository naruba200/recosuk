import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  __setPpCacheBackendForTests,
  aggregatePpRange,
  formatPpRange,
  getPpRange,
  MemoryPpCache,
  ppCacheKey,
  ROSU_PP_CALCULATOR_ID,
  ROSU_PP_VERSION,
  type PpCacheBackend,
  type PpDifficultyInput,
  type PpEngine,
} from '../pp'
import { rankedSetToCandidate } from '../rankedLists'
import { setToCandidate, type SearchBeatmapset } from '../recommend'
import type { SkillProfile } from '../skillProfile'

// ---------------------------------------------------------------------------
// Fixtures: synthetic .osu maps from the source-build probe (labelled
// synthetic — they prove the fetch path carries real .osu text; the
// engine here is a fake, so no real PP is asserted from them).
// ---------------------------------------------------------------------------

function fixtureText(name: 'osu' | 'taiko' | 'catch' | 'mania'): string {
  return readFileSync(new URL(`./fixtures/pp/${name}.osu`, import.meta.url), 'utf8')
}

const profile: SkillProfile = {
  mode: 'mania',
  pp: 5284,
  globalRank: 18942,
  countryRank: 142,
  accuracy: 96.84,
  playCount: 12430,
  comfortSrMin: 4.2,
  comfortSrMax: 4.7,
  comfortAccuracy: 97.8,
  srCeiling: 5.0,
  ceilingAccuracy: 91.2,
  bpmSweetMin: 170,
  bpmSweetMax: 190,
  bpmMean: 182,
  avgAr: 0,
  keyCounts: { 7: 82, 4: 18 },
  mainKeyCount: 7,
  keySharePct: 82,
  accuracyBands: [],
  modUsage: [],
  playstyleTags: ['jumpstream'],
  recentAccuracy: null,
  topPlayCount: 100,
  isStarter: false,
  generatedAt: '2026-10-29T00:00:00Z',
}

describe('rosu-pp-js version sync', () => {
  it('ROSU_PP_VERSION equals the installed dependency version', () => {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), 'node_modules', 'rosu-pp-js', 'package.json'), 'utf8'),
    ) as { version: string }
    expect(pkg.version).toBe(ROSU_PP_VERSION)
    expect(ROSU_PP_CALCULATOR_ID).toBe(`rosu-pp-js@${ROSU_PP_VERSION}`)
  })
})

describe('ppCacheKey', () => {
  const base: PpDifficultyInput = { beatmapId: 42, mode: 'mania' }

  it('prefers the checksum when present', () => {
    expect(ppCacheKey({ ...base, checksum: 'abc123' })).toBe(
      `42:${ROSU_PP_CALCULATOR_ID}:abc123`,
    )
  })

  it('falls back to last_updated, then the bare id', () => {
    expect(ppCacheKey({ ...base, lastUpdated: '2026-01-02T03:04:05Z' })).toBe(
      `42:${ROSU_PP_CALCULATOR_ID}:2026-01-02T03:04:05Z`,
    )
    expect(ppCacheKey(base)).toBe(`42:${ROSU_PP_CALCULATOR_ID}:unversioned`)
  })

  it('ignores empty checksum/lastUpdated strings', () => {
    expect(ppCacheKey({ ...base, checksum: '', lastUpdated: '' })).toBe(
      `42:${ROSU_PP_CALCULATOR_ID}:unversioned`,
    )
    expect(ppCacheKey({ ...base, checksum: '', lastUpdated: '2026-01-02' })).toBe(
      `42:${ROSU_PP_CALCULATOR_ID}:2026-01-02`,
    )
  })
})

describe('aggregatePpRange / formatPpRange', () => {
  it('returns the rounded min/max over computed values', () => {
    expect(aggregatePpRange([100.4, 250.6, 50.2])).toEqual({ min: 50, max: 251 })
  })

  it('collapses a single value and skips nulls/non-finite/negative values', () => {
    expect(aggregatePpRange([null, 80.5])).toEqual({ min: 81, max: 81 })
    expect(aggregatePpRange([null, Number.NaN, -3, Number.POSITIVE_INFINITY])).toBeNull()
    expect(aggregatePpRange([])).toBeNull()
    expect(aggregatePpRange([null, undefined])).toBeNull()
  })

  it('formats ranges, single values, and unavailable', () => {
    expect(formatPpRange({ min: 120, max: 890 })).toBe('120–890 pp')
    expect(formatPpRange({ min: 456, max: 456 })).toBe('456 pp')
    expect(formatPpRange(null)).toBe('—')
  })
})

describe('MemoryPpCache', () => {
  it('round-trips records', async () => {
    const cache = new MemoryPpCache()
    expect(await cache.get('k')).toBeNull()
    await cache.set('k', { pp: 12.5, version: '4.0.1', beatmapId: 7, storedAt: 1 })
    expect(await cache.get('k')).toEqual({ pp: 12.5, version: '4.0.1', beatmapId: 7, storedAt: 1 })
    await cache.clear()
    expect(await cache.get('k')).toBeNull()
  })

  it('evicts oldest-first past the cap', async () => {
    const cache = new MemoryPpCache()
    for (let i = 0; i < 1001; i++) {
      await cache.set(`k${i}`, { pp: i, version: '4.0.1', beatmapId: i, storedAt: i })
    }
    expect(await cache.get('k0')).toBeNull()
    expect(await cache.get('k1000')).not.toBeNull()
  })
})

describe('getPpRange orchestration (fake engine + fake fetch)', () => {
  const engine: PpEngine = {
    computeMaxPp: (_text, mode) =>
      ({ osu: 100.4, taiko: 50.6, fruits: 30.2, mania: 10.8 })[mode],
  }

  let backend: PpCacheBackend
  let fetchCalls: number[]
  let fetchImpl: (id: number) => Promise<string | null>

  beforeEach(() => {
    backend = new MemoryPpCache()
    __setPpCacheBackendForTests(backend)
    fetchCalls = []
    fetchImpl = async (id: number) => {
      fetchCalls.push(id)
      const name =
        id === 1 ? 'osu' : id === 2 ? 'taiko' : id === 3 ? 'catch' : ('mania' as const)
      return fixtureText(name)
    }
  })

  afterEach(() => {
    __setPpCacheBackendForTests(null)
  })

  const diffs: PpDifficultyInput[] = [
    { beatmapId: 1, mode: 'osu', checksum: 'cs1' },
    { beatmapId: 2, mode: 'taiko', checksum: 'cs2' },
    { beatmapId: 3, mode: 'fruits', checksum: 'cs3' },
    { beatmapId: 4, mode: 'mania', checksum: 'cs4' },
  ]

  it('aggregates the range over all difficulties', async () => {
    const range = await getPpRange(diffs, { engine, fetchOsuFile: fetchImpl })
    expect(range).toEqual({ min: 11, max: 100 })
    expect(fetchCalls).toEqual([1, 2, 3, 4])
  })

  it('serves the second call from cache without refetching', async () => {
    await getPpRange(diffs, { engine, fetchOsuFile: fetchImpl })
    expect(fetchCalls).toHaveLength(4)
    const range = await getPpRange(diffs, { engine, fetchOsuFile: fetchImpl })
    expect(range).toEqual({ min: 11, max: 100 })
    expect(fetchCalls).toHaveLength(4)
  })

  it('recomputes entries stored under a stale calculator version', async () => {
    await backend.set(ppCacheKey(diffs[0]), {
      pp: 999,
      version: '0.0.0',
      beatmapId: 1,
      storedAt: 1,
    })
    const range = await getPpRange([diffs[0]], { engine, fetchOsuFile: fetchImpl })
    expect(range).toEqual({ min: 100, max: 100 })
    expect(fetchCalls).toEqual([1])
    const stored = await backend.get(ppCacheKey(diffs[0]))
    expect(stored?.version).toBe(ROSU_PP_VERSION)
  })

  it('returns null when everything fails and never caches failures', async () => {
    let attempts = 0
    const failingFetch = async (_id: number): Promise<string | null> => {
      attempts += 1
      throw new Error('proxy down')
    }
    expect(await getPpRange(diffs, { engine, fetchOsuFile: failingFetch })).toBeNull()
    expect(await getPpRange(diffs, { engine, fetchOsuFile: failingFetch })).toBeNull()
    expect(attempts).toBe(8)
  })

  it('treats an engine failure as unavailable, not a crash', async () => {
    const throwing: PpEngine = {
      computeMaxPp: () => {
        throw new Error('wasm boom')
      },
    }
    expect(await getPpRange(diffs, { engine: throwing, fetchOsuFile: fetchImpl })).toBeNull()
  })

  it('treats a null engine result as unavailable for that difficulty only', async () => {
    const partial: PpEngine = {
      computeMaxPp: (_text, mode) => (mode === 'mania' ? null : 42.4),
    }
    const range = await getPpRange(diffs, { engine: partial, fetchOsuFile: fetchImpl })
    expect(range).toEqual({ min: 42, max: 42 })
  })

  it('dedupes concurrent computations for the same difficulty', async () => {
    let concurrent = 0
    let maxConcurrent = 0
    const slowFetch = async (id: number): Promise<string | null> => {
      fetchCalls.push(id)
      concurrent += 1
      maxConcurrent = Math.max(maxConcurrent, concurrent)
      await new Promise((r) => setTimeout(r, 10))
      concurrent -= 1
      return fixtureText('osu')
    }
    const one: PpDifficultyInput[] = [{ beatmapId: 9, mode: 'osu', checksum: 'cs9' }]
    const [a, b] = await Promise.all([
      getPpRange(one, { engine, fetchOsuFile: slowFetch }),
      getPpRange(one, { engine, fetchOsuFile: slowFetch }),
    ])
    expect(a).toEqual({ min: 100, max: 100 })
    expect(b).toEqual({ min: 100, max: 100 })
    expect(fetchCalls).toEqual([9])
    expect(maxConcurrent).toBe(1)
  })

  it('returns null for empty input without touching the engine or fetch', async () => {
    let engineCalled = false
    const spying: PpEngine = {
      computeMaxPp: () => {
        engineCalled = true
        return 1
      },
    }
    expect(await getPpRange([], { engine: spying, fetchOsuFile: fetchImpl })).toBeNull()
    expect(engineCalled).toBe(false)
    expect(fetchCalls).toHaveLength(0)
  })
})

describe('difficulties plumbing', () => {
  it('setToCandidate carries in-mode difficulties with version signals', () => {
    const set: SearchBeatmapset = {
      id: 99,
      title: 'T',
      artist: 'A',
      creator: 'C',
      status: 'ranked',
      beatmaps: [
        { id: 1, mode: 'osu', version: 'Insane', difficulty_rating: 5.0 },
        {
          id: 2,
          mode: 'mania',
          version: '4K',
          difficulty_rating: 3.5,
          checksum: 'cs-4k',
          last_updated: '2026-01-01T00:00:00Z',
        },
        { id: 3, mode: 'mania', version: '7K', difficulty_rating: 4.9, last_updated: '2026-02-01T00:00:00Z' },
        { id: 4, mode: 'mania', version: 'NoSR', difficulty_rating: Number.NaN },
      ],
    }
    const c = setToCandidate(set, 'mania', profile)
    expect(c?.difficulties).toEqual([
      { beatmapId: 2, mode: 'mania', checksum: 'cs-4k', lastUpdated: '2026-01-01T00:00:00Z' },
      { beatmapId: 3, mode: 'mania', checksum: undefined, lastUpdated: '2026-02-01T00:00:00Z' },
      { beatmapId: 4, mode: 'mania', checksum: undefined, lastUpdated: undefined },
    ])
    // SR range still uses the finite-SR subset only.
    expect(c?.srMin).toBe(3.5)
    expect(c?.srMax).toBe(4.9)
  })

  it('rankedSetToCandidate carries difficulties', () => {
    const set: SearchBeatmapset = {
      id: 7,
      title: 'T',
      artist: 'A',
      creator: 'C',
      status: 'ranked',
      ranked_date: '2026-10-20T00:00:00Z',
      beatmaps: [
        { id: 11, mode: 'mania', version: 'HD', difficulty_rating: 4.0, checksum: 'cs-hd' },
        { id: 12, mode: 'mania', version: 'MX', difficulty_rating: 5.0 },
      ],
    }
    const c = rankedSetToCandidate(set, 'mania')
    expect(c?.difficulties).toEqual([
      { beatmapId: 11, mode: 'mania', checksum: 'cs-hd', lastUpdated: undefined },
      { beatmapId: 12, mode: 'mania', checksum: undefined, lastUpdated: undefined },
    ])
  })
})
