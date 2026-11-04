import type { GameMode } from './mode'
import type { OsuScore } from './osu'

/**
 * New-play detection for auto profile refresh (§AK).
 *
 * The profile is otherwise frozen at first analysis: `fetchProfileData`
 * caches per (username, mode) with no TTL, and `useProfileData` only
 * refetches on "Sync now", a mode switch, or a page reload. This
 * module is the lightweight check that notices a new play WITHOUT
 * refetching the whole profile: one `getRecentPlays` probe for the
 * current mode, comparing only the newest play's identity. The full
 * refetch happens only when the newest play actually changed.
 *
 * The watcher is framework-free (plain timers + injected callbacks)
 * so it is fully unit-testable with fake timers; `useProfileData`
 * wires it to the real proxy call and the quiet forced refetch.
 */

/** Probe cadence while the tab is visible. */
export const PROFILE_POLL_INTERVAL_MS = 5 * 60 * 1000
/** After this many consecutive probe failures, polling stops for the session. */
export const PROFILE_POLL_MAX_FAILURES = 3
/** Backoff cap: the delay never grows past this, however many failures pile up. */
export const PROFILE_POLL_MAX_DELAY_MS = 30 * 60 * 1000
/** A focus/visibility check never probes twice within this window. */
export const PROFILE_POLL_CHECK_COOLDOWN_MS = 60 * 1000

/** Identity of one play, for "is this the play we already know?" */
export interface PlayKey {
  id: number | null
  createdAt: string
}

function playEpochMs(play: OsuScore): number {
  if (!play?.created_at) return -1
  const ms = Date.parse(play.created_at)
  return Number.isFinite(ms) ? ms : -1
}

function playId(play: OsuScore): number | null {
  return typeof play?.id === 'number' && Number.isFinite(play.id) ? play.id : null
}

/**
 * The newest play in a list: latest `created_at`, breaking ties by
 * the larger score id. Order-independent (the API does not promise
 * an order). Plays with neither a parseable date nor an id carry no
 * identity and never win. Returns null for an empty list.
 */
export function newestPlayKey(
  plays: readonly OsuScore[] | null | undefined,
): PlayKey | null {
  if (!plays || plays.length === 0) return null
  let best: OsuScore | null = null
  let bestAt = -1
  let bestId: number | null = null
  for (const play of plays) {
    if (!play) continue
    const at = playEpochMs(play)
    const id = playId(play)
    if (at === -1 && id === null) continue
    if (
      best === null ||
      at > bestAt ||
      (at === bestAt && id !== null && (bestId === null || id > bestId))
    ) {
      best = play
      bestAt = at
      bestId = id
    }
  }
  if (!best) return null
  return { id: bestId, createdAt: best.created_at ?? '' }
}

/**
 * True when `candidate` is a play the watcher has not seen yet.
 * A different score id means a different newest play; with no ids
 * to compare, a strictly later `created_at` decides. Equal ids with
 * an equal (or unparseable) date, or two unidentifiable plays, are
 * the same play — never a refresh.
 */
export function isNewerPlay(
  candidate: PlayKey | null,
  known: PlayKey | null,
): boolean {
  if (!candidate) return false
  if (!known) return true
  if (candidate.id !== null && known.id !== null) {
    return candidate.id !== known.id
  }
  const candidateAt = Date.parse(candidate.createdAt)
  const knownAt = Date.parse(known.createdAt)
  if (!Number.isFinite(candidateAt) || !Number.isFinite(knownAt)) return false
  return candidateAt > knownAt
}

/**
 * Delay before the next probe after `consecutiveFailures` failures
 * in a row: the base interval, doubling each time, capped so a
 * struggling proxy is never waited on for more than 30 minutes.
 * 0 failures → the base 5-minute interval.
 */
export function nextPollDelayMs(consecutiveFailures: number): number {
  const failures = Math.max(0, Math.floor(consecutiveFailures))
  return Math.min(PROFILE_POLL_INTERVAL_MS * 2 ** failures, PROFILE_POLL_MAX_DELAY_MS)
}

/**
 * Once probes have failed PROFILE_POLL_MAX_FAILURES times in a row,
 * polling stops for the rest of the page session — a dead proxy is
 * never hammered. A reload (or "Sync now", which bypasses the
 * watcher) is the way back. Tests reset it with
 * resetProfileWatcherSession().
 */
let sessionDead = false

/** Test-only reset for the session-dead flag (see above). */
export function resetProfileWatcherSession(): void {
  sessionDead = false
}

export interface ProfileWatcherOptions {
  getUserId: () => number | null
  getMode: () => GameMode
  probeRecentPlays: (userId: number, mode: GameMode) => Promise<OsuScore[]>
  /** Called exactly when the probe sees a play the watcher doesn't know yet. */
  onNewPlay: () => void
  /** Defaults to reading document.hidden; inject a stub in tests. */
  isHidden?: () => boolean
}

export interface ProfileWatcher {
  /**
   * Record the plays the profile already knows about. `key` scopes
   * the marker (username:mode): a different key RESETS it to the
   * newest play given, so a mode switch never lets one mode's newest
   * play suppress another mode's detection. The same key only ever
   * advances the marker — fresh data can never move it backwards.
   */
  setKnownPlays(plays: readonly OsuScore[] | null | undefined, key: string): void
  /** Begin polling (first probe after one full interval). No-op when already started or session-dead. */
  start(): void
  /** Halt polling until start() is called again. Backoff state is kept. */
  stop(): void
  /** Probe right now (focus/visibility return). No-op while hidden, in-flight, cooling down, or session-dead. */
  checkNow(): void
  /** True once probing has stopped for the session (too many failures). */
  isDead(): boolean
}

export function createProfileWatcher(options: ProfileWatcherOptions): ProfileWatcher {
  const isHidden =
    options.isHidden ??
    (() => typeof document !== 'undefined' && document.hidden)
  let known: PlayKey | null = null
  let knownKey: string | null = null
  let failures = 0
  let started = false
  let inflight = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastProbeAt = 0

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function schedule(delayMs: number): void {
    clearTimer()
    if (!started || sessionDead) return
    timer = setTimeout(() => {
      void runProbe()
    }, delayMs)
  }

  async function runProbe(): Promise<void> {
    if (!started || sessionDead) return
    if (inflight) {
      schedule(nextPollDelayMs(failures))
      return
    }
    // Paused while hidden: no network, and the cadence resumes
    // from the next tick (or from the visibility/focus check).
    if (isHidden()) {
      schedule(nextPollDelayMs(failures))
      return
    }
    const userId = options.getUserId()
    if (userId === null) {
      schedule(nextPollDelayMs(failures))
      return
    }
    inflight = true
    lastProbeAt = Date.now()
    try {
      const plays = await options.probeRecentPlays(userId, options.getMode())
      failures = 0
      const newest = newestPlayKey(plays)
      if (isNewerPlay(newest, known)) {
        // Do NOT advance `known` here: the refetch may fail, and
        // then the next probe must see the same new play again.
        // The caller advances the marker from the fresh profile
        // data (setKnownPlays) once the refetch lands.
        options.onNewPlay()
      }
    } catch {
      failures += 1
      if (failures >= PROFILE_POLL_MAX_FAILURES) {
        sessionDead = true
        clearTimer()
        return
      }
    } finally {
      inflight = false
    }
    schedule(nextPollDelayMs(failures))
  }

  return {
    setKnownPlays(plays, key) {
      const newest = newestPlayKey(plays)
      if (!newest) return
      if (knownKey !== key) {
        known = newest
        knownKey = key
      } else if (isNewerPlay(newest, known)) {
        known = newest
      }
    },
    start() {
      if (started || sessionDead) return
      started = true
      schedule(nextPollDelayMs(failures))
    },
    stop() {
      started = false
      clearTimer()
    },
    checkNow() {
      if (!started || sessionDead || inflight) return
      if (isHidden()) return
      if (Date.now() - lastProbeAt < PROFILE_POLL_CHECK_COOLDOWN_MS) return
      void runProbe()
    },
    isDead() {
      return sessionDead
    },
  }
}
