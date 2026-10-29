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
  generateRecommendations,
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
