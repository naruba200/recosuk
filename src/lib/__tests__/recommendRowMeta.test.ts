import { describe, expect, it } from 'vitest'

/**
 * Batch 5, item C: rows show the SR RANGE across a set's in-mode
 * difficulties (not just the picked difficulty's SR), and only
 * skillset-vocabulary tags.
 */

import {
  essentialTags,
  setToCandidate,
  type SearchBeatmapset,
} from '../recommend'
import { computeSkillProfile, type SkillProfile } from '../skillProfile'
import type { OsuScore, OsuUser } from '../osu'

function testUser(): OsuUser {
  return {
    id: 1,
    username: 'tester',
    playmode: 'mania',
    statistics: { pp: 100, hit_accuracy: 95, play_count: 10 },
  }
}

function play(sr: number): OsuScore {
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
  return computeSkillProfile(testUser(), [play(4.0), play(4.4)], [], [], 'mania')
}

function diff(id: number, mode: string, sr: number) {
  return {
    id,
    mode,
    version: '7K',
    difficulty_rating: sr,
    bpm: 170,
    total_length: 120,
    cs: 7,
    ar: 9,
    od: 8,
  }
}

describe('SR range on candidates', () => {
  it('spans the lowest/highest in-mode SR, excluding other modes', () => {
    const set: SearchBeatmapset = {
      id: 9,
      title: 'Test',
      artist: 'Artist',
      creator: 'mapper',
      status: 'ranked',
      beatmaps: [
        diff(1, 'mania', 2.1),
        diff(2, 'mania', 4.4),
        diff(3, 'mania', 6.8),
        diff(4, 'osu', 9.9),
        diff(5, 'osu', 0.5),
      ],
    }
    const c = setToCandidate(set, 'mania', testProfile())
    expect(c?.srMin).toBe(2.1)
    expect(c?.srMax).toBe(6.8)
  })

  it('collapses to a single value for a one-difficulty set', () => {
    const set: SearchBeatmapset = {
      id: 9,
      title: 'Test',
      artist: 'Artist',
      creator: 'mapper',
      status: 'ranked',
      beatmaps: [diff(1, 'mania', 4.4)],
    }
    const c = setToCandidate(set, 'mania', testProfile())
    expect(c?.srMin).toBe(4.4)
    expect(c?.srMax).toBe(4.4)
  })

  it('ignores difficulties without a finite SR', () => {
    const set: SearchBeatmapset = {
      id: 9,
      title: 'Test',
      artist: 'Artist',
      creator: 'mapper',
      status: 'ranked',
      beatmaps: [
        diff(1, 'mania', 3.0),
        { ...diff(2, 'mania', 8.0), difficulty_rating: NaN },
        diff(3, 'mania', 5.0),
      ],
    }
    const c = setToCandidate(set, 'mania', testProfile())
    expect(c?.srMin).toBe(3.0)
    expect(c?.srMax).toBe(5.0)
  })
})

describe('essentialTags', () => {
  it('keeps only skillset-vocabulary tags, in tag order, max 4', () => {
    expect(
      essentialTags(['camellia', 'stream', 'jumpstream', 'vocaloid', 'stamina', 'technical', 'speed', 'anime']),
    ).toEqual(['stream', 'jumpstream', 'stamina', 'technical'])
  })

  it('matches case-insensitively and normalises separators', () => {
    expect(essentialTags(['STREAM', 'Finger-Control', 'SINGLE-TAP', 'LN'])).toEqual([
      'stream',
      'fingercontrol',
      'singletap',
      'ln',
    ])
  })

  it('handles plural/longer forms and drops duplicates', () => {
    expect(essentialTags(['streams', 'STREAMS', 'jacks', 'technical', 'tech', 'burst'])).toEqual([
      'streams',
      'jacks',
      'technical',
      'tech',
    ])
  })

  it('returns nothing when no tag is skillset vocabulary', () => {
    expect(essentialTags(['vocaloid', 'anime', '2024', 'english'])).toEqual([])
    expect(essentialTags([])).toEqual([])
  })
})
