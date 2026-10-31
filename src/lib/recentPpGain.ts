import type { StatSnapshot } from './profileService'

/**
 * Total profile-pp gain across the recent plays shown (§AJ).
 *
 * The gain is a PROFILE-pp delta, never the sum of the plays' pp: the
 * user's total pp went up by (current pp − snapshot pp), where the
 * snapshot is the one the profile had at/before the oldest shown play.
 * Every snapshot timestamp is compared in epoch ms so the rule holds
 * no matter what order the snapshots arrive in.
 */
export interface RecentPpGain {
  /** Profile-pp delta, rounded to a whole number (can be 0 or negative). */
  gain: number
  /** ISO timestamp of the snapshot the gain is measured from. */
  since: string
}

interface UsableSnapshot {
  pp: number
  at: number
  createdAt: string
}

/**
 * Returns null when the gain cannot be backed by a snapshot — never a
 * guessed number. Null cases: no plays shown (no oldest play), no
 * snapshots at all, every snapshot has a null/unusable pp or an
 * unparseable timestamp, or the current pp is not a finite number.
 *
 * Baseline rule, in order:
 *  1. The latest snapshot with a timestamp at or before the oldest
 *     shown play's `created_at` (a snapshot exactly at that instant
 *     counts — the play had not happened yet at that point).
 *  2. If no snapshot predates the oldest play, the OLDEST available
 *     snapshot — the gain is then measured from that snapshot's date,
 *     which the caller must show next to the number.
 */
export function computeRecentPpGain(
  currentPp: number,
  snapshots: StatSnapshot[] | null | undefined,
  oldestPlayAt: string | null | undefined,
): RecentPpGain | null {
  if (!Number.isFinite(currentPp)) return null
  if (!oldestPlayAt) return null
  const oldestMs = Date.parse(oldestPlayAt)
  if (!Number.isFinite(oldestMs)) return null
  if (!snapshots || snapshots.length === 0) return null

  const usable: UsableSnapshot[] = []
  for (const snap of snapshots) {
    if (typeof snap?.pp !== 'number' || !Number.isFinite(snap.pp)) continue
    const at = Date.parse(snap.created_at)
    if (!Number.isFinite(at)) continue
    usable.push({ pp: snap.pp, at, createdAt: snap.created_at })
  }
  if (usable.length === 0) return null

  const before = usable
    .filter((s) => s.at <= oldestMs)
    .sort((a, b) => b.at - a.at)
  const baseline =
    before[0] ?? usable.slice().sort((a, b) => a.at - b.at)[0]
  return { gain: Math.round(currentPp - baseline.pp), since: baseline.createdAt }
}
