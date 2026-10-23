import { describe, expect, it } from 'vitest'
import type { OsuScore, OsuUser } from '../osu'
import { accuracyBandsBySr, computeSkillProfile } from '../skillProfile'

function play(
  sr: number,
  acc: number,
  bpm: number,
  pp: number,
  cs = 7,
  tags?: string,
): OsuScore {
  return {
    accuracy: acc,
    pp,
    max_combo: 1000,
    mods: [],
    beatmap: {
      id: Math.round(sr * 1000),
      beatmapset_id: Math.round(sr * 100),
      difficulty_rating: sr,
      version: 'test',
      bpm,
      total_length: 150,
      cs,
      ar: 9,
      od: 8,
    },
    beatmapset: tags
      ? {
          id: Math.round(sr * 100),
          title: 't',
          artist: 'a',
          creator: 'c',
          status: 'ranked',
          tags,
        }
      : undefined,
  }
}

const user: OsuUser = {
  id: 42,
  username: 'fixture_player',
  playmode: 'mania',
  country_code: 'VN',
  statistics: {
    pp: 5284,
    global_rank: 18942,
    country_rank: 142,
    hit_accuracy: 96.84,
    play_count: 12430,
  },
}

// SR / acc curve shaped like the demo persona: strong ≤4.9★, collapse ≥5★.
const topPlays: OsuScore[] = [
  play(4.2, 0.989, 170, 300, 7, 'jumpstream chordjack'),
  play(4.3, 0.984, 175, 290, 7, 'jumpstream'),
  play(4.5, 0.98, 180, 280, 7, 'jumpstream stream'),
  play(4.6, 0.978, 182, 270, 7, 'jumpstream'),
  play(4.7, 0.975, 185, 260, 4, 'stream'),
  play(4.9, 0.951, 190, 250, 7, 'jumpstream chordjack'),
  play(5.1, 0.912, 195, 240, 7, 'technical'),
  play(5.4, 0.864, 200, 230, 7, 'technical'),
]

describe('computeSkillProfile — mania fixture', () => {
  const profile = computeSkillProfile(user, topPlays, [], [], 'mania')

  it('is not a starter profile when top plays exist', () => {
    expect(profile.isStarter).toBe(false)
    expect(profile.topPlayCount).toBe(8)
  })

  it('carries the headline stats from the user payload', () => {
    expect(profile.pp).toBe(5284)
    expect(profile.globalRank).toBe(18942)
    expect(profile.countryRank).toBe(142)
    expect(profile.accuracy).toBe(96.84)
    expect(profile.playCount).toBe(12430)
  })

  it('computes a comfort band inside the strong SR range', () => {
    expect(profile.comfortSrMin).toBeGreaterThanOrEqual(4.3)
    expect(profile.comfortSrMin).toBeLessThanOrEqual(4.6)
    expect(profile.comfortSrMax).toBeGreaterThanOrEqual(4.8)
    expect(profile.comfortSrMax).toBeLessThanOrEqual(5.1)
    expect(profile.comfortAccuracy).toBeGreaterThan(96)
  })

  it('detects the accuracy ceiling at 5.0★', () => {
    expect(profile.srCeiling).toBe(5.0)
    expect(profile.ceilingAccuracy).toBeCloseTo(88.8, 1)
  })

  it('computes the BPM sweet spot from the best-pp half of plays', () => {
    expect(profile.bpmSweetMin).toBeGreaterThanOrEqual(170)
    expect(profile.bpmSweetMin).toBeLessThanOrEqual(176)
    expect(profile.bpmSweetMax).toBeGreaterThanOrEqual(178)
    expect(profile.bpmSweetMax).toBeLessThanOrEqual(184)
    expect(profile.bpmMean).toBe(185)
  })

  it('derives the mania key-count split from CS', () => {
    expect(profile.mainKeyCount).toBe(7)
    expect(profile.keySharePct).toBe(88)
    expect(profile.keyCounts[7]).toBe(7)
    expect(profile.keyCounts[4]).toBe(1)
  })

  it('derives playstyle tags from beatmapset tags present in the data', () => {
    expect(profile.playstyleTags).toContain('jumpstream')
    expect(profile.playstyleTags.length).toBeLessThanOrEqual(5)
  })

  it('builds accuracy bands per 0.5★', () => {
    const bands = accuracyBandsBySr(topPlays)
    expect(bands.length).toBe(3)
    expect(bands[0].min).toBe(4.0)
    expect(bands[2].min).toBe(5.0)
    expect(bands[2].avgAccuracy).toBeCloseTo(88.8, 1)
  })
})

describe('computeSkillProfile — empty mode', () => {
  const emptyUser: OsuUser = {
    id: 43,
    username: 'no_catch_plays',
    playmode: 'osu',
    statistics: { pp: 0, global_rank: null, country_rank: null, hit_accuracy: 0, play_count: 0 },
  }
  const profile = computeSkillProfile(emptyUser, [], [], [], 'fruits')

  it('returns a starter profile, honestly flagged', () => {
    expect(profile.isStarter).toBe(true)
    expect(profile.topPlayCount).toBe(0)
    expect(profile.playstyleTags).toEqual([])
    expect(profile.accuracyBands).toEqual([])
  })

  it('uses the conservative starter defaults for the mode', () => {
    expect(profile.comfortSrMin).toBe(3.0)
    expect(profile.comfortSrMax).toBe(4.0)
    expect(profile.srCeiling).toBe(4.5)
    expect(profile.mainKeyCount).toBeNull()
  })

  it('mania starter defaults sit slightly higher', () => {
    const mania = computeSkillProfile(emptyUser, [], [], [], 'mania')
    expect(mania.comfortSrMin).toBe(3.5)
    expect(mania.comfortSrMax).toBe(4.5)
  })
})

describe('computeSkillProfile — recent accuracy + mods', () => {
  it('averages recent plays and counts mod usage', () => {
    const recent = [
      { ...play(4.5, 0.97, 180, 0), mods: ['HD'] },
      { ...play(4.6, 0.99, 180, 0), mods: ['HD', 'DT'] },
    ]
    const profile = computeSkillProfile(user, topPlays, recent, [], 'mania')
    expect(profile.recentAccuracy).toBeCloseTo(98.0, 1)
    expect(profile.modUsage[0]).toEqual({ mod: 'HD', count: 2 })
  })
})
