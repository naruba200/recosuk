import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  boostForCandidate,
  deleteFeedback,
  enrichRatedSets,
  loadAllFeedback,
  loadFeedbackForBeatmap,
  loadFeedbackForMode,
  upsertFeedback,
  type RatedSetFeatures,
} from '../feedback'
import { scoreAndSort, type RecCandidate } from '../recommend'
import { computeSkillProfile, type SkillProfile } from '../skillProfile'
import type { OsuScore, OsuUser } from '../osu'
import { FakeDb } from './fakeSupabase'

function client(db: FakeDb): SupabaseClient {
  return db as unknown as SupabaseClient
}

// ---------------------------------------------------------------------------
// Service tests (fake Supabase, no network)
// ---------------------------------------------------------------------------

describe('feedback service (M5)', () => {
  it('loads only the requested mode’s feedback', async () => {
    const db = new FakeDb({
      map_feedback: [
        { id: 'f1', user_id: 'u1', beatmap_id: 1, beatmapset_id: 10, mode: 'mania', status: 'tried', rating: 5, created_at: '2026-01-02T00:00:00Z' },
        { id: 'f2', user_id: 'u1', beatmap_id: 2, beatmapset_id: 20, mode: 'osu', status: 'tried', rating: 4, created_at: '2026-01-03T00:00:00Z' },
        { id: 'f3', user_id: 'u2', beatmap_id: 3, beatmapset_id: 30, mode: 'mania', status: 'tried', rating: 5, created_at: '2026-01-04T00:00:00Z' },
      ],
    })
    const mania = await loadFeedbackForMode(client(db), 'u1', 'mania')
    expect(mania.map((f) => f.beatmap_id)).toEqual([1])
    const osu = await loadFeedbackForMode(client(db), 'u1', 'osu')
    expect(osu.map((f) => f.beatmap_id)).toEqual([2])
  })

  it('upserts one row per difficulty: re-rating replaces, never duplicates', async () => {
    const db = new FakeDb()
    await upsertFeedback(client(db), 'u1', { beatmapId: 5, beatmapsetId: 50, mode: 'mania', status: 'tried', rating: 3 })
    const updated = await upsertFeedback(client(db), 'u1', { beatmapId: 5, beatmapsetId: 50, mode: 'mania', status: 'tried', rating: 5 })
    expect(updated.rating).toBe(5)
    const rows = await loadFeedbackForMode(client(db), 'u1', 'mania')
    expect(rows).toHaveLength(1)
    expect(rows[0].rating).toBe(5)
  })

  it('rejects ratings outside 1–5', async () => {
    const db = new FakeDb()
    await expect(
      upsertFeedback(client(db), 'u1', { beatmapId: 5, beatmapsetId: 50, mode: 'mania', status: 'tried', rating: 6 }),
    ).rejects.toThrow('between 1 and 5')
  })

  it('loadFeedbackForBeatmap returns null when unrated, the row when rated', async () => {
    const db = new FakeDb()
    expect(await loadFeedbackForBeatmap(client(db), 'u1', 9)).toBeNull()
    await upsertFeedback(client(db), 'u1', { beatmapId: 9, beatmapsetId: 90, mode: 'taiko', status: 'skipped', rating: null })
    const found = await loadFeedbackForBeatmap(client(db), 'u1', 9)
    expect(found?.status).toBe('skipped')
    expect(found?.rating).toBeNull()
  })

  it('loadAllFeedback returns every mode, newest first; deleteFeedback removes', async () => {
    const db = new FakeDb({
      map_feedback: [
        { id: 'f1', user_id: 'u1', beatmap_id: 1, beatmapset_id: 10, mode: 'mania', status: 'tried', rating: 5, created_at: '2026-01-01T00:00:00Z' },
        { id: 'f2', user_id: 'u1', beatmap_id: 2, beatmapset_id: 20, mode: 'osu', status: 'skipped', rating: null, created_at: '2026-01-02T00:00:00Z' },
      ],
    })
    expect((await loadAllFeedback(client(db), 'u1')).map((f) => f.beatmap_id)).toEqual([2, 1])
    await deleteFeedback(client(db), 'u1', 2)
    expect((await loadAllFeedback(client(db), 'u1')).map((f) => f.beatmap_id)).toEqual([1])
  })

  it('throws a readable error when Supabase is not connected', async () => {
    await expect(loadFeedbackForMode(null, 'u1', 'mania')).rejects.toThrow('Supabase is not connected')
  })
})

describe('enrichRatedSets (M5)', () => {
  it('enriches with tags + rated-difficulty SR, skips unrated and id-less rows, honours the limit', async () => {
    const calls: number[] = []
    const enriched = await enrichRatedSets(
      [
        { user_id: 'u1', beatmap_id: 11, beatmapset_id: 1, mode: 'mania', status: 'tried', rating: 5 },
        { user_id: 'u1', beatmap_id: 12, beatmapset_id: 2, mode: 'mania', status: 'tried', rating: null },
        { user_id: 'u1', beatmap_id: 13, beatmapset_id: null, mode: 'mania', status: 'tried', rating: 4 },
        { user_id: 'u1', beatmap_id: 14, beatmapset_id: 3, mode: 'mania', status: 'tried', rating: 1 },
      ],
      {
        limit: 1,
        fetchSummary: async (id) => {
          calls.push(id)
          return { tags: ['jumpstream'], difficultySr: 4.4 }
        },
      },
    )
    expect(calls).toEqual([1])
    expect(enriched).toEqual([{ beatmapsetId: 1, rating: 5, tags: ['jumpstream'], sr: 4.4 }])
  })

  it('a failed metadata fetch degrades to direct-only, never throws', async () => {
    const enriched = await enrichRatedSets(
      [{ user_id: 'u1', beatmap_id: 11, beatmapset_id: 1, mode: 'mania', status: 'tried', rating: 5 }],
      {
        fetchSummary: async () => {
          throw new Error('proxy not redeployed')
        },
      },
    )
    expect(enriched).toEqual([{ beatmapsetId: 1, rating: 5, tags: [], sr: null }])
  })
})

// ---------------------------------------------------------------------------
// Learning behaviour tests (mocked feedback, no live calls)
// ---------------------------------------------------------------------------

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

function cand(id: number, over: Partial<RecCandidate> = {}): RecCandidate {
  return {
    beatmapsetId: id,
    beatmapId: id * 10,
    title: `Map ${id}`,
    artist: 'Artist',
    creator: 'mapper',
    version: '7K',
    sr: 4.4,
    srMin: 4.4,
    srMax: 4.4,
    bpm: 170,
    lengthSec: 120,
    cs: 7,
    ar: 9,
    od: 8,
    tags: [],
    status: 'ranked',
    playCount: 100,
    favouriteCount: 10,
    popularity: 0.5,
    score: 0,
    reason: '',
    ppPotential: 0,
    ...over,
  }
}

describe('per-mode learning (M5 behaviour)', () => {
  it('mania ratings change the mania ordering and leave an identical osu! run untouched', () => {
    const profile = testProfile()
    const maniaRated: RatedSetFeatures[] = [
      { beatmapsetId: 1, rating: 5, tags: ['jumpstream'], sr: 4.4 },
    ]
    const candidates = [
      cand(1, { tags: ['jumpstream'] }),
      cand(2, { tags: ['jumpstream'] }),
      cand(3, { tags: ['stream'] }),
    ]
    const baseline = scoreAndSort(candidates, profile, { playedSetIds: new Set() })
    const learned = scoreAndSort(candidates, profile, {
      playedSetIds: new Set(),
      boostFor: (c) => boostForCandidate(maniaRated, c),
    })
    // The 5★ set's tag affinity lifts the matching candidate above
    // the non-matching one; the baseline had them the other way
    // (tie broken by beatmapset id) or tied — either way the order
    // moves measurably.
    expect(learned.map((c) => c.beatmapsetId)).not.toEqual(baseline.map((c) => c.beatmapsetId))
    expect(learned[0].beatmapsetId).toBe(2)
    expect(learned[0].score).toBeGreaterThan(baseline.find((c) => c.beatmapsetId === 2)!.score)

    // The osu! run loads only osu! feedback — none exists — so its
    // ordering is byte-identical to the no-learning baseline.
    const osuRun = scoreAndSort(candidates, profile, {
      playedSetIds: new Set(),
      boostFor: (c) => boostForCandidate([], c),
    })
    expect(osuRun).toEqual(baseline)
  })

  it('5-star tag affinity lifts matching candidates above identical non-matching ones', () => {
    const profile = testProfile()
    const rated: RatedSetFeatures[] = [
      { beatmapsetId: 9, rating: 5, tags: ['jumpstream', 'chordjack'], sr: 4.4 },
    ]
    const matching = cand(2, { tags: ['jumpstream'] })
    const plain = cand(3, { tags: ['stream'] })
    const [scoredMatching, scoredPlain] = scoreAndSort([matching, plain], profile, {
      playedSetIds: new Set(),
      boostFor: (c) => boostForCandidate(rated, c),
    }).sort((a, b) => a.beatmapsetId - b.beatmapsetId)
    expect(scoredMatching.score).toBeGreaterThan(scoredPlain.score)

    const [baseMatching, basePlain] = scoreAndSort([matching, plain], profile, {
      playedSetIds: new Set(),
    }).sort((a, b) => a.beatmapsetId - b.beatmapsetId)
    expect(baseMatching.score).toBe(basePlain.score)
  })

  it('1-star feedback pushes matching candidates down and leaves far-SR ones alone', () => {
    const profile = testProfile()
    const rated: RatedSetFeatures[] = [
      { beatmapsetId: 9, rating: 1, tags: ['jumpstream'], sr: 4.4 },
    ]
    const matching = cand(2, { tags: ['jumpstream'], sr: 4.4 })
    const far = cand(3, { tags: ['jumpstream'], sr: 8.0, srMin: 8.0, srMax: 8.0 })
    const boosted = scoreAndSort([matching, far], profile, {
      playedSetIds: new Set(),
      boostFor: (c) => boostForCandidate(rated, c),
    })
    const baseline = scoreAndSort([matching, far], profile, { playedSetIds: new Set() })
    const boostedMatching = boosted.find((c) => c.beatmapsetId === 2)!
    const baseMatching = baseline.find((c) => c.beatmapsetId === 2)!
    expect(boostedMatching.score).toBeLessThan(baseMatching.score)
    // The far-SR candidate shares the tag but sits 3.6★ away, so the
    // SR term is 0 and only a small tag term remains — it still
    // drops slightly, but strictly less than the in-range match.
    const boostedFar = boosted.find((c) => c.beatmapsetId === 3)!
    const baseFar = baseline.find((c) => c.beatmapsetId === 3)!
    expect(baseFar.score - boostedFar.score).toBeLessThan(baseMatching.score - boostedMatching.score)
  })

  it('the rated set itself is boosted when 5-star and pushed down when 1-star', () => {
    const self = cand(7, { tags: ['jumpstream'] })
    expect(boostForCandidate([{ beatmapsetId: 7, rating: 5, tags: [], sr: null }], self)).toBe(8)
    expect(boostForCandidate([{ beatmapsetId: 7, rating: 1, tags: [], sr: null }], self)).toBe(-8)
    expect(boostForCandidate([{ beatmapsetId: 7, rating: 3, tags: [], sr: null }], self)).toBe(0)
  })

  it('boosts clamp at ±12 no matter how much signal piles up', () => {
    const rated: RatedSetFeatures[] = Array.from({ length: 6 }, (_, i) => ({
      beatmapsetId: 100 + i,
      rating: 5,
      tags: ['jumpstream'],
      sr: 4.4,
    }))
    const target = cand(2, { tags: ['jumpstream'] })
    expect(boostForCandidate(rated, target)).toBe(12)
    const hated: RatedSetFeatures[] = rated.map((r) => ({ ...r, rating: 1 }))
    expect(boostForCandidate(hated, target)).toBe(-12)
  })
})
