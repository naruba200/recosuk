import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Regression tests for batch 5, item A: Generated mode must fetch the
 * NEXT window on successive generations with the same
 * profile+mode+filters, instead of re-running identical queries from
 * page 1 and re-serving (then seen-excluding) the same sets.
 *
 * The resume state is explicit and caller-owned (GenerationResume):
 * per-query cursors, null = spent. `fresh` restarts from page 1.
 */

const mocks = vi.hoisted(() => ({
  proxyCall: vi.fn(),
}))

vi.mock('../osu', () => ({
  proxyCall: mocks.proxyCall,
}))

import {
  defaultFiltersFor,
  emptyGenerationResume,
  FeedSession,
  generateRecommendations,
  type SearchBeatmapset,
  type SearchPage,
} from '../recommend'
import { computeSkillProfile, type SkillProfile } from '../skillProfile'
import type { OsuScore, OsuUser } from '../osu'
import {
  createSeenStore,
  seenKey,
  type SeenState,
  type StorageLike,
} from '../seenStore'
import { dataCache } from '../dataCache'

function memoryStorage(): StorageLike {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  }
}

beforeEach(() => {
  dataCache.clear()
  mocks.proxyCall.mockReset()
})

const EMPTY_SEEN: SeenState = { played: [], downloaded: [], skipped: [], served: [] }

function testUser(): OsuUser {
  return {
    id: 1,
    username: 'tester',
    playmode: 'mania',
    statistics: { pp: 100, hit_accuracy: 95, play_count: 10 },
  }
}

function bpmLessPlay(sr: number): OsuScore {
  return {
    accuracy: 0.96,
    pp: 50,
    max_combo: 100,
    mods: [],
    beatmap: {
      id: 1,
      beatmapset_id: 1,
      difficulty_rating: sr,
      version: '7K',
      total_length: 120,
      cs: 7,
      ar: 9,
      od: 8,
    },
  }
}

function testProfile(): SkillProfile {
  const plays = [bpmLessPlay(4.0), bpmLessPlay(4.2), bpmLessPlay(4.4), bpmLessPlay(4.6)]
  return computeSkillProfile(testUser(), plays, [], [], 'mania')
}

function testSet(id: number): SearchBeatmapset {
  return {
    id,
    title: `Test ${id}`,
    artist: 'Artist',
    creator: 'mapper',
    status: 'ranked',
    beatmaps: [
      {
        id: id * 10,
        mode: 'mania',
        version: '7K',
        difficulty_rating: 4.4,
        bpm: 170,
        total_length: 120,
        cs: 7,
        ar: 9,
        od: 8,
      },
    ],
  }
}

/** Cursor-aware search mock: one query, three pages. */
function mockPagedSearch() {
  const pages = new Map<string, SearchPage>([
    ['', { beatmapsets: [testSet(1), testSet(2)], cursor_string: 'c1', total: 6 }],
    ['c1', { beatmapsets: [testSet(3), testSet(4)], cursor_string: 'c2', total: 6 }],
    ['c2', { beatmapsets: [testSet(5), testSet(6)], cursor_string: null, total: 6 }],
  ])
  const calls: string[] = []
  mocks.proxyCall.mockImplementation(async (action: string, params?: Record<string, unknown>) => {
    if (action === 'searchBeatmapsets') {
      const cursor = typeof params?.cursor_string === 'string' ? params.cursor_string : ''
      calls.push(cursor)
      return pages.get(cursor) ?? { beatmapsets: [], cursor_string: null, total: 6 }
    }
    return { attributes: { star_rating: 4.4 } }
  })
  return calls
}

describe('Generated-mode resume (batch 5, item A)', () => {
  it('returns disjoint windows on successive generations with the same signature', async () => {
    mockPagedSearch()
    const profile = testProfile()
    const filters = defaultFiltersFor(profile)

    const first = await generateRecommendations(profile, 'mania', {
      count: 20,
      filters,
      seen: EMPTY_SEEN,
    })
    expect(first.items.map((c) => c.beatmapsetId).sort()).toEqual([1, 2, 3, 4])
    expect(first.diagnostics.windowExhausted).toBe(false)

    const second = await generateRecommendations(profile, 'mania', {
      count: 20,
      filters,
      seen: EMPTY_SEEN,
      resume: first.nextResume,
    })
    expect(second.items.map((c) => c.beatmapsetId).sort()).toEqual([5, 6])
    expect(second.diagnostics.windowExhausted).toBe(true)
  })

  it('reports windowExhausted and empty on a further generation once spent', async () => {
    mockPagedSearch()
    const profile = testProfile()
    const filters = defaultFiltersFor(profile)

    const first = await generateRecommendations(profile, 'mania', {
      count: 20,
      filters,
      seen: EMPTY_SEEN,
    })
    const second = await generateRecommendations(profile, 'mania', {
      count: 20,
      filters,
      seen: EMPTY_SEEN,
      resume: first.nextResume,
    })
    const third = await generateRecommendations(profile, 'mania', {
      count: 20,
      filters,
      seen: EMPTY_SEEN,
      resume: second.nextResume,
    })
    expect(third.items).toEqual([])
    expect(third.diagnostics.rawSets).toBe(0)
    expect(third.diagnostics.windowExhausted).toBe(true)
  })

  it('restarts from page 1 when no resume is passed', async () => {
    mockPagedSearch()
    const profile = testProfile()
    const filters = defaultFiltersFor(profile)

    const first = await generateRecommendations(profile, 'mania', {
      count: 20,
      filters,
      seen: EMPTY_SEEN,
    })
    const restarted = await generateRecommendations(profile, 'mania', {
      count: 20,
      filters,
      seen: EMPTY_SEEN,
    })
    expect(restarted.items.map((c) => c.beatmapsetId).sort()).toEqual(
      first.items.map((c) => c.beatmapsetId).sort(),
    )
  })

  it('fresh:true restarts from page 1 even with a resume', async () => {
    mockPagedSearch()
    const profile = testProfile()
    const filters = defaultFiltersFor(profile)

    const first = await generateRecommendations(profile, 'mania', {
      count: 20,
      filters,
      seen: EMPTY_SEEN,
    })
    const restarted = await generateRecommendations(profile, 'mania', {
      count: 20,
      filters,
      seen: EMPTY_SEEN,
      resume: first.nextResume,
      fresh: true,
    })
    expect(restarted.items.map((c) => c.beatmapsetId).sort()).toEqual([1, 2, 3, 4])
    expect(restarted.diagnostics.windowExhausted).toBe(false)
  })

  it('emptyGenerationResume starts every query unfetched', () => {
    expect(emptyGenerationResume()).toEqual({ cursors: {} })
  })
})

describe('Regenerate / Retry flow (batch 6, defect 1; part 4: Generated ignores seen)', () => {
  /**
   * The screen's regeneration paths (count pills, Retry, filter
   * Apply) must call generate() WITHOUT `fresh`, so the second
   * run carries the first run's resume and returns the NEXT
   * window. Since part 4, Generated runs pass `ignoreSeen: true`,
   * so the window advance — not seen exclusion — is what
   * separates the two runs. (The header Regenerate button was
   * removed in batch 7; Renew is the restart path.)
   */
  it('a second non-fresh generation returns the next window via the resume', async () => {
    mockPagedSearch()
    const profile = testProfile()
    const filters = defaultFiltersFor(profile)

    const first = await generateRecommendations(profile, 'mania', {
      count: 20,
      filters,
      seen: EMPTY_SEEN,
      ignoreSeen: true,
    })
    expect(first.items.map((c) => c.beatmapsetId).sort()).toEqual([1, 2, 3, 4])

    // The screen marks the served window, then a second non-fresh
    // generation runs again with the same signature and the
    // carried resume — no fresh.
    // Seen is ignored (part 4), so only the resume separates the
    // windows: the second run must return window 3's sets.
    const seenAfterFirst: SeenState = {
      ...EMPTY_SEEN,
      served: first.items.map((c) => c.beatmapsetId),
    }
    const second = await generateRecommendations(profile, 'mania', {
      count: 20,
      filters,
      seen: seenAfterFirst,
      resume: first.nextResume,
      ignoreSeen: true,
    })
    expect(second.items.map((c) => c.beatmapsetId).sort()).toEqual([5, 6])
    expect(second.diagnostics.windowExhausted).toBe(true)
  })

  it('the same second run WITH fresh restarts from page 1 (and re-serves it, since seen is ignored)', async () => {
    mockPagedSearch()
    const profile = testProfile()
    const filters = defaultFiltersFor(profile)

    const first = await generateRecommendations(profile, 'mania', {
      count: 20,
      filters,
      seen: EMPTY_SEEN,
      ignoreSeen: true,
    })
    const seenAfterFirst: SeenState = {
      ...EMPTY_SEEN,
      served: first.items.map((c) => c.beatmapsetId),
    }
    const restarted = await generateRecommendations(profile, 'mania', {
      count: 20,
      filters,
      seen: seenAfterFirst,
      resume: first.nextResume,
      fresh: true,
      ignoreSeen: true,
    })
    // Fresh discards the resume, so window 1 is fetched again — and
    // with seen ignored (part 4) its sets come back instead of the
    // old all-seen empty state. That is why Regenerate must not
    // pass fresh: only the resume advances the window.
    expect(restarted.items.map((c) => c.beatmapsetId).sort()).toEqual([1, 2, 3, 4])
    expect(restarted.diagnostics.windowExhausted).toBe(false)
  })
})

describe('Session-scoped served (batch 6, defect 2)', () => {
  it('a fresh store over the same storage loads served as [] with played/downloaded/skipped intact', async () => {
    // Session 1: window 1 served, one set downloaded, one skipped.
    // Session 2 (new store over the same storage, as after an app
    // reopen) loads with served dropped — the durable kinds stay.
    // (The engine-level consequence — Generated re-serving window 1
    // — is now unconditional under part 4, since Generated ignores
    // seen entirely; the feed's in-session dedupe is pinned below.)
    const storage = memoryStorage()
    const key = seenKey('guest', 'defect2')
    const session1 = createSeenStore(storage)
    session1.markMany(key, 'served', [1, 2, 3, 4])
    session1.mark(key, 'downloaded', 3)
    session1.mark(key, 'skipped', 4)

    const session2Seen = createSeenStore(storage).load(key)
    expect(session2Seen.served).toEqual([])
    expect(session2Seen.downloaded).toEqual([3])
    expect(session2Seen.skipped).toEqual([4])
  })
})

describe('Feed dedupe unchanged (batch 6, part 4)', () => {
  it('FeedSession still skips served sets in the same session and never re-serves them', async () => {
    mockPagedSearch()
    const profile = testProfile()
    const filters = {
      srMin: 0,
      srMax: 10,
      bpmMin: 60,
      bpmMax: 300,
      lenMinSec: 0,
      lenMaxSec: 600,
      rankedLovedOnly: false,
      keyCount: null,
      userTag: null,
    }
    const session = new FeedSession(
      profile,
      'mania',
      filters,
      { ...EMPTY_SEEN, served: [1] },
      'key',
      () => {},
    )
    // Set 1 is served: the feed skips it and serves the rest.
    const first = await session.take(20)
    expect(first.map((c) => c.beatmapsetId).sort()).toEqual([2, 3, 4, 5, 6])
    // The in-session no-repeat guarantee: a second take serves
    // nothing twice, and the session reports itself exhausted.
    const second = await session.take(20)
    expect(second).toEqual([])
    expect(session.exhausted).toBe(true)
  })
})

describe('Renew shuffle (batch 6, part 4)', () => {
  it('a Generated run with every fetched set seen still returns them (no seen exclusion)', async () => {
    mockPagedSearch()
    const profile = testProfile()
    const filters = defaultFiltersFor(profile)
    const seen: SeenState = {
      played: [],
      downloaded: [1, 2, 3, 4, 5, 6],
      skipped: [1, 2, 3, 4, 5, 6],
      served: [1, 2, 3, 4, 5, 6],
    }
    const result = await generateRecommendations(profile, 'mania', {
      count: 20,
      filters,
      seen,
      ignoreSeen: true,
    })
    expect(result.items.map((c) => c.beatmapsetId).sort()).toEqual([1, 2, 3, 4])
  })

  it('shuffle with a fixed-seed rng is a deterministic permutation of the ranked pool', async () => {
    mockPagedSearch()
    const profile = testProfile()
    const filters = defaultFiltersFor(profile)
    const base = { count: 20, filters, seen: EMPTY_SEEN, ignoreSeen: true }

    const plain = await generateRecommendations(profile, 'mania', base)
    expect(plain.diagnostics.shuffled).toBe(false)
    const plainIds = plain.items.map((c) => c.beatmapsetId)

    // rng always 0: Fisher-Yates swaps every element toward the
    // front — a fixed rotation of the ranked order, never the
    // identity for a pool of 4.
    const shuffled = await generateRecommendations(profile, 'mania', {
      ...base,
      shuffle: true,
      rng: () => 0,
    })
    const shuffledIds = shuffled.items.map((c) => c.beatmapsetId)
    expect([...shuffledIds].sort()).toEqual([...plainIds].sort())
    expect(shuffledIds).not.toEqual(plainIds)
    expect(shuffled.diagnostics.shuffled).toBe(true)

    // Same seed, same inputs: the identical order comes back.
    const again = await generateRecommendations(profile, 'mania', {
      ...base,
      shuffle: true,
      rng: () => 0,
    })
    expect(again.items.map((c) => c.beatmapsetId)).toEqual(shuffledIds)
  })

  it('two Renew runs with different rng seeds differ', async () => {
    mockPagedSearch()
    const profile = testProfile()
    const filters = defaultFiltersFor(profile)
    const base = { count: 20, filters, seen: EMPTY_SEEN, ignoreSeen: true }

    const first = await generateRecommendations(profile, 'mania', {
      ...base,
      shuffle: true,
      rng: () => 0,
    })
    // rng near 1: every Fisher-Yates pick keeps its place, so the
    // ranked order survives untouched — the opposite draw.
    const second = await generateRecommendations(profile, 'mania', {
      ...base,
      shuffle: true,
      rng: () => 0.999999,
    })
    expect(first.items.map((c) => c.beatmapsetId)).not.toEqual(
      second.items.map((c) => c.beatmapsetId),
    )
    expect(second.diagnostics.shuffled).toBe(true)
  })

  it('windowExhausted is still reported on a shuffled run', async () => {
    mockPagedSearch()
    const profile = testProfile()
    const filters = defaultFiltersFor(profile)
    const first = await generateRecommendations(profile, 'mania', {
      count: 20,
      filters,
      seen: EMPTY_SEEN,
      ignoreSeen: true,
    })
    const renewed = await generateRecommendations(profile, 'mania', {
      count: 20,
      filters,
      seen: EMPTY_SEEN,
      resume: first.nextResume,
      ignoreSeen: true,
      shuffle: true,
      rng: () => 0,
    })
    expect(renewed.items.map((c) => c.beatmapsetId).sort()).toEqual([5, 6])
    expect(renewed.diagnostics.windowExhausted).toBe(true)
    expect(renewed.diagnostics.shuffled).toBe(true)
  })
})
