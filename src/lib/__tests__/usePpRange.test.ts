import { describe, expect, it } from 'vitest'
import { ppRangeSignature } from '../usePpRange'

/**
 * §AY — the PP range recompute key must include the mods
 * bitmask, or switching mods would keep serving the stale
 * NoMod numbers (the compute effect keys on this string).
 */
describe('ppRangeSignature (§AY)', () => {
  const base = { beatmapId: 42, mode: 'osu' as const, checksum: 'abc' }

  it('differs when the mods differ', () => {
    expect(ppRangeSignature([{ ...base, mods: 64 }])).not.toBe(
      ppRangeSignature([{ ...base, mods: 0 }]),
    )
    expect(ppRangeSignature([{ ...base, mods: 64 }])).not.toBe(
      ppRangeSignature([{ ...base, mods: 8 }]),
    )
  })

  it('is stable for the same mods, and omitted mods mean 0', () => {
    expect(ppRangeSignature([{ ...base, mods: 64 }])).toBe(
      ppRangeSignature([{ ...base, mods: 64 }]),
    )
    expect(ppRangeSignature([base])).toBe(ppRangeSignature([{ ...base, mods: 0 }]))
  })

  it('is empty for no difficulties', () => {
    expect(ppRangeSignature([])).toBe('')
    expect(ppRangeSignature(undefined)).toBe('')
  })
})
