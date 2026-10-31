import { describe, expect, it } from 'vitest'
import { computeRecentPpGain } from '../recentPpGain'
import type { StatSnapshot } from '../profileService'

function snap(pp: number | null, created_at: string): StatSnapshot {
  return {
    id: `s-${created_at}`,
    mode: 'mania',
    pp,
    global_rank: null,
    accuracy: null,
    created_at,
  }
}

describe('computeRecentPpGain (§AJ)', () => {
  it('uses the latest snapshot at or before the oldest shown play', () => {
    const snapshots = [
      snap(5200, '2026-10-20T08:00:00Z'),
      snap(5250, '2026-10-25T08:00:00Z'),
      snap(5270, '2026-10-29T08:00:00Z'),
    ]
    // Oldest shown play is Oct 28 — the Oct 29 snapshot is after it
    // and must NOT be the baseline.
    expect(computeRecentPpGain(5284, snapshots, '2026-10-28T10:00:00Z')).toEqual({
      gain: 34,
      since: '2026-10-25T08:00:00Z',
    })
  })

  it('counts a snapshot exactly at the oldest play instant', () => {
    const snapshots = [snap(5200, '2026-10-28T10:00:00Z')]
    expect(computeRecentPpGain(5210, snapshots, '2026-10-28T10:00:00Z')).toEqual({
      gain: 10,
      since: '2026-10-28T10:00:00Z',
    })
  })

  it('falls back to the oldest snapshot when none predates the oldest play', () => {
    const snapshots = [
      snap(5260, '2026-10-29T08:00:00Z'),
      snap(5270, '2026-10-30T08:00:00Z'),
    ]
    // Oldest play Oct 28 — both snapshots are after it, so the gain is
    // measured from the oldest one we have (Oct 29).
    expect(computeRecentPpGain(5284, snapshots, '2026-10-28T10:00:00Z')).toEqual({
      gain: 24,
      since: '2026-10-29T08:00:00Z',
    })
  })

  it('returns null with no snapshots', () => {
    expect(computeRecentPpGain(5284, [], '2026-10-28T10:00:00Z')).toBeNull()
    expect(computeRecentPpGain(5284, null, '2026-10-28T10:00:00Z')).toBeNull()
    expect(computeRecentPpGain(5284, undefined, '2026-10-28T10:00:00Z')).toBeNull()
  })

  it('returns null with no plays shown', () => {
    const snapshots = [snap(5200, '2026-10-20T08:00:00Z')]
    expect(computeRecentPpGain(5284, snapshots, null)).toBeNull()
    expect(computeRecentPpGain(5284, snapshots, undefined)).toBeNull()
    expect(computeRecentPpGain(5284, snapshots, 'not-a-date')).toBeNull()
  })

  it('returns null when the current pp is not finite', () => {
    const snapshots = [snap(5200, '2026-10-20T08:00:00Z')]
    expect(computeRecentPpGain(Number.NaN, snapshots, '2026-10-28T10:00:00Z')).toBeNull()
  })

  it('reports negative and zero gains honestly', () => {
    const snapshots = [snap(5300, '2026-10-20T08:00:00Z')]
    expect(computeRecentPpGain(5285, snapshots, '2026-10-28T10:00:00Z')).toEqual({
      gain: -15,
      since: '2026-10-20T08:00:00Z',
    })
    expect(computeRecentPpGain(5300, snapshots, '2026-10-28T10:00:00Z')).toEqual({
      gain: 0,
      since: '2026-10-20T08:00:00Z',
    })
  })

  it('skips snapshots with null pp or unparseable timestamps', () => {
    const snapshots = [
      snap(null, '2026-10-25T08:00:00Z'),
      snap(5250, 'not-a-date'),
      snap(5200, '2026-10-20T08:00:00Z'),
    ]
    expect(computeRecentPpGain(5284, snapshots, '2026-10-28T10:00:00Z')).toEqual({
      gain: 84,
      since: '2026-10-20T08:00:00Z',
    })
    expect(
      computeRecentPpGain(5284, [snap(null, '2026-10-20T08:00:00Z')], '2026-10-28T10:00:00Z'),
    ).toBeNull()
  })

  it('is independent of the order snapshots arrive in', () => {
    const ordered = [
      snap(5200, '2026-10-20T08:00:00Z'),
      snap(5250, '2026-10-25T08:00:00Z'),
      snap(5270, '2026-10-29T08:00:00Z'),
    ]
    const shuffled = [ordered[2], ordered[0], ordered[1]]
    expect(computeRecentPpGain(5284, shuffled, '2026-10-28T10:00:00Z')).toEqual(
      computeRecentPpGain(5284, ordered, '2026-10-28T10:00:00Z'),
    )
  })

  it('rounds the gain to a whole number', () => {
    const snapshots = [snap(1000, '2026-10-20T08:00:00Z')]
    expect(computeRecentPpGain(1084.6, snapshots, '2026-10-28T10:00:00Z')?.gain).toBe(85)
    expect(computeRecentPpGain(1084.2, snapshots, '2026-10-28T10:00:00Z')?.gain).toBe(84)
  })
})
