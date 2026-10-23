import type { AuthTier } from './capabilities'

/**
 * Seen-set for recommendations (PLAN-v2 §13.2.4): beatmapset ids the
 * user has already been served, played, downloaded or skipped — the
 * Unlimited feed (and Generated regeneration) must never repeat them.
 *
 * v1 scope: localStorage for ALL tiers, keyed by tier+username
 * (`recosuk-seen:{tier}:{username}`). Server-side persistence for
 * accounts (cross-device resume) arrives with M5. Played ids are fed
 * in by the profile/recommendation layers from most-played + recent
 * plays; downloads are recorded by the row/mirror download actions;
 * skips by the feed's Skip button.
 */

export interface SeenState {
  played: number[]
  downloaded: number[]
  skipped: number[]
  served: number[]
}

export type SeenKind = keyof SeenState

const EMPTY: SeenState = { played: [], downloaded: [], skipped: [], served: [] }

export function seenKey(tier: AuthTier, username: string | null | undefined): string {
  return `recosuk-seen:${tier}:${(username ?? 'anon').toLowerCase()}`
}

export interface StorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export interface SeenStore {
  load: (key: string) => SeenState
  mark: (key: string, kind: SeenKind, beatmapsetId: number) => SeenState
  markMany: (key: string, kind: SeenKind, beatmapsetIds: number[]) => SeenState
  clear: (key: string) => void
}

export function createSeenStore(storage: StorageLike | null): SeenStore {
  const memory = new Map<string, SeenState>()

  function load(key: string): SeenState {
    const mem = memory.get(key)
    if (mem) return mem
    if (storage) {
      try {
        const raw = storage.getItem(`seen:${key}`)
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<SeenState>
          const state: SeenState = {
            played: parsed.played ?? [],
            downloaded: parsed.downloaded ?? [],
            skipped: parsed.skipped ?? [],
            served: parsed.served ?? [],
          }
          memory.set(key, state)
          return state
        }
      } catch {
        /* corrupt storage — start fresh */
      }
    }
    const fresh = { ...EMPTY }
    memory.set(key, fresh)
    return fresh
  }

  function save(key: string, state: SeenState): void {
    memory.set(key, state)
    if (storage) {
      try {
        storage.setItem(`seen:${key}`, JSON.stringify(state))
      } catch {
        /* quota/private mode — in-memory copy still works */
      }
    }
  }

  function markMany(key: string, kind: SeenKind, ids: number[]): SeenState {
    const state = load(key)
    const set = new Set(state[kind])
    let changed = false
    for (const id of ids) {
      if (!set.has(id)) {
        set.add(id)
        changed = true
      }
    }
    if (!changed) return state
    const next = { ...state, [kind]: [...set] }
    save(key, next)
    return next
  }

  return {
    load,
    mark: (key, kind, id) => markMany(key, kind, [id]),
    markMany,
    clear: (key) => {
      memory.delete(key)
      try {
        storage?.removeItem(`seen:${key}`)
      } catch {
        /* ignore */
      }
    },
  }
}

export const seenStore: SeenStore = createSeenStore(defaultStorage())

/**
 * Should this set be hidden from a fresh recommendation run? Played
 * maps are *penalised* by scoring rather than hard-excluded in
 * Generated mode, so this checks the hard exclusions only: downloaded,
 * skipped, and already-served (the feed's no-repeat guarantee).
 */
export function isHardSeen(state: SeenState, beatmapsetId: number): boolean {
  return (
    state.downloaded.includes(beatmapsetId) ||
    state.skipped.includes(beatmapsetId) ||
    state.served.includes(beatmapsetId)
  )
}

export function isPlayed(state: SeenState, beatmapsetId: number): boolean {
  return state.played.includes(beatmapsetId)
}
