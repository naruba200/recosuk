import { useSyncExternalStore } from 'react'
import type { AuthTier } from './capabilities'

/**
 * Seen-set for recommendations (PLAN-v2 §13.2.4): beatmapset ids the
 * user has already been served, played, downloaded or skipped — the
 * Unlimited feed (and Generated regeneration) must never repeat them.
 *
 * v1 scope: localStorage for ALL tiers, keyed by tier+username
 * (`recosuk-seen:{tier}:{username}`). Played ids are fed in by the
 * profile/recommendation layers from most-played + recent plays;
 * downloads are recorded by the row/mirror download actions; skips
 * by the feed's Skip button.
 *
 * `served` is SESSION-SCOPED (batch 6, defect 2): it is only the
 * in-session no-repeat guarantee — the plan's durable dedupe set is
 * played/downloaded/skipped. Persisting `served` forever saturated
 * the pool (every generation appends 20–50 ids, so after heavy
 * testing the first search windows were entirely hard-seen and the
 * first entry to Recommendations opened on the all-seen empty
 * state). `load()` therefore always starts `served` as [] and
 * `save()` strips it before writing, so legacy saturated storage
 * self-cleans on the next save. Played/downloaded/skipped
 * persistence is unchanged, and `isHardSeen` is unchanged (served
 * still excludes within the session). M5's server-side persistence
 * must NOT sync `served` either — only played/downloaded/skipped
 * and rated feedback.
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
  /** Monotonic counter bumped on every effective mutation (a mark
   * that changes something, or clearing a present key). Lets React
   * screens subscribe and re-read fresh state — see
   * useSeenVersion below. */
  version: () => number
  /** Subscribe to version bumps. Returns an unsubscribe function.
   * The listener is stable per store instance. */
  subscribe: (listener: () => void) => () => void
}

export function createSeenStore(storage: StorageLike | null): SeenStore {
  const memory = new Map<string, SeenState>()
  let version = 0
  const listeners = new Set<() => void>()

  function notify(): void {
    version += 1
    for (const listener of [...listeners]) listener()
  }

  function load(key: string): SeenState {
    const mem = memory.get(key)
    if (mem) return mem
    if (storage) {
      try {
        const raw = storage.getItem(`seen:${key}`)
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<SeenState>
          // `served` is session-scoped: any persisted value (written
          // by older builds, which persisted it unboundedly) is
          // deliberately ignored — a fresh session re-serves sets
          // that were only ever served, while played/downloaded/
          // skipped keep excluding.
          const state: SeenState = {
            played: parsed.played ?? [],
            downloaded: parsed.downloaded ?? [],
            skipped: parsed.skipped ?? [],
            served: [],
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
    // The in-memory copy keeps `served` for this session; storage
    // never sees it (session-scoped — see the module doc). Stripping
    // it here also self-cleans legacy storage that still holds a
    // saturated `served` array from older builds.
    memory.set(key, state)
    if (storage) {
      try {
        const persisted = {
          played: state.played,
          downloaded: state.downloaded,
          skipped: state.skipped,
        }
        storage.setItem(`seen:${key}`, JSON.stringify(persisted))
      } catch {
        /* quota/private mode — in-memory copy still works */
      }
    }
    // Only reached when markMany actually changed something
    // (it returns early otherwise), so every notify() here
    // means real new state for subscribers to re-read.
    notify()
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
      // Only a present key is a real change worth notifying:
      // clearing an absent key leaves every load() result as-is.
      const had = memory.delete(key)
      try {
        storage?.removeItem(`seen:${key}`)
      } catch {
        /* ignore */
      }
      if (had) notify()
    },
    version: () => version,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const seenStore: SeenStore = createSeenStore(defaultStorage())

/**
 * Re-render the caller whenever any seen-store mutation lands
 * (a download/skip/serve mark, or a clear). The version is
 * global across keys, so a download in one Recommendations view
 * re-renders the other view too — both re-read via
 * seenStore.load() during that render and see the fresh
 * `downloaded` list, with no polling and no focus/visibility
 * listeners. Served marks also bump the version (they are real
 * mutations); the re-render is cheap and the downloaded array
 * keeps its identity across them.
 */
export function useSeenVersion(): number {
  return useSyncExternalStore(seenStore.subscribe, seenStore.version, seenStore.version)
}

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
