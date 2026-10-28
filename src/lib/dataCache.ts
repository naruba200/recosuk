/**
 * Tiny generic TTL cache (QA batch 2, item 5): mode-scoped search
 * results and other refetchable reads are cached in memory so
 * switching back to a mode/query already loaded once renders
 * instantly instead of re-fetching. Entries expire after their TTL;
 * explicit Refresh actions bypass the cache (callers simply don't
 * consult it) and overwrite the entry.
 *
 * In-memory only, on purpose: search results go stale fast, and
 * nothing here must survive a reload. Profile data keeps its own
 * module cache in profileService.ts (same keying idea, per
 * (username, mode), with inflight dedupe).
 */

export interface DataCache {
  get<T>(key: string): T | undefined
  set<T>(key: string, value: T, ttlMs: number): void
  delete(key: string): void
  clear(): void
}

export function createDataCache(now: () => number = () => Date.now()): DataCache {
  const store = new Map<string, { value: unknown; expiresAt: number }>()

  return {
    get<T>(key: string): T | undefined {
      const entry = store.get(key)
      if (!entry) return undefined
      if (entry.expiresAt <= now()) {
        store.delete(key)
        return undefined
      }
      return entry.value as T
    },

    set<T>(key: string, value: T, ttlMs: number): void {
      store.set(key, { value, expiresAt: now() + ttlMs })
    },

    delete(key: string): void {
      store.delete(key)
    },

    clear(): void {
      store.clear()
    },
  }
}

/** Shared in-memory cache for search pages (Mirror + recommendations). */
export const dataCache = createDataCache()
