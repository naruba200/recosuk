import { describe, expect, it } from 'vitest'
import { applyModToggle, combineMods, MOD_BITS, modsForMode } from '../mods'

/**
 * §AY — mod bit values + picker rules.
 *
 * Bit values are the LEGACY bitset from the rosu-mods crate
 * (GameModsLegacy, the table rosu-pp itself converts from):
 * https://github.com/MaxOhn/rosu-mods/blob/main/src/legacy.rs
 * NC and PF are composite constants there — NC carries the DT
 * bit (576, not 512) and PF carries the SD bit (16416, not
 * 16384) — and the osu! wiki .osr table agrees (NC "always used
 * with DT: 512 + 64 = 576").
 */

describe('MOD_BITS (§AY)', () => {
  it('matches the rosu-mods legacy bitset for every offered mod', () => {
    expect(MOD_BITS).toEqual({
      NF: 1,
      EZ: 2,
      HD: 8,
      HR: 16,
      SD: 32,
      DT: 64,
      HT: 256,
      NC: 576,
      FL: 1024,
      SO: 4096,
      PF: 16416,
      FI: 1048576,
      '4K': 32768,
      '5K': 65536,
      '6K': 131072,
      '7K': 262144,
      '8K': 524288,
      '9K': 16777216,
    })
  })

  it('NC alone already carries DT speed (576 = 512 | 64)', () => {
    expect(combineMods(['NC'])).toBe(576)
    expect(combineMods(['NC']) & 64).toBe(64)
  })

  it('PF alone already carries SD (16416 = 16384 | 32)', () => {
    expect(combineMods(['PF'])).toBe(16416)
    expect(combineMods(['PF']) & 32).toBe(32)
  })

  it('ORs several mods, and ignores unknown acronyms', () => {
    expect(combineMods(['HD', 'DT'])).toBe(8 + 64)
    expect(combineMods(['HD', 'HR', 'DT'])).toBe(8 + 16 + 64)
    expect(combineMods([])).toBe(0)
    expect(combineMods(['HD', 'BOGUS'])).toBe(8)
  })
})

describe('modsForMode (§AY)', () => {
  it('offers the shared set for osu/taiko/catch', () => {
    for (const mode of ['osu', 'taiko', 'fruits'] as const) {
      expect(modsForMode(mode)).toEqual([
        'HD', 'HR', 'DT', 'NC', 'HT', 'FL', 'NF', 'EZ', 'SO', 'SD', 'PF',
      ])
    }
  })

  it('adds key mods + Fade In for mania only', () => {
    expect(modsForMode('mania')).toEqual([
      'HD', 'HR', 'DT', 'NC', 'HT', 'FL', 'NF', 'EZ', 'SO', 'SD', 'PF',
      '4K', '5K', '6K', '7K', '8K', '9K', 'FI',
    ])
  })

  it('never offers Relax or Autoplay', () => {
    for (const mode of ['osu', 'taiko', 'fruits', 'mania'] as const) {
      expect(modsForMode(mode)).not.toContain('RX')
      expect(modsForMode(mode)).not.toContain('AP')
    }
  })
})

describe('applyModToggle conflict rules (§AY)', () => {
  it('DT unpicks HT and NC; HT unpicks DT and NC; NC unpicks DT and HT', () => {
    expect(applyModToggle(['HT'], 'DT')).toEqual(['DT'])
    expect(applyModToggle(['NC'], 'DT')).toEqual(['DT'])
    expect(applyModToggle(['DT'], 'HT')).toEqual(['HT'])
    expect(applyModToggle(['NC'], 'HT')).toEqual(['HT'])
    expect(applyModToggle(['DT'], 'NC')).toEqual(['NC'])
    expect(applyModToggle(['HT'], 'NC')).toEqual(['NC'])
  })

  it('HR and EZ exclude each other; SD and PF exclude each other', () => {
    expect(applyModToggle(['EZ'], 'HR')).toEqual(['HR'])
    expect(applyModToggle(['HR'], 'EZ')).toEqual(['EZ'])
    expect(applyModToggle(['PF'], 'SD')).toEqual(['SD'])
    expect(applyModToggle(['SD'], 'PF')).toEqual(['PF'])
  })

  it('only one key mod at a time', () => {
    expect(applyModToggle(['7K'], '4K')).toEqual(['4K'])
    expect(applyModToggle(['HD', '7K'], '4K')).toEqual(['HD', '4K'])
  })

  it('toggling an active mod off just removes it', () => {
    expect(applyModToggle(['HD', 'DT'], 'DT')).toEqual(['HD'])
    expect(applyModToggle(['7K'], '7K')).toEqual([])
  })

  it('unrelated mods stay selected', () => {
    expect(applyModToggle(['HD', 'FL'], 'DT')).toEqual(['HD', 'FL', 'DT'])
  })
})
