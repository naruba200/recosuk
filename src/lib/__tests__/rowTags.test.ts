import { describe, expect, it } from 'vitest'
import {
  applyTagAllowlist,
  mostUsedEssentialTags,
} from '../recommend'

const cand = (tags: string[]) => ({ tags })

describe('mostUsedEssentialTags', () => {
  it('returns the most-used tags first, capped at 7 by default', () => {
    const candidates = [
      cand(['stream']),
      cand(['stream']),
      cand(['stream']),
      cand(['stream']),
      cand(['stream']),
      cand(['jump']),
      cand(['jump']),
      cand(['jump']),
      cand(['jump']),
      cand(['aim']),
      cand(['aim']),
      cand(['aim']),
      cand(['tech']),
      cand(['tech']),
      cand(['stamina']),
      cand(['stamina']),
      cand(['speed']),
      cand(['precision']),
      cand(['reading']),
      cand(['burst']),
      cand(['flow']),
    ]
    // Counts: stream 5, jump 4, aim 3, tech 2, stamina 2,
    // then five tags at 1 — the top 7 stops at precision
    // (vocabulary order breaks the 1-count ties).
    expect(mostUsedEssentialTags(candidates)).toEqual([
      'stream',
      'jump',
      'aim',
      'tech',
      'stamina',
      'speed',
      'precision',
    ])
  })

  it('breaks ties by vocabulary order', () => {
    expect(
      mostUsedEssentialTags([cand(['aim']), cand(['stream'])]),
    ).toEqual(['stream', 'aim'])
  })

  it('returns every distinct tag when fewer than 7 occur', () => {
    expect(
      mostUsedEssentialTags([cand(['stream', 'jump']), cand(['aim'])]),
    ).toEqual(['stream', 'jump', 'aim'])
  })

  it('returns [] for no candidates and for limit 0', () => {
    expect(mostUsedEssentialTags([])).toEqual([])
    expect(mostUsedEssentialTags([cand(['stream'])] , 0)).toEqual([])
  })

  it('respects an explicit limit', () => {
    const candidates = [cand(['stream']), cand(['stream']), cand(['jump'])]
    expect(mostUsedEssentialTags(candidates, 1)).toEqual(['stream'])
    expect(mostUsedEssentialTags(candidates, 2)).toEqual(['stream', 'jump'])
  })

  it('counts each candidate once per tag: per-row cap and dedupe apply', () => {
    // Six vocabulary tags on one set: essentialTags caps at
    // the first 4, so stamina/speed contribute nothing here.
    const candidates = [
      cand(['stream', 'jump', 'aim', 'tech', 'stamina', 'speed']),
    ]
    expect(mostUsedEssentialTags(candidates)).toEqual([
      'stream',
      'jump',
      'aim',
      'tech',
    ])
    // Repeated / re-cased spellings of one tag count once.
    expect(
      mostUsedEssentialTags([cand(['stream', 'Stream', 'STREAM'])]),
    ).toEqual(['stream'])
    // Separator normalisation: finger-control is fingercontrol.
    expect(mostUsedEssentialTags([cand(['Finger-Control'])] )).toEqual([
      'fingercontrol',
    ])
  })

  it('ignores tags outside the skillset vocabulary', () => {
    expect(
      mostUsedEssentialTags([cand(['anime', 'vocaloid', 'stream'])]),
    ).toEqual(['stream'])
  })
})

describe('applyTagAllowlist', () => {
  it('returns all tags when no allowlist is given', () => {
    expect(applyTagAllowlist(['stream', 'jump'], undefined)).toEqual([
      'stream',
      'jump',
    ])
  })

  it('narrows to the allowlist, preserving row order', () => {
    expect(
      applyTagAllowlist(['stream', 'jump', 'aim'], ['aim', 'stream']),
    ).toEqual(['stream', 'aim'])
  })

  it('returns [] for an empty allowlist', () => {
    expect(applyTagAllowlist(['stream'], [])).toEqual([])
  })
})
