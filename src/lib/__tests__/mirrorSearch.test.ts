import { describe, expect, it } from 'vitest'
import {
  buildMirrorQueryText,
  defaultMirrorFilters,
  mirrorCandidateMatches,
  MIRROR_SORTS,
  DEFAULT_MIRROR_SORT,
  mirrorPageCacheKey,
  type MirrorFilters,
} from '../mirrorSearch'
import type { RecCandidate } from '../recommend'

function filters(patch: Partial<MirrorFilters> = {}): MirrorFilters {
  return { ...defaultMirrorFilters(), ...patch }
}

function candidate(patch: Partial<RecCandidate> = {}): RecCandidate {
  return {
    beatmapsetId: 1,
    beatmapId: 10,
    title: 'Map',
    artist: 'Artist',
    creator: 'mapper',
    version: '7K',
    sr: 4.5,
    srMin: 4.5,
    srMax: 4.5,
    bpm: 180,
    lengthSec: 150,
    cs: 7,
    ar: 9,
    od: 8,
    tags: [],
    status: 'ranked',
    playCount: 100,
    favouriteCount: 10,
    popularity: 0,
    score: 0,
    ppPotential: 0,
    reason: '',
    ...patch,
  }
}

describe('buildMirrorQueryText', () => {
  it('passes free text through unchanged when no filters are set', () => {
    expect(buildMirrorQueryText('camellia', filters())).toBe('camellia')
    expect(buildMirrorQueryText('', filters())).toBe('')
  })

  it('adds creator=, quoting names with spaces', () => {
    expect(buildMirrorQueryText('', filters({ creator: 'sotarks' }))).toBe('creator=sotarks')
    expect(buildMirrorQueryText('', filters({ creator: 'John Doe' }))).toBe('creator="John Doe"')
  })

  it('strips quotes from creator names so they cannot break the clause', () => {
    expect(buildMirrorQueryText('', filters({ creator: 'a"b stars>=9' }))).toBe(
      'creator="ab stars>=9"',
    )
  })

  it('adds star/bpm/length/ar/od/hp/cs range clauses in seconds for length', () => {
    const q = buildMirrorQueryText('', filters({
      sr: { min: 4.2, max: 5 },
      bpm: { min: 170, max: 190 },
      lengthSec: { min: 60, max: 300 },
      ar: { min: 8, max: null },
      od: { min: null, max: 9 },
      hp: { min: 5, max: null },
      cs: { min: 7, max: 7 },
    }))
    expect(q).toBe(
      'stars>=4.2 stars<=5 bpm>=170 bpm<=190 length>=60 length<=300 ar>=8 od<=9 hp>=5 cs>=7 cs<=7',
    )
  })

  it('combines text, creator and ranges in one query', () => {
    expect(buildMirrorQueryText('xi', filters({ creator: 'mapper', sr: { min: 4, max: null } }))).toBe(
      'xi creator=mapper stars>=4',
    )
  })
})

describe('mirrorCandidateMatches (client-side guarantee)', () => {
  it('passes a candidate inside every range', () => {
    expect(mirrorCandidateMatches(candidate(), filters())).toBe(true)
  })

  it('rejects on status, creator, SR, BPM, length, AR, OD, CS', () => {
    expect(mirrorCandidateMatches(candidate({ status: 'pending' }), filters({ status: 'ranked' }))).toBe(false)
    expect(mirrorCandidateMatches(candidate({ creator: 'other' }), filters({ creator: 'mapper' }))).toBe(false)
    expect(mirrorCandidateMatches(candidate({ sr: 6 }), filters({ sr: { min: null, max: 5 } }))).toBe(false)
    expect(mirrorCandidateMatches(candidate({ bpm: 120 }), filters({ bpm: { min: 170, max: null } }))).toBe(false)
    expect(mirrorCandidateMatches(candidate({ lengthSec: 400 }), filters({ lengthSec: { min: null, max: 300 } }))).toBe(false)
    expect(mirrorCandidateMatches(candidate({ ar: 5 }), filters({ ar: { min: 8, max: null } }))).toBe(false)
    expect(mirrorCandidateMatches(candidate({ od: 5 }), filters({ od: { min: 8, max: null } }))).toBe(false)
    expect(mirrorCandidateMatches(candidate({ cs: 4 }), filters({ cs: { min: 7, max: 7 } }))).toBe(false)
  })

  it('treats unknown (0) stat values as passing', () => {
    expect(
      mirrorCandidateMatches(
        candidate({ bpm: 0, lengthSec: 0, ar: 0, od: 0, cs: 0 }),
        filters({ bpm: { min: 170, max: null }, ar: { min: 8, max: null } }),
      ),
    ).toBe(true)
  })

  it('matches creator case-insensitively as a substring', () => {
    expect(mirrorCandidateMatches(candidate({ creator: 'DeviousPanda' }), filters({ creator: 'panda' }))).toBe(true)
  })
})

describe('mirror sort options', () => {
  it('defaults to newest-first (upload date), like osu!', () => {
    expect(DEFAULT_MIRROR_SORT).toBe('updated_desc')
    expect(MIRROR_SORTS[0].value).toBe('updated_desc')
    expect(MIRROR_SORTS.map((s) => s.value)).toContain('plays_desc')
    expect(MIRROR_SORTS.map((s) => s.value)).toContain('title_asc')
  })
})

describe('mirrorPageCacheKey', () => {
  it('separates mode, query, filters, sort and cursor', () => {
    const base = {
      mode: 'mania' as const,
      queryText: 'xi',
      filters: filters(),
      sort: 'updated_desc' as const,
    }
    const a = mirrorPageCacheKey({ ...base, cursor: null })
    const b = mirrorPageCacheKey({ ...base, cursor: 'abc' })
    const c = mirrorPageCacheKey({ ...base, mode: 'osu', cursor: null })
    const d = mirrorPageCacheKey({ ...base, sort: 'plays_desc', cursor: null })
    expect(new Set([a, b, c, d]).size).toBe(4)
    expect(mirrorPageCacheKey({ ...base, cursor: null })).toBe(a)
  })
})
