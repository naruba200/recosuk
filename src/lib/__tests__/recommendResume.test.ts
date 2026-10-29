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
  generateUnseenWindow,
  MAX_UNSEEN_WINDOW_SKIPS,
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
   * removed in batch 7; Renew is the advance path — it continues
   * via the resume, never restarts from page 1.)
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

describe('Renew determinism — no shuffle (shuffle removed 2026-10-29)', () => {
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

  it('identical inputs produce identical order: Renew is deterministic', async () => {
    mockPagedSearch()
    const profile = testProfile()
    const filters = defaultFiltersFor(profile)
    const base = { count: 20, filters, seen: EMPTY_SEEN, ignoreSeen: true }

    const first = await generateRecommendations(profile, 'mania', base)
    const plainIds = first.items.map((c) => c.beatmapsetId)

    // A fresh restart (page 1) returns the same PP-anchored
    // fixed ranking — no shuffle, no rng. (Renew itself no
    // longer restarts: it advances via the resume — see
    // generateUnseenWindow. Fresh restarts still happen on
    // filter/mode/profile changes.)
    const renewed = await generateRecommendations(profile, 'mania', {
      ...base,
      fresh: true,
    })
    expect(renewed.items.map((c) => c.beatmapsetId)).toEqual(plainIds)

    // And again: determinism holds across repeated runs.
    const again = await generateRecommendations(profile, 'mania', {
      ...base,
      fresh: true,
    })
    expect(again.items.map((c) => c.beatmapsetId)).toEqual(plainIds)
  })

  it('diagnostics carry no shuffle flag', async () => {
    mockPagedSearch()
    const profile = testProfile()
    const filters = defaultFiltersFor(profile)
    const result = await generateRecommendations(profile, 'mania', {
      count: 20,
      filters,
      seen: EMPTY_SEEN,
      ignoreSeen: true,
    })
    expect('shuffled' in result.diagnostics).toBe(false)
  })

  it('windowExhausted is still reported on a Renew-style resume-continue run', async () => {
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
    })
    expect(renewed.items.map((c) => c.beatmapsetId).sort()).toEqual([5, 6])
    expect(renewed.diagnostics.windowExhausted).toBe(true)
  })
})

describe('Renew-advance: generateUnseenWindow skips all-hidden windows (2026-10-29)', () => {
  /**
   * Cursor-aware search mock with an arbitrary page chain: each
   * entry is [cursorKey, setIds, nextCursor]. The mock ignores
   * the query text (as mockPagedSearch does), so every query
   * walks the same chain and the per-call fetch cap of 2 pages
   * yields 2 sets per page × 2 pages = 4 sets per window, then
   * the next windows in chain order.
   */
  function mockPagedSearchChain(chain: Array<[string, number[], string | null]>) {
    const pages = new Map<string, SearchPage>()
    for (const [key, ids, next] of chain) {
      pages.set(key, {
        beatmapsets: ids.map(testSet),
        cursor_string: next,
        total: 12,
      })
    }
    mocks.proxyCall.mockImplementation(async (action: string, params?: Record<string, unknown>) => {
      if (action === 'searchBeatmapsets') {
        const cursor = typeof params?.cursor_string === 'string' ? params.cursor_string : ''
        return pages.get(cursor) ?? { beatmapsets: [], cursor_string: null, total: 12 }
      }
      return { attributes: { star_rating: 4.4 } }
    })
  }

  function sixPageChain(): Array<[string, number[], string | null]> {
    return [
      ['', [1, 2], 'c1'],
      ['c1', [3, 4], 'c2'],
      ['c2', [5, 6], 'c3'],
      ['c3', [7, 8], 'c4'],
      ['c4', [9, 10], 'c5'],
      ['c5', [11, 12], null],
    ]
  }

  const baseOpts = (profile: ReturnType<typeof testProfile>) => ({
    count: 20,
    filters: defaultFiltersFor(profile),
    seen: EMPTY_SEEN,
    ignoreSeen: true,
  })

  it('returns the first window untouched when it has a visible map', async () => {
    mockPagedSearchChain(sixPageChain())
    const profile = testProfile()
    const { result, skippedWindows, hitSkipCap } = await generateUnseenWindow(
      profile,
      'mania',
      baseOpts(profile),
      (id) => id === 1,
    )
    expect(result.items.map((c) => c.beatmapsetId).sort((a, b) => a - b)).toEqual([1, 2, 3, 4])
    expect(skippedWindows).toBe(0)
    expect(hitSkipCap).toBe(false)
  })

  it('skips an all-hidden first window and returns the next window via the resume', async () => {
    mockPagedSearchChain(sixPageChain())
    const profile = testProfile()
    const hidden = new Set([1, 2, 3, 4])
    const { result, skippedWindows, hitSkipCap } = await generateUnseenWindow(
      profile,
      'mania',
      baseOpts(profile),
      (id) => hidden.has(id),
    )
    // Window 1 ([1..4]) is entirely hidden; window 2 ([5..8])
    // has visible maps and is returned, with its cursor spent
    // only through window 2 (a third window still exists).
    expect(result.items.map((c) => c.beatmapsetId).sort((a, b) => a - b)).toEqual([5, 6, 7, 8])
    expect(skippedWindows).toBe(1)
    expect(hitSkipCap).toBe(false)
    expect(result.diagnostics.windowExhausted).toBe(false)
    // The returned resume continues past the skipped window:
    // a further continue call serves window 3, never window 1.
    const next = await generateRecommendations(profile, 'mania', {
      ...baseOpts(profile),
      resume: result.nextResume,
    })
    expect(next.items.map((c) => c.beatmapsetId).sort((a, b) => a - b)).toEqual([9, 10, 11, 12])
  })

  it('a second Renew-advance call serves only ids the first never served', async () => {
    mockPagedSearchChain(sixPageChain())
    const profile = testProfile()
    const servedBefore = new Set<number>()
    const first = await generateUnseenWindow(
      profile,
      'mania',
      baseOpts(profile),
      (id) => servedBefore.has(id),
    )
    expect(first.result.items.map((c) => c.beatmapsetId).sort((a, b) => a - b)).toEqual([1, 2, 3, 4])
    for (const c of first.result.items) servedBefore.add(c.beatmapsetId)
    const second = await generateUnseenWindow(
      profile,
      'mania',
      { ...baseOpts(profile), resume: first.result.nextResume },
      (id) => servedBefore.has(id),
    )
    expect(second.result.items.map((c) => c.beatmapsetId).sort((a, b) => a - b)).toEqual([5, 6, 7, 8])
    expect(second.result.items.every((c) => !servedBefore.has(c.beatmapsetId))).toBe(true)
    expect(second.skippedWindows).toBe(0)
  })

  it('returns the last fetched window at exhaustion so the caller can fall back to it', async () => {
    mockPagedSearch()
    const profile = testProfile()
    const hidden = new Set([1, 2, 3, 4, 5, 6])
    const { result, skippedWindows, hitSkipCap } = await generateUnseenWindow(
      profile,
      'mania',
      baseOpts(profile),
      (id) => hidden.has(id),
    )
    // Window 1 hidden → skipped; window 2 ([5, 6]) hidden too
    // but its cursor is spent, so it is returned for the
    // exhaustion fallback instead of an empty list.
    expect(result.items.map((c) => c.beatmapsetId).sort((a, b) => a - b)).toEqual([5, 6])
    expect(result.diagnostics.windowExhausted).toBe(true)
    expect(skippedWindows).toBe(1)
    expect(hitSkipCap).toBe(false)
  })

  it('stops at the skip cap and reports it, with windows still unfetched', async () => {
    // Eight pages = four windows: the cap must stop the hunt at
    // window 3 with a fourth window still unfetched.
    mockPagedSearchChain([
      ['', [1, 2], 'c1'],
      ['c1', [3, 4], 'c2'],
      ['c2', [5, 6], 'c3'],
      ['c3', [7, 8], 'c4'],
      ['c4', [9, 10], 'c5'],
      ['c5', [11, 12], 'c6'],
      ['c6', [13, 14], 'c7'],
      ['c7', [15, 16], null],
    ])
    const profile = testProfile()
    const hidden = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
    const { result, skippedWindows, hitSkipCap } = await generateUnseenWindow(
      profile,
      'mania',
      baseOpts(profile),
      (id) => hidden.has(id),
      2,
    )
    // Two skips (windows 1 and 2), then the cap stops the hunt:
    // window 3 ([9..12]) is returned all-hidden, a fourth window
    // is still unfetched, and the cap is reported.
    expect(result.items.map((c) => c.beatmapsetId).sort((a, b) => a - b)).toEqual([9, 10, 11, 12])
    expect(result.diagnostics.windowExhausted).toBe(false)
    expect(skippedWindows).toBe(2)
    expect(hitSkipCap).toBe(true)
  })

  it('the default skip cap is 5', () => {
    expect(MAX_UNSEEN_WINDOW_SKIPS).toBe(5)
  })

  it('an empty-items window is returned as-is (diagnostics stay honest)', async () => {
    mocks.proxyCall.mockImplementation(async (action: string) => {
      if (action === 'searchBeatmapsets') return { beatmapsets: [], cursor_string: null, total: 0 }
      return { attributes: { star_rating: 4.4 } }
    })
    const profile = testProfile()
    const { result, skippedWindows } = await generateUnseenWindow(
      profile,
      'mania',
      baseOpts(profile),
      () => true,
    )
    expect(result.items).toEqual([])
    expect(result.diagnostics.windowExhausted).toBe(true)
    expect(skippedWindows).toBe(0)
  })

  it('fresh:true restarts from page 1 and the skip loop still advances from there', async () => {
    mockPagedSearchChain(sixPageChain())
    const profile = testProfile()
    const first = await generateRecommendations(profile, 'mania', baseOpts(profile))
    expect(first.items.map((c) => c.beatmapsetId).sort((a, b) => a - b)).toEqual([1, 2, 3, 4])
    const hidden = new Set([1, 2, 3, 4])
    const { result, skippedWindows } = await generateUnseenWindow(
      profile,
      'mania',
      { ...baseOpts(profile), resume: first.nextResume, fresh: true },
      (id) => hidden.has(id),
    )
    // Fresh discards the resume (page 1 again, all hidden), the
    // loop advances to window 2 instead of re-serving window 1.
    expect(result.items.map((c) => c.beatmapsetId).sort((a, b) => a - b)).toEqual([5, 6, 7, 8])
    expect(skippedWindows).toBe(1)
  })
})
