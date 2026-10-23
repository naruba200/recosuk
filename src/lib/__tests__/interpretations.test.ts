import { describe, expect, it } from 'vitest'
import type { SkillProfile } from '../skillProfile'
import {
  gapReason,
  interpretBpm,
  interpretCeiling,
  interpretComfort,
  interpretKeys,
  interpretProfile,
} from '../interpretations'

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
  avgAr: 9.2,
  keyCounts: { 7: 82, 4: 18 },
  mainKeyCount: 7,
  keySharePct: 82,
  accuracyBands: [],
  modUsage: [],
  playstyleTags: ['jumpstream'],
  recentAccuracy: 97.1,
  topPlayCount: 100,
  isStarter: false,
  generatedAt: '2026-10-24T00:00:00.000Z',
}

describe('interpretations cite the user\'s own numbers', () => {
  it('comfort card shows the band and its accuracy', () => {
    const card = interpretComfort(profile)
    expect(card.value).toContain('4.2')
    expect(card.value).toContain('4.7')
    expect(card.why).toContain('97.8')
    expect(card.what.length).toBeGreaterThan(20)
  })

  it('ceiling card quantifies the drop at the ceiling SR', () => {
    const card = interpretCeiling(profile)
    expect(card.value).toContain('91.2')
    expect(card.why).toContain('5.0')
    expect(card.why).toContain('6.6')
    expect(card.chip).toContain('6.6')
  })

  it('bpm card shows the sweet spot range and mean', () => {
    const card = interpretBpm(profile)
    expect(card.value).toContain('170')
    expect(card.value).toContain('190')
    expect(card.why).toContain('182')
  })

  it('keys card shows the main key count and its share', () => {
    const card = interpretKeys(profile)
    expect(card).not.toBeNull()
    expect(card!.value).toBe('7K')
    expect(card!.why).toContain('82%')
  })

  it('keys card is null outside mania; profile still yields 4 cards', () => {
    const osuProfile = { ...profile, mode: 'osu' as const, mainKeyCount: null, keySharePct: null, keyCounts: {} }
    expect(interpretKeys(osuProfile)).toBeNull()
    expect(interpretProfile(osuProfile)).toHaveLength(4)
    expect(interpretProfile(profile)).toHaveLength(4)
  })

  it('starter profiles are explained as estimates, not personal stats', () => {
    const starter: SkillProfile = {
      ...profile,
      isStarter: true,
      comfortAccuracy: 0,
      ceilingAccuracy: null,
      topPlayCount: 0,
    }
    expect(interpretComfort(starter).chip).toContain('Starter')
    expect(interpretCeiling(starter).why).toContain('no')
  })

  it('gap reasons reference the ceiling and tempo', () => {
    expect(gapReason(profile, 5.2, 182)).toContain('5.0')
    expect(gapReason(profile, 5.2, 182)).toContain('182')
    expect(gapReason(profile, 4.4, 180)).toContain('4.2')
  })
})
