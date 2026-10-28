import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Regression tests for the QA-batch-2 Recommendations crash (item 0).
 *
 * The user's console showed a 400 from osu-proxy (the getMostPlayed
 * call omitted `mode`, which the Edge Function demanded for every
 * action) plus an uncaught TypeError in Recommendations. The 400 half
 * is fixed in profileService.ts (mode now sent) and in the Edge
 * Function source (mode no longer required for getMostPlayed); these
 * tests pin the hardening that keeps ANY malformed payload on this
 * path from crashing the list — failures must degrade to empty
 * results / surfaced errors, never an uncaught TypeError.
 *
 * NOTE on the reported property name: the string 'M_ID' appears
 * nowhere in app code, the Edge Function, or the checked
 * dependencies (grep-verified) — the exact minified frame could not
 * be reproduced here. What IS proven: the 400, plus the
 * undefined-payload path in proxyCall that turned any empty 200 into
 * downstream TypeErrors. Both are fixed and pinned below.
 */

const mocks = vi.hoisted(() => ({
  proxyCall: vi.fn(),
}))

vi.mock('../osu', () => ({
  proxyCall: mocks.proxyCall,
}))

import {
  FeedSession,
  generateRecommendations,
  pickDifficulty,
  setToCandidate,
  type SearchBeatmapset,
  type SearchPage,
} from '../recommend'
import { computeSkillProfile, type SkillProfile } from '../skillProfile'
import type { OsuScore, OsuUser } from '../osu'
import type { SeenState } from '../seenStore'
import { dataCache } from '../dataCache'

// The search-page cache (item 5) is module state shared by every
// test in this file: clear it between tests so each mocked-proxy
// scenario sees its own mock, not the previous test's cached page.
beforeEach(() => {
  dataCache.clear()
})

const EMPTY_SEEN: SeenState = { played: [], downloaded: [], skipped: [], served: [] }

function testProfile(): SkillProfile {
  return {
    mode: 'mania',
    pp: 100,
    globalRank: null,
    countryRank: null,
    accuracy: 95,
    playCount: 10,
    comfortSrMin: 3.5,
    comfortSrMax: 4.5,
    comfortAccuracy: 96,
    srCeiling: 5,
    ceilingAccuracy: null,
    bpmSweetMin: 150,
    bpmSweetMax: 180,
    bpmMean: 165,
    avgAr: 0,
    keyCounts: { 7: 10 },
    mainKeyCount: 7,
    keySharePct: 100,
    accuracyBands: [],
    modUsage: [],
    playstyleTags: [],
    recentAccuracy: null,
    topPlayCount: 10,
    isStarter: false,
    generatedAt: '2026-10-29T00:00:00.000Z',
  }
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

describe('setToCandidate / pickDifficulty hardening', () => {
  it('returns null for a null/undefined set instead of dereferencing it', () => {
    expect(setToCandidate(null as unknown as SearchBeatmapset, 'mania', testProfile())).toBeNull()
    expect(
      setToCandidate(undefined as unknown as SearchBeatmapset, 'mania', testProfile()),
    ).toBeNull()
    expect(setToCandidate({} as SearchBeatmapset, 'mania', testProfile())).toBeNull()
  })

  it('returns null when the only in-mode difficulty has no star rating', () => {
    const set = testSet({
      beatmaps: [
        {
          id: 11,
          mode: 'mania',
          version: '7K',
          difficulty_rating: undefined as unknown as number,
        },
      ],
    })
    expect(pickDifficulty(set, 'mania', testProfile())).toBeNull()
    expect(setToCandidate(set, 'mania', testProfile())).toBeNull()
  })

  it('skips SR-less difficulties and picks the rated one', () => {
    const set = testSet({
      beatmaps: [
        { id: 11, mode: 'mania', version: 'NM', difficulty_rating: NaN },
        {
          id: 12,
          mode: 'mania',
          version: 'HD',
          difficulty_rating: 4.6,
          bpm: 170,
          total_length: 100,
          cs: 7,
        },
      ],
    })
    expect(pickDifficulty(set, 'mania', testProfile())?.id).toBe(12)
  })
})

describe('generateRecommendations hardening (mocked proxy)', () => {
  beforeEach(() => {
    mocks.proxyCall.mockReset()
  })

  function pageResponse(sets: SearchBeatmapset[], total = 1): SearchPage {
    return { beatmapsets: sets, cursor_string: null, total }
  }

  it('survives a page whose beatmapsets array is missing (malformed 200)', async () => {
    // The exact shape that used to crash: proxyCall resolves with a
    // payload that has no beatmapsets list at all.
    mocks.proxyCall.mockImplementation(async (action: string) => {
      if (action === 'searchBeatmapsets') return { total: 0 }
      return { attributes: { star_rating: 4.4 } }
    })
    const result = await generateRecommendations(testProfile(), 'mania', {
      count: 20,
      filters: {
        srMin: 0,
        srMax: 10,
        bpmMin: 60,
        bpmMax: 300,
        lenMinSec: 0,
        lenMaxSec: 600,
        rankedLovedOnly: false,
        keyCount: null,
        tagText: '',
      },
      seen: EMPTY_SEEN,
    })
    expect(result.items).toEqual([])
    expect(result.poolSize).toBe(0)
  })

  it('survives an undefined page payload without throwing', async () => {
    mocks.proxyCall.mockResolvedValue(undefined)
    const result = await generateRecommendations(testProfile(), 'mania', {
      count: 20,
      filters: {
        srMin: 0,
        srMax: 10,
        bpmMin: 60,
        bpmMax: 300,
        lenMinSec: 0,
        lenMaxSec: 600,
        rankedLovedOnly: false,
        keyCount: null,
        tagText: '',
      },
      seen: EMPTY_SEEN,
    })
    expect(result.items).toEqual([])
  })

  it('skips null entries inside beatmapsets instead of crashing', async () => {
    mocks.proxyCall.mockImplementation(async (action: string) => {
      if (action === 'searchBeatmapsets') {
        return pageResponse([
          null as unknown as SearchBeatmapset,
          testSet({ id: 2 }),
        ])
      }
      return { attributes: { star_rating: 4.4 } }
    })
    const result = await generateRecommendations(testProfile(), 'mania', {
      count: 20,
      filters: {
        srMin: 0,
        srMax: 10,
        bpmMin: 60,
        bpmMax: 300,
        lenMinSec: 0,
        lenMaxSec: 600,
        rankedLovedOnly: false,
        keyCount: null,
        tagText: '',
      },
      seen: EMPTY_SEEN,
    })
    expect(result.items.map((c) => c.beatmapsetId)).toEqual([2])
  })

  it('propagates a proxy failure as a rejection the screens catch (error panel, not a crash)', async () => {
    mocks.proxyCall.mockRejectedValue(new Error('proxy 400'))
    await expect(
      generateRecommendations(testProfile(), 'mania', {
        count: 20,
        filters: {
          srMin: 0,
          srMax: 10,
          bpmMin: 60,
          bpmMax: 300,
          lenMinSec: 0,
          lenMaxSec: 600,
          rankedLovedOnly: false,
          keyCount: null,
          tagText: '',
        },
        seen: EMPTY_SEEN,
      }),
    ).rejects.toThrow('proxy 400')
  })
})

describe('FeedSession hardening (mocked proxy)', () => {
  beforeEach(() => {
    mocks.proxyCall.mockReset()
  })

  it('take() returns [] and exhausts instead of crashing on a malformed page', async () => {
    mocks.proxyCall.mockResolvedValue({ total: 0 })
    const session = new FeedSession(
      testProfile(),
      'mania',
      {
        srMin: 0,
        srMax: 10,
        bpmMin: 60,
        bpmMax: 300,
        lenMinSec: 0,
        lenMaxSec: 600,
        rankedLovedOnly: false,
        keyCount: null,
        tagText: '',
      },
      EMPTY_SEEN,
      'key',
      () => {},
    )
    const items = await session.take(10)
    expect(items).toEqual([])
    expect(session.exhausted).toBe(true)
  })
})

describe('computeSkillProfile hardening', () => {
  function user(): OsuUser {
    return {
      id: 1,
      username: 'tester',
      playmode: 'mania',
      statistics: { pp: 100, hit_accuracy: 95, play_count: 10 },
    }
  }

  function play(sr: number | undefined): OsuScore {
    return {
      accuracy: 0.96,
      pp: 50,
      max_combo: 100,
      mods: [],
      beatmap: {
        id: 1,
        beatmapset_id: 1,
        difficulty_rating: sr as number,
        version: '7K',
        bpm: 170,
      },
    }
  }

  it('never produces NaN comfort bands when top plays lack star ratings', () => {
    const profile = computeSkillProfile(user(), [play(undefined), play(undefined)], [], [], 'mania')
    expect(Number.isFinite(profile.comfortSrMin)).toBe(true)
    expect(Number.isFinite(profile.comfortSrMax)).toBe(true)
    expect(Number.isFinite(profile.srCeiling)).toBe(true)
    expect(profile.topPlayCount).toBe(2)
  })

  it('calibrates normally when ratings are present', () => {
    const profile = computeSkillProfile(
      user(),
      [play(4.0), play(4.2), play(4.4), play(4.6)],
      [],
      [],
      'mania',
    )
    expect(profile.isStarter).toBe(false)
    expect(profile.comfortSrMin).toBeGreaterThan(0)
  })
})
