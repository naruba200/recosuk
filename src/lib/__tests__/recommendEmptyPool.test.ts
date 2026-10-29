import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Regression tests for the batch-3 silent-empty Recommendations bug
 * (item A): generation returned no items and no error, in every mode.
 *
 * Two systematic causes, both proven in code (no live probe was
 * possible — the VM has no .env/anon key, so the live proxy could not
 * be called from here):
 *
 * 1. INVERTED BPM WINDOW. computeSkillProfile calibrates bpmSweetMin/
 *    Max to 0 when no top play carries a BPM, and defaultFiltersFor
 *    turned that "unknown" into bpmMin=60, bpmMax=30 — a window that
 *    matches nothing upstream and filters out every candidate with
 *    a BPM. Silent, all modes, no error.
 * 2. UNKNOWN CS DROPPED MANIA. applyFilters dropped mania candidates
 *    whose CS was unknown (0) when a keyCount was set, contradicting
 *    Mirror's "unknown values pass" rule.
 *
 * These tests pin the fixes: unknown BPM gets the wide window, and
 * unknown CS passes the key-count filter. Diagnostics pin the WHY
 * reporting for genuinely empty pools.
 */

const mocks = vi.hoisted(() => ({
  proxyCall: vi.fn(),
}))

vi.mock('../osu', () => ({
  proxyCall: mocks.proxyCall,
}))

import {
  FeedSession,
  applyFilters,
  clearRecTag,
  defaultFiltersFor,
  emptyPoolReason,
  generateRecommendations,
  hasKnownBpm,
  pickDifficulty,
  setToCandidate,
  widenRecFilters,
  type SearchBeatmapset,
  type SearchPage,
} from '../recommend'
import { computeSkillProfile, type SkillProfile } from '../skillProfile'
import type { OsuScore, OsuUser } from '../osu'
import type { SeenState } from '../seenStore'
import { dataCache } from '../dataCache'

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

/** A top play whose beatmap carries NO bpm (the real-API shape that
 *  used to poison the filter window). */
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

function bpmLessProfile(): SkillProfile {
  const plays = [bpmLessPlay(4.0), bpmLessPlay(4.2), bpmLessPlay(4.4), bpmLessPlay(4.6)]
  return computeSkillProfile(testUser(), plays, [], [], 'mania')
}

function testSet(overrides: Partial<SearchBeatmapset> = {}): SearchBeatmapset {
  return {
    id: 1,
    title: 'Test',
    artist: 'Artist',
    creator: 'mapper',
    status: 'ranked',
    beatmaps: [
      {
        id: 10,
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
    ...overrides,
  }
}

function pageResponse(sets: SearchBeatmapset[], total = 1): SearchPage {
  return { beatmapsets: sets, cursor_string: null, total }
}

function mockSearch(sets: SearchBeatmapset[]) {
  const queries: string[] = []
  mocks.proxyCall.mockImplementation(async (action: string, params?: Record<string, unknown>) => {
    if (action === 'searchBeatmapsets') {
      if (typeof params?.query === 'string') queries.push(params.query)
      return pageResponse(sets)
    }
    return { attributes: { star_rating: 4.4 } }
  })
  return queries
}

describe('unknown-BPM profiles (item A, cause 1)', () => {
  it('calibrates the BPM sweet spot to unknown (0) when no top play reports a BPM', () => {
    const profile = bpmLessProfile()
    expect(profile.isStarter).toBe(false)
    expect(profile.bpmSweetMin).toBe(0)
    expect(profile.bpmSweetMax).toBe(0)
    expect(hasKnownBpm(profile)).toBe(false)
  })

  it('never emits an inverted BPM window for an unknown-BPM profile', () => {
    const filters = defaultFiltersFor(bpmLessProfile())
    expect(filters.bpmMin).toBeLessThanOrEqual(filters.bpmMax)
    expect(filters.bpmMin).toBe(60)
    expect(filters.bpmMax).toBe(300)
  })

  it('generates recommendations for an unknown-BPM profile instead of an empty list', async () => {
    const queries = mockSearch([testSet({ id: 2 })])
    const profile = bpmLessProfile()
    const result = await generateRecommendations(profile, 'mania', {
      count: 20,
      filters: defaultFiltersFor(profile),
      seen: EMPTY_SEEN,
    })
    expect(result.items.map((c) => c.beatmapsetId)).toEqual([2])
    expect(result.diagnostics.rawSets).toBe(1)
    // The query sent upstream must carry the wide fallback window,
    // never the inverted bpm>=60 bpm<=30 one.
    expect(queries.length).toBeGreaterThan(0)
    expect(queries[0]).toContain('bpm>=60')
    expect(queries[0]).toContain('bpm<=300')
    // The inverted window is bpm<=30 as a whole clause, not the
    // prefix of bpm<=300 — guard with a lookahead, not substring.
    expect(queries[0]).not.toMatch(/bpm<=30(?!\d)/)
  })

  it('still uses the sweet-spot window when BPM data is known', () => {
    const profile: SkillProfile = {
      ...bpmLessProfile(),
      bpmSweetMin: 170,
      bpmSweetMax: 190,
    }
    expect(hasKnownBpm(profile)).toBe(true)
    const filters = defaultFiltersFor(profile)
    expect(filters.bpmMin).toBe(140)
    expect(filters.bpmMax).toBe(220)
  })

  it('feeds the Unlimited session for an unknown-BPM profile', async () => {
    mockSearch([testSet({ id: 3 })])
    const profile = bpmLessProfile()
    const session = new FeedSession(
      profile,
      'mania',
      defaultFiltersFor(profile),
      EMPTY_SEEN,
      'key',
      () => {},
    )
    const items = await session.take(10)
    expect(items.map((c) => c.beatmapsetId)).toEqual([3])
    expect(session.examinedSets).toBe(1)
    expect(session.producedCandidates).toBe(1)
  })
})

describe('unknown-CS mania candidates (item A, cause 2)', () => {
  it('keeps mania sets whose difficulties carry no CS (base Beatmap shape)', async () => {
    mockSearch([
      testSet({
        id: 4,
        beatmaps: [
          {
            id: 11,
            mode: 'mania',
            version: '7K',
            difficulty_rating: 4.4,
            total_length: 120,
          },
        ],
      }),
    ])
    const profile = bpmLessProfile()
    // keyCount is set (7K main) — the unknown-CS set must still pass.
    const filters = { ...defaultFiltersFor(profile), keyCount: 7 }
    const result = await generateRecommendations(profile, 'mania', {
      count: 20,
      filters,
      seen: EMPTY_SEEN,
    })
    expect(result.items.map((c) => c.beatmapsetId)).toEqual([4])
  })

  it('still enforces key count when CS is known', async () => {
    mockSearch([testSet({ id: 5 })]) // cs 7
    const profile = bpmLessProfile()
    const filters = { ...defaultFiltersFor(profile), keyCount: 4 }
    const result = await generateRecommendations(profile, 'mania', {
      count: 20,
      filters,
      seen: EMPTY_SEEN,
    })
    expect(result.items).toEqual([])
    expect(result.diagnostics.afterFilters).toBe(0)
  })
})

describe('empty-pool diagnostics (item A, WHY reporting)', () => {
  it('reports zero raw sets when upstream returns nothing', async () => {
    mockSearch([])
    const profile = bpmLessProfile()
    const result = await generateRecommendations(profile, 'mania', {
      count: 20,
      filters: defaultFiltersFor(profile),
      seen: EMPTY_SEEN,
    })
    expect(result.items).toEqual([])
    expect(result.diagnostics.rawSets).toBe(0)
    expect(emptyPoolReason(result.diagnostics, defaultFiltersFor(profile))).toContain(
      'returned no beatmapsets',
    )
  })

  it('names the filter stage when sets arrive but none survive filtering', async () => {
    mockSearch([testSet({ id: 6, beatmaps: [{ id: 12, mode: 'mania', version: '7K', difficulty_rating: 9.0, bpm: 170, total_length: 120, cs: 7 }] })])
    const profile = bpmLessProfile()
    const filters = defaultFiltersFor(profile)
    const result = await generateRecommendations(profile, 'mania', {
      count: 20,
      filters,
      seen: EMPTY_SEEN,
    })
    expect(result.items).toEqual([])
    expect(result.diagnostics.rawSets).toBe(1)
    expect(result.diagnostics.afterPick).toBe(1)
    expect(result.diagnostics.afterFilters).toBe(0)
    expect(emptyPoolReason(result.diagnostics, filters)).toContain('filtered out')
  })

  it('names the seen-set stage when only seen maps remain', async () => {
    mockSearch([testSet({ id: 7 })])
    const profile = bpmLessProfile()
    const seen: SeenState = { ...EMPTY_SEEN, served: [7] }
    const result = await generateRecommendations(profile, 'mania', {
      count: 20,
      filters: defaultFiltersFor(profile),
      seen,
    })
    expect(result.items).toEqual([])
    expect(result.diagnostics.afterFilters).toBe(1)
    expect(result.diagnostics.afterSeen).toBe(0)
    expect(emptyPoolReason(result.diagnostics, defaultFiltersFor(profile))).toContain(
      'already served',
    )
  })
})

describe('all-seen pool: "Generate anyway" (item E2)', () => {
  it('regenerates with seen-filtering disabled for that run only', async () => {
    mockSearch([testSet({ id: 7 })])
    const profile = bpmLessProfile()
    const seen: SeenState = { ...EMPTY_SEEN, served: [7], downloaded: [7], skipped: [7] }
    const filters = defaultFiltersFor(profile)

    // Normal generation: the all-seen pool stays empty.
    const normal = await generateRecommendations(profile, 'mania', { count: 20, filters, seen })
    expect(normal.items).toEqual([])
    expect(normal.diagnostics.afterSeen).toBe(0)

    // The "Generate anyway" run: same seen state passed in, but the
    // exclusion is skipped — candidates come back.
    const anyway = await generateRecommendations(profile, 'mania', {
      count: 20,
      filters,
      seen,
      ignoreSeen: true,
    })
    expect(anyway.items.map((c) => c.beatmapsetId)).toEqual([7])
    expect(anyway.diagnostics.afterSeen).toBe(1)

    // The seen state itself was never mutated by either run.
    expect(seen.served).toEqual([7])
  })

  it('still excludes seen maps on normal generations (no leakage from the anyway run)', async () => {
    mockSearch([testSet({ id: 7 }), testSet({ id: 8 })])
    const profile = bpmLessProfile()
    const seen: SeenState = { ...EMPTY_SEEN, served: [7] }
    const filters = defaultFiltersFor(profile)

    await generateRecommendations(profile, 'mania', { count: 20, filters, seen, ignoreSeen: true })
    const normal = await generateRecommendations(profile, 'mania', { count: 20, filters, seen })
    expect(normal.items.map((c) => c.beatmapsetId)).toEqual([8])
  })
})

describe('filter-aware difficulty pick (Retry-loop fix)', () => {
  // A set whose closest-to-target difficulty is unplayable under the
  // active BPM window while another difficulty in the same set fits.
  // Picking blindly nominated the unplayable one and applyFilters
  // dropped the whole set — "101 sets came back, every one filtered
  // out", and Retry (same deterministic queries) looped forever.
  function twoDiffSet(): SearchBeatmapset {
    return testSet({
      beatmaps: [
        {
          id: 10,
          mode: 'mania',
          version: '7K',
          difficulty_rating: 4.6,
          bpm: 250,
          total_length: 120,
          cs: 7,
          ar: 9,
          od: 8,
        },
        {
          id: 11,
          mode: 'mania',
          version: '7K EX',
          difficulty_rating: 5.4,
          bpm: 150,
          total_length: 120,
          cs: 7,
          ar: 9,
          od: 8,
        },
      ],
    })
  }

  const BOUNDS = { srMin: 3, srMax: 6, bpmMin: 60, bpmMax: 180, lenMinSec: 0, lenMaxSec: 600 }

  it('prefers a difficulty inside the BPM window over a closer-SR one outside it', () => {
    const profile = bpmLessProfile()
    expect(pickDifficulty(twoDiffSet(), 'mania', profile)?.id).toBe(10)
    expect(pickDifficulty(twoDiffSet(), 'mania', profile, BOUNDS)?.id).toBe(11)
  })

  it('falls back to the closest difficulty when none fits the window', () => {
    const profile = bpmLessProfile()
    const narrow = { ...BOUNDS, bpmMin: 60, bpmMax: 100 }
    expect(pickDifficulty(twoDiffSet(), 'mania', profile, narrow)?.id).toBe(10)
  })

  it('nominates the in-window difficulty so the set survives filtering', async () => {
    const profile = bpmLessProfile()
    const filters = {
      ...defaultFiltersFor(profile),
      srMin: 3,
      srMax: 6,
      bpmMin: 60,
      bpmMax: 180,
      lenMinSec: 0,
      lenMaxSec: 600,
      tagText: '',
    }
    const blind = setToCandidate(twoDiffSet(), 'mania', profile)
    expect(blind?.bpm).toBe(250)
    expect(applyFilters(blind ? [blind] : [], filters, 'mania')).toEqual([])
    const picked = setToCandidate(twoDiffSet(), 'mania', profile, filters)
    expect(picked?.bpm).toBe(150)
    expect(applyFilters(picked ? [picked] : [], filters, 'mania')).toHaveLength(1)
  })

  it('generates the set end-to-end when a playable difficulty exists in-window', async () => {
    mockSearch([twoDiffSet()])
    const profile = bpmLessProfile()
    const filters = {
      ...defaultFiltersFor(profile),
      srMin: 3,
      srMax: 6,
      bpmMin: 60,
      bpmMax: 180,
      lenMinSec: 0,
      lenMaxSec: 600,
      tagText: '',
    }
    const result = await generateRecommendations(profile, 'mania', {
      count: 20,
      filters,
      seen: EMPTY_SEEN,
    })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].bpm).toBe(150)
  })

  it('widenRecFilters widens ranges and keeps the tag; clearRecTag drops only the tag', () => {
    const base = {
      ...defaultFiltersFor(bpmLessProfile()),
      srMin: 4,
      srMax: 5,
      bpmMin: 150,
      bpmMax: 190,
      lenMinSec: 60,
      lenMaxSec: 300,
      tagText: 'piano',
    }
    const widened = widenRecFilters(base)
    expect(widened.srMin).toBe(3)
    expect(widened.srMax).toBe(6)
    expect(widened.bpmMin).toBe(120)
    expect(widened.bpmMax).toBe(220)
    expect(widened.lenMinSec).toBe(0)
    expect(widened.lenMaxSec).toBe(3600)
    expect(widened.tagText).toBe('piano')
    expect(clearRecTag(base).tagText).toBe('')
    expect(clearRecTag(base).srMin).toBe(4)
  })
})
