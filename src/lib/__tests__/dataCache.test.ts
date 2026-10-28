import { describe, expect, it } from 'vitest'
import { createDataCache } from '../dataCache'

describe('dataCache (TTL)', () => {
  it('returns a stored value on a hit and undefined on a miss', () => {
    const cache = createDataCache()
    expect(cache.get('nope')).toBeUndefined()
    cache.set('k', { a: 1 }, 60_000)
    expect(cache.get('k')).toEqual({ a: 1 })
  })

  it('expires entries after their TTL', () => {
    let now = 1_000
    const cache = createDataCache(() => now)
    cache.set('k', 'v', 5_000)
    now = 5_999
    expect(cache.get('k')).toBe('v')
    now = 6_000
    expect(cache.get('k')).toBeUndefined()
  })

  it('keeps keys separate (per-mode separation)', () => {
    const cache = createDataCache()
    cache.set('mania:q', [1], 60_000)
    cache.set('osu:q', [2], 60_000)
    expect(cache.get('mania:q')).toEqual([1])
    expect(cache.get('osu:q')).toEqual([2])
  })

  it('overwriting a key replaces the value and TTL', () => {
    let now = 0
    const cache = createDataCache(() => now)
    cache.set('k', 'old', 1_000)
    now = 500
    cache.set('k', 'new', 10_000)
    now = 2_000
    expect(cache.get('k')).toBe('new')
  })

  it('delete and clear drop entries', () => {
    const cache = createDataCache()
    cache.set('a', 1, 60_000)
    cache.set('b', 2, 60_000)
    cache.delete('a')
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
    cache.clear()
    expect(cache.get('b')).toBeUndefined()
  })
})
