import { describe, expect, it } from 'vitest'
import {
  createSeenStore,
  isHardSeen,
  isPlayed,
  seenKey,
  takeRecentDownloaded,
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

  // Batch 6, defect 2: `served` is session-scoped — it must never
  // survive a fresh store (new session) over the same storage, while
  // played/downloaded/skipped persist unchanged.
  it('served does not survive a fresh store; played/downloaded/skipped do', () => {
    const storage = memoryStorage()
    const key = seenKey('guest', 'session-scoped')
    const first = createSeenStore(storage)
    first.mark(key, 'played', 1)
    first.mark(key, 'downloaded', 2)
    first.mark(key, 'skipped', 3)
    first.mark(key, 'served', 4)
    expect(first.load(key).served).toEqual([4])

    const reloaded = createSeenStore(storage).load(key)
    expect(reloaded).toEqual({ played: [1], downloaded: [2], skipped: [3], served: [] })
  })

  it('markMany served updates the in-memory copy only, never storage', () => {
    const storage = memoryStorage()
    const key = seenKey('guest', 'memory-only')
    const store = createSeenStore(storage)
    store.markMany(key, 'served', [7, 8, 9])
    // Same session: served still excludes.
    expect(store.load(key).served).toEqual([7, 8, 9])
    expect(isHardSeen(store.load(key), 7)).toBe(true)
    // Storage never saw the served ids.
    const raw = storage.getItem(`seen:${key}`)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw as string)).not.toHaveProperty('served')
  })

  it('legacy storage holding a saturated served array is ignored and self-cleans on save', () => {
    const storage = memoryStorage()
    const key = seenKey('guest', 'legacy')
    storage.setItem(
      `seen:${key}`,
      JSON.stringify({ played: [1], downloaded: [2], skipped: [], served: [10, 11, 12, 13] }),
    )
    const store = createSeenStore(storage)
    expect(store.load(key)).toEqual({ played: [1], downloaded: [2], skipped: [], served: [] })
    // The next save (any mark) rewrites storage without served.
    store.mark(key, 'skipped', 5)
    expect(JSON.parse(storage.getItem(`seen:${key}`) as string)).not.toHaveProperty('served')
  })

  // Shared seen-version signal (2026-10-29): subscribers re-render
  // whenever an effective mutation lands, so a download in one
  // Recommendations view refreshes the other view's rows.
  it('version starts at 0 and bumps on each effective mark', () => {
    const store = createSeenStore(memoryStorage())
    const key = seenKey('guest', 'versioned')
    expect(store.version()).toBe(0)
    store.mark(key, 'downloaded', 1)
    expect(store.version()).toBe(1)
    store.markMany(key, 'skipped', [2, 3])
    expect(store.version()).toBe(2)
  })

  it('a mark that changes nothing bumps neither the version nor subscribers', () => {
    const store = createSeenStore(memoryStorage())
    const key = seenKey('guest', 'no-op')
    let calls = 0
    store.subscribe(() => {
      calls += 1
    })
    store.mark(key, 'downloaded', 1)
    expect(calls).toBe(1)
    // Already present: no change, no notify.
    store.mark(key, 'downloaded', 1)
    store.markMany(key, 'downloaded', [1])
    expect(calls).toBe(1)
    expect(store.version()).toBe(1)
  })

  it('subscribers are notified on mutation and stop after unsubscribe', () => {
    const store = createSeenStore(memoryStorage())
    const key = seenKey('guest', 'sub')
    let calls = 0
    const off = store.subscribe(() => {
      calls += 1
    })
    store.mark(key, 'skipped', 9)
    expect(calls).toBe(1)
    off()
    store.mark(key, 'skipped', 10)
    expect(calls).toBe(1)
    // The version still advances: unsubscribe only drops the listener.
    expect(store.version()).toBe(2)
  })

  it('clearing a present key notifies; clearing an absent key does not', () => {
    const store = createSeenStore(memoryStorage())
    const key = seenKey('guest', 'clearable')
    let calls = 0
    store.subscribe(() => {
      calls += 1
    })
    store.clear(key)
    expect(calls).toBe(0)
    expect(store.version()).toBe(0)
    store.mark(key, 'downloaded', 1)
    store.clear(key)
    expect(calls).toBe(2)
    expect(store.load(key).downloaded).toEqual([])
  })

  it('versions are independent per store instance', () => {
    const a = createSeenStore(memoryStorage())
    const b = createSeenStore(memoryStorage())
    a.mark(seenKey('guest', 'x'), 'downloaded', 1)
    expect(a.version()).toBe(1)
    expect(b.version()).toBe(0)
  })
})

describe('takeRecentDownloaded (§AE)', () => {
  it('returns newest first, capped, with the full total', () => {
    const { ids, total } = takeRecentDownloaded([10, 20, 30, 40, 50], 3)
    expect(ids).toEqual([50, 40, 30])
    expect(total).toBe(5)
  })

  it('returns everything reversed when the limit covers the list', () => {
    const { ids, total } = takeRecentDownloaded([1, 2], 50)
    expect(ids).toEqual([2, 1])
    expect(total).toBe(2)
  })

  it('empty input stays empty', () => {
    expect(takeRecentDownloaded([], 50)).toEqual({ ids: [], total: 0 })
  })

  it('a zero or negative limit yields no ids but keeps the total', () => {
    expect(takeRecentDownloaded([1, 2, 3], 0)).toEqual({ ids: [], total: 3 })
    expect(takeRecentDownloaded([1, 2, 3], -5)).toEqual({ ids: [], total: 3 })
  })

  it('does not mutate the input list', () => {
    const input = [1, 2, 3]
    takeRecentDownloaded(input, 2)
    expect(input).toEqual([1, 2, 3])
  })
})
