import { describe, expect, it } from 'vitest'
import type { SkillProfile } from '../skillProfile'
import {
  applyFilters,
  buildCandidateQueries,
  defaultFiltersFor,
  estimatePp,
  pickDifficulty,
  scoreAndSort,
  scoreCandidate,
  setToCandidate,
  type RecCandidate,
  type SearchBeatmapset,
} from '../recommend'

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
  generatedAt: '2026-10-24T00:00:00.000Z',
}

function candidate(overrides: Partial<RecCandidate> = {}): RecCandidate {
  return {
    beatmapsetId: 1,
    beatmapId: 10,
    title: 'Map',
    artist: 'Artist',
    creator: 'mapper',
    version: '7K',
    sr: 4.9,
    srMin: 4.9,
    srMax: 4.9,
    bpm: 182,
    lengthSec: 150,
    cs: 7,
    ar: 9,
    od: 8,
    tags: ['jumpstream'],
    status: 'ranked',
    playCount: 50000,
    favouriteCount: 100,
    popularity: 0,
    score: 0,
    ppPotential: 0,
    reason: '',
    ...overrides,
  }
}

describe('buildCandidateQueries', () => {
  it('builds a bounded primary query from the filters', () => {
    const filters = defaultFiltersFor(profile)
    const queries = buildCandidateQueries(profile, 'mania', filters)
    expect(queries[0]).toContain('stars>=')
    expect(queries[0]).toContain('stars<=')
    expect(queries[0]).toContain('bpm>=')
  })

  it('adds playstyle-tag variants, deduped, with no tag clause when no tag is selected', () => {
    const filters = { ...defaultFiltersFor(profile), userTag: null }
    const queries = buildCandidateQueries(profile, 'mania', filters)
    expect(queries.some((q) => q.startsWith('jumpstream'))).toBe(true)
    expect(queries.every((q) => !q.includes('tag="'))).toBe(true)
    expect(new Set(queries).size).toBe(queries.length)
  })

  it('appends the tag="..." clause to EVERY query when a user tag is selected', () => {
    const filters = { ...defaultFiltersFor(profile), userTag: 'style/chordjack' }
    const queries = buildCandidateQueries(profile, 'mania', filters)
    expect(queries.length).toBeGreaterThan(1)
    for (const q of queries) {
      expect(q).toContain('tag="style/chordjack"')
    }
    expect(new Set(queries).size).toBe(queries.length)
  })
})

describe('pickDifficulty + setToCandidate', () => {
  const set: SearchBeatmapset = {
    id: 99,
    title: 'T',
    artist: 'A',
    creator: 'C',
    status: 'ranked',
    tags: 'jumpstream chordjack',
    covers: { card: 'https://example/card.jpg' },
    beatmaps: [
      { id: 1, mode: 'osu', version: 'Insane', difficulty_rating: 5.0, bpm: 180, total_length: 120, cs: 4, ar: 9, od: 8 },
      { id: 2, mode: 'mania', version: '4K', difficulty_rating: 3.5, bpm: 180, total_length: 120, cs: 4, ar: 9, od: 8 },
      { id: 3, mode: 'mania', version: '7K', difficulty_rating: 4.9, bpm: 180, total_length: 120, cs: 7, ar: 9, od: 8 },
    ],
  }

  it('picks the in-mode difficulty nearest the training edge', () => {
    const diff = pickDifficulty(set, 'mania', profile)
    expect(diff?.id).toBe(3)
  })

  it('returns null when the set has no difficulty in the mode', () => {
    expect(pickDifficulty(set, 'taiko', profile)).toBeNull()
    expect(setToCandidate(set, 'taiko', profile)).toBeNull()
  })

  it('maps set fields onto the candidate', () => {
    const c = setToCandidate(set, 'mania', profile)
    expect(c?.beatmapsetId).toBe(99)
    expect(c?.beatmapId).toBe(3)
    expect(c?.cs).toBe(7)
    expect(c?.tags).toContain('chordjack')
    expect(c?.cover).toBe('https://example/card.jpg')
  })
})

describe('applyFilters narrows the pool', () => {
  const filters = defaultFiltersFor(profile) // sr 3.7–5.8, bpm 140–220, 7K, ranked+loved
  const pool = [
    candidate({ beatmapsetId: 1, sr: 4.9 }), // keep
    candidate({ beatmapsetId: 2, sr: 7.5 }), // SR too high
    candidate({ beatmapsetId: 3, sr: 2.0 }), // SR too low
    candidate({ beatmapsetId: 4, cs: 4 }), // wrong key count
    candidate({ beatmapsetId: 5, status: 'qualified' }), // not ranked/loved
    candidate({ beatmapsetId: 6, bpm: 260 }), // BPM out of range
    candidate({ beatmapsetId: 7, lengthSec: 900 }), // too long
    candidate({ beatmapsetId: 8, tags: ['stream'], title: 'Other' }), // tag text filter below
  ]

  it('applies SR/BPM/length/status/key filters', () => {
    const kept = applyFilters(pool, filters, 'mania').map((c) => c.beatmapsetId)
    expect(kept).toEqual([1, 8])
  })

  it('does NOT narrow client-side by user tag: the tag filter is server-side (tag="..." clause)', () => {
    // Candidates carry only mapper tags — there is no voted-tags
    // field to match against. A selected userTag must not drop
    // candidates here; osu! already filtered upstream.
    const kept = applyFilters(pool, { ...filters, userTag: 'style/jumpstream' }, 'mania').map(
      (c) => c.beatmapsetId,
    )
    expect(kept).toEqual([1, 8])
  })

  it('key count filter is ignored outside mania', () => {
    const kept = applyFilters(pool, filters, 'osu').map((c) => c.beatmapsetId)
    expect(kept).toContain(4)
  })
})

describe('scoring order', () => {
  it('ranks a gap-band 7K map above comfort, far-below and far-above maps', () => {
    const gap = candidate({ beatmapsetId: 1, sr: 4.9, bpm: 182, cs: 7 })
    const comfort = candidate({ beatmapsetId: 2, sr: 4.4, bpm: 182, cs: 7 })
    const tooEasy = candidate({ beatmapsetId: 3, sr: 2.5, bpm: 140, cs: 4, tags: [] })
    const tooHard = candidate({ beatmapsetId: 4, sr: 7.8, bpm: 240, cs: 7, tags: [] })
    const ranked = scoreAndSort([tooHard, tooEasy, comfort, gap], profile, {
      playedSetIds: new Set(),
    })
    expect(ranked[0].beatmapsetId).toBe(1)
    expect(ranked[ranked.length - 1].beatmapsetId).toBe(3)
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score)
  })

  it('penalises already-played maps instead of excluding them', () => {
    const fresh = candidate({ beatmapsetId: 1 })
    const played = candidate({ beatmapsetId: 2 })
    const scoredFresh = scoreCandidate(fresh, profile, { playedSetIds: new Set() })
    const scoredPlayed = scoreCandidate(played, profile, { playedSetIds: new Set([2]) })
    expect(scoredPlayed.score).toBeLessThan(scoredFresh.score)
    expect(scoredPlayed.score).toBeGreaterThan(0)
  })

  it('reasons cite the player\'s own numbers', () => {
    const scored = scoreCandidate(candidate({ sr: 5.1, cs: 7 }), profile, {
      playedSetIds: new Set(),
    })
    expect(scored.reason).toContain('7K')
    expect(scored.reason).toContain('5.0')
  })

  it('is deterministic: same input, same order', () => {
    const pool = [candidate({ beatmapsetId: 3 }), candidate({ beatmapsetId: 1 }), candidate({ beatmapsetId: 2 })]
    const a = scoreAndSort(pool, profile, { playedSetIds: new Set() }).map((c) => c.beatmapsetId)
    const b = scoreAndSort(pool, profile, { playedSetIds: new Set() }).map((c) => c.beatmapsetId)
    expect(a).toEqual(b)
  })

  it('estimatePp grows with SR and length', () => {
    expect(estimatePp(5, 150, 'mania')).toBeGreaterThan(estimatePp(4, 150, 'mania'))
    expect(estimatePp(5, 240, 'mania')).toBeGreaterThan(estimatePp(5, 90, 'mania'))
  })
})
