import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameMode } from '../mode'
import type { OsuScore } from '../osu'
import {
  PROFILE_POLL_CHECK_COOLDOWN_MS,
  PROFILE_POLL_INTERVAL_MS,
  PROFILE_POLL_MAX_DELAY_MS,
  createProfileWatcher,
  isNewerPlay,
  newestPlayKey,
  nextPollDelayMs,
  resetProfileWatcherSession,
  type PlayKey,
  type ProfileWatcher,
} from '../profileWatcher'

const MIN = 60 * 1000

function play(id: number | null, createdAt?: string): OsuScore {
  return {
    id: id ?? undefined,
    accuracy: 0.99,
    pp: 100,
    max_combo: 500,
    mods: [],
    ...(createdAt ? { created_at: createdAt } : {}),
  }
}

describe('newestPlayKey', () => {
  it('returns null for null/undefined/empty lists', () => {
    expect(newestPlayKey(null)).toBeNull()
    expect(newestPlayKey(undefined)).toBeNull()
    expect(newestPlayKey([])).toBeNull()
  })

  it('picks the latest created_at regardless of list order', () => {
    const plays = [
      play(1, '2026-11-04T10:00:00Z'),
      play(3, '2026-11-04T12:00:00Z'),
      play(2, '2026-11-04T11:00:00Z'),
    ]
    expect(newestPlayKey(plays)).toEqual({ id: 3, createdAt: '2026-11-04T12:00:00Z' })
  })

  it('breaks created_at ties by the larger score id', () => {
    const plays = [play(5, '2026-11-04T10:00:00Z'), play(9, '2026-11-04T10:00:00Z')]
    expect(newestPlayKey(plays)).toEqual({ id: 9, createdAt: '2026-11-04T10:00:00Z' })
  })

  it('ignores plays with neither a date nor an id', () => {
    const plays = [play(null), play(4, '2026-11-04T10:00:00Z')]
    expect(newestPlayKey(plays)).toEqual({ id: 4, createdAt: '2026-11-04T10:00:00Z' })
    expect(newestPlayKey([play(null)])).toBeNull()
  })

  it('falls back to the largest id when no play has a date', () => {
    expect(newestPlayKey([play(2), play(7)])).toEqual({ id: 7, createdAt: '' })
  })

  it('prefers a dated play over an undated one with a larger id', () => {
    const plays = [play(99), play(1, '2026-11-04T10:00:00Z')]
    expect(newestPlayKey(plays)).toEqual({ id: 1, createdAt: '2026-11-04T10:00:00Z' })
  })
})

describe('isNewerPlay', () => {
  const known: PlayKey = { id: 10, createdAt: '2026-11-04T10:00:00Z' }

  it('returns false for a null candidate', () => {
    expect(isNewerPlay(null, known)).toBe(false)
  })

  it('returns true when nothing is known yet', () => {
    expect(isNewerPlay({ id: 1, createdAt: '2026-11-04T10:00:00Z' }, null)).toBe(true)
  })

  it('treats a different score id as a new play', () => {
    expect(isNewerPlay({ id: 11, createdAt: '2026-11-04T10:00:00Z' }, known)).toBe(true)
  })

  it('treats the same id and date as the same play', () => {
    expect(isNewerPlay({ ...known }, known)).toBe(false)
  })

  it('treats the same id as the same play even with a later date', () => {
    // Score ids are unique per play: the id wins. The date fallback
    // only applies when ids are missing (see the test below).
    expect(isNewerPlay({ id: 10, createdAt: '2026-11-04T11:00:00Z' }, known)).toBe(false)
    expect(isNewerPlay({ id: 10, createdAt: '2026-11-04T09:00:00Z' }, known)).toBe(false)
  })

  it('falls back to dates when ids are missing', () => {
    const dateless: PlayKey = { id: null, createdAt: '2026-11-04T10:00:00Z' }
    expect(isNewerPlay({ id: null, createdAt: '2026-11-04T11:00:00Z' }, dateless)).toBe(true)
    expect(isNewerPlay({ id: null, createdAt: '2026-11-04T10:00:00Z' }, dateless)).toBe(false)
    expect(isNewerPlay({ id: null, createdAt: 'not-a-date' }, dateless)).toBe(false)
  })
})

describe('nextPollDelayMs', () => {
  it('starts at the base interval and doubles to the cap', () => {
    expect(nextPollDelayMs(0)).toBe(PROFILE_POLL_INTERVAL_MS)
    expect(nextPollDelayMs(1)).toBe(2 * PROFILE_POLL_INTERVAL_MS)
    expect(nextPollDelayMs(2)).toBe(4 * PROFILE_POLL_INTERVAL_MS)
    expect(nextPollDelayMs(3)).toBe(PROFILE_POLL_MAX_DELAY_MS)
    expect(nextPollDelayMs(100)).toBe(PROFILE_POLL_MAX_DELAY_MS)
    expect(nextPollDelayMs(-1)).toBe(PROFILE_POLL_INTERVAL_MS)
  })
})

describe('createProfileWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetProfileWatcherSession()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function setup(probeImpl?: (uid: number, mode: GameMode) => Promise<OsuScore[]>) {
    const probe = vi.fn(
      probeImpl ?? (async () => [play(1, '2026-11-04T10:00:00Z')]),
    )
    const onNewPlay = vi.fn()
    let hidden = false
    let mode: GameMode = 'osu'
    const watcher: ProfileWatcher = createProfileWatcher({
      getUserId: () => 42,
      getMode: () => mode,
      probeRecentPlays: probe,
      onNewPlay,
      isHidden: () => hidden,
    })
    return {
      watcher,
      probe,
      onNewPlay,
      setHidden: (v: boolean) => {
        hidden = v
      },
      setMode: (m: GameMode) => {
        mode = m
      },
    }
  }

  it('does not probe immediately; probes once per interval', async () => {
    const { watcher, probe } = setup()
    watcher.setKnownPlays([play(1, '2026-11-04T10:00:00Z')], 'u:osu')
    watcher.start()
    await vi.advanceTimersByTimeAsync(PROFILE_POLL_INTERVAL_MS - 1000)
    expect(probe).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(probe).toHaveBeenCalledTimes(1)
    expect(probe).toHaveBeenCalledWith(42, 'osu')
  })

  it('does nothing when the newest play is unchanged', async () => {
    const { watcher, probe, onNewPlay } = setup()
    watcher.setKnownPlays([play(1, '2026-11-04T10:00:00Z')], 'u:osu')
    watcher.start()
    await vi.advanceTimersByTimeAsync(PROFILE_POLL_INTERVAL_MS)
    await vi.advanceTimersByTimeAsync(PROFILE_POLL_INTERVAL_MS)
    expect(probe).toHaveBeenCalledTimes(2)
    expect(onNewPlay).not.toHaveBeenCalled()
  })

  it('calls onNewPlay once when a new play id appears, then stops re-firing once known', async () => {
    const { watcher, probe, onNewPlay } = setup(async () => [
      play(2, '2026-11-04T11:00:00Z'),
    ])
    watcher.setKnownPlays([play(1, '2026-11-04T10:00:00Z')], 'u:osu')
    watcher.start()
    await vi.advanceTimersByTimeAsync(PROFILE_POLL_INTERVAL_MS)
    expect(onNewPlay).toHaveBeenCalledTimes(1)
    // The refetch lands: the marker advances, so the next probe
    // sees the same play and stays quiet.
    watcher.setKnownPlays([play(2, '2026-11-04T11:00:00Z')], 'u:osu')
    await vi.advanceTimersByTimeAsync(PROFILE_POLL_INTERVAL_MS)
    expect(probe).toHaveBeenCalledTimes(2)
    expect(onNewPlay).toHaveBeenCalledTimes(1)
  })

  it('detects a new play by date when score ids are missing', async () => {
    const { watcher, onNewPlay } = setup(async () => [
      play(null, '2026-11-04T11:00:00Z'),
    ])
    watcher.setKnownPlays([play(null, '2026-11-04T10:00:00Z')], 'u:osu')
    watcher.start()
    await vi.advanceTimersByTimeAsync(PROFILE_POLL_INTERVAL_MS)
    expect(onNewPlay).toHaveBeenCalledTimes(1)
  })

  it('does not probe while the tab is hidden; resumes when visible', async () => {
    const { watcher, probe, setHidden } = setup()
    setHidden(true)
    watcher.setKnownPlays([play(1, '2026-11-04T10:00:00Z')], 'u:osu')
    watcher.start()
    await vi.advanceTimersByTimeAsync(3 * PROFILE_POLL_INTERVAL_MS)
    expect(probe).not.toHaveBeenCalled()
    setHidden(false)
    await vi.advanceTimersByTimeAsync(PROFILE_POLL_INTERVAL_MS)
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('backs off on probe failure and stops after three in a row', async () => {
    const { watcher, probe, onNewPlay } = setup(async () => {
      throw new Error('proxy down')
    })
    watcher.setKnownPlays([play(1, '2026-11-04T10:00:00Z')], 'u:osu')
    watcher.start()
    await vi.advanceTimersByTimeAsync(PROFILE_POLL_INTERVAL_MS)
    expect(probe).toHaveBeenCalledTimes(1)
    // Backoff: 10 minutes, not 5.
    await vi.advanceTimersByTimeAsync(PROFILE_POLL_INTERVAL_MS)
    expect(probe).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(PROFILE_POLL_INTERVAL_MS)
    expect(probe).toHaveBeenCalledTimes(2)
    // Backoff: 20 minutes.
    await vi.advanceTimersByTimeAsync(2 * PROFILE_POLL_INTERVAL_MS)
    expect(probe).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2 * PROFILE_POLL_INTERVAL_MS)
    expect(probe).toHaveBeenCalledTimes(3)
    // Third consecutive failure: dead for the session.
    expect(watcher.isDead()).toBe(true)
    await vi.advanceTimersByTimeAsync(60 * MIN)
    expect(probe).toHaveBeenCalledTimes(3)
    watcher.checkNow()
    expect(probe).toHaveBeenCalledTimes(3)
    expect(onNewPlay).not.toHaveBeenCalled()
  })

  it('resets the backoff after a successful probe', async () => {
    let calls = 0
    const { watcher, probe } = setup(async () => {
      calls += 1
      if (calls === 1) throw new Error('proxy down')
      return [play(1, '2026-11-04T10:00:00Z')]
    })
    watcher.setKnownPlays([play(1, '2026-11-04T10:00:00Z')], 'u:osu')
    watcher.start()
    await vi.advanceTimersByTimeAsync(PROFILE_POLL_INTERVAL_MS)
    expect(probe).toHaveBeenCalledTimes(1)
    // Still backing off: no probe at +5min.
    await vi.advanceTimersByTimeAsync(PROFILE_POLL_INTERVAL_MS)
    expect(probe).toHaveBeenCalledTimes(1)
    // Success at +10min → back to the base interval.
    await vi.advanceTimersByTimeAsync(PROFILE_POLL_INTERVAL_MS)
    expect(probe).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(PROFILE_POLL_INTERVAL_MS)
    expect(probe).toHaveBeenCalledTimes(3)
  })

  it('checkNow probes immediately, then respects the 60s cooldown', async () => {
    const { watcher, probe } = setup()
    watcher.setKnownPlays([play(1, '2026-11-04T10:00:00Z')], 'u:osu')
    watcher.start()
    watcher.checkNow()
    await vi.advanceTimersByTimeAsync(0)
    expect(probe).toHaveBeenCalledTimes(1)
    watcher.checkNow()
    await vi.advanceTimersByTimeAsync(0)
    expect(probe).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(PROFILE_POLL_CHECK_COOLDOWN_MS + 1000)
    watcher.checkNow()
    await vi.advanceTimersByTimeAsync(0)
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it('never overlaps an in-flight probe', async () => {
    let resolveProbe!: (plays: OsuScore[]) => void
    const { watcher, probe } = setup(
      () =>
        new Promise<OsuScore[]>((resolve) => {
          resolveProbe = resolve
        }),
    )
    watcher.setKnownPlays([play(1, '2026-11-04T10:00:00Z')], 'u:osu')
    watcher.start()
    await vi.advanceTimersByTimeAsync(PROFILE_POLL_INTERVAL_MS)
    expect(probe).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(PROFILE_POLL_INTERVAL_MS)
    expect(probe).toHaveBeenCalledTimes(1)
    resolveProbe([play(1, '2026-11-04T10:00:00Z')])
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(PROFILE_POLL_INTERVAL_MS)
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it('follows a mode switch: the marker resets per key and probes use the new mode', async () => {
    let latest: OsuScore[] = [play(5, '2026-11-04T10:00:00Z')]
    const { watcher, probe, onNewPlay, setMode } = setup(async () => latest)
    watcher.setKnownPlays([play(9, '2026-11-04T12:00:00Z')], 'u:osu')
    setMode('mania')
    watcher.setKnownPlays([play(5, '2026-11-04T10:00:00Z')], 'u:mania')
    watcher.start()
    await vi.advanceTimersByTimeAsync(PROFILE_POLL_INTERVAL_MS)
    expect(probe).toHaveBeenCalledWith(42, 'mania')
    // The mania marker (10:00) is older than the old osu marker
    // (12:00) — the reset means it still counts as known.
    expect(onNewPlay).not.toHaveBeenCalled()
    latest = [play(6, '2026-11-04T11:00:00Z')]
    await vi.advanceTimersByTimeAsync(PROFILE_POLL_INTERVAL_MS)
    expect(onNewPlay).toHaveBeenCalledTimes(1)
  })

  it('setKnownPlays never moves the marker backwards for the same key', async () => {
    const { watcher, onNewPlay } = setup(async () => [
      play(1, '2026-11-04T10:00:00Z'),
    ])
    watcher.setKnownPlays([play(2, '2026-11-04T12:00:00Z')], 'u:osu')
    watcher.setKnownPlays([play(1, '2026-11-04T10:00:00Z')], 'u:osu')
    watcher.start()
    await vi.advanceTimersByTimeAsync(PROFILE_POLL_INTERVAL_MS)
    expect(onNewPlay).not.toHaveBeenCalled()
  })

  it('stop() halts polling and start() resumes it', async () => {
    const { watcher, probe } = setup()
    watcher.setKnownPlays([play(1, '2026-11-04T10:00:00Z')], 'u:osu')
    watcher.start()
    watcher.stop()
    await vi.advanceTimersByTimeAsync(6 * PROFILE_POLL_INTERVAL_MS)
    expect(probe).not.toHaveBeenCalled()
    watcher.start()
    await vi.advanceTimersByTimeAsync(PROFILE_POLL_INTERVAL_MS)
    expect(probe).toHaveBeenCalledTimes(1)
  })
})
