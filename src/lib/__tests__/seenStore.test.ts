import { describe, expect, it } from 'vitest'
import {
  createSeenStore,
  isHardSeen,
  isPlayed,
  seenKey,
  type StorageLike,
} from '../seenStore'

function memoryStorage(): StorageLike {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  }
}

describe('seenStore', () => {
  it('keys are scoped per tier + username', () => {
    expect(seenKey('guest', 'Sora_Playz')).toBe('recosuk-seen:guest:sora_playz')
    expect(seenKey('account', 'sora_playz')).not.toBe(seenKey('guest', 'sora_playz'))
  })

  it('starts empty and dedupes marks', () => {
    const store = createSeenStore(memoryStorage())
    const key = seenKey('guest', 'p')
    expect(store.load(key)).toEqual({ played: [], downloaded: [], skipped: [], served: [] })
    store.mark(key, 'skipped', 123)
    const after = store.mark(key, 'skipped', 123)
    expect(after.skipped).toEqual([123])
  })

  it('keeps the four kinds separate and answers lookups', () => {
    const store = createSeenStore(memoryStorage())
    const key = seenKey('account', 'p')
    store.mark(key, 'played', 1)
    store.mark(key, 'downloaded', 2)
    store.mark(key, 'served', 3)
    const state = store.load(key)
    expect(isPlayed(state, 1)).toBe(true)
    expect(isPlayed(state, 2)).toBe(false)
    // played is a soft signal, not a hard exclusion
    expect(isHardSeen(state, 1)).toBe(false)
    expect(isHardSeen(state, 2)).toBe(true)
    expect(isHardSeen(state, 3)).toBe(true)
    expect(isHardSeen(state, 99)).toBe(false)
  })

  it('persists through the storage backend and survives a fresh store', () => {
    const storage = memoryStorage()
    const key = seenKey('guest', 'persisted')
    createSeenStore(storage).markMany(key, 'downloaded', [10, 20, 20, 30])
    const reloaded = createSeenStore(storage).load(key)
    expect(reloaded.downloaded).toEqual([10, 20, 30])
  })

  it('different keys never leak into each other', () => {
    const store = createSeenStore(memoryStorage())
    store.mark(seenKey('guest', 'a'), 'skipped', 7)
    expect(store.load(seenKey('guest', 'b')).skipped).toEqual([])
    expect(store.load(seenKey('account', 'a')).skipped).toEqual([])
  })

  it('works with no storage at all (in-memory fallback)', () => {
    const store = createSeenStore(null)
    const key = seenKey('none', null)
    store.mark(key, 'served', 5)
    expect(store.load(key).served).toEqual([5])
  })
})
