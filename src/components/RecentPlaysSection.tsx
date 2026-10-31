import { Fragment, type ReactNode } from 'react'
import type { OsuScore } from '../lib/osu'
import type { StatSnapshot } from '../lib/profileService'
import { computeRecentPpGain } from '../lib/recentPpGain'
import { fmtInt } from '../lib/interpretations'

export interface RecentPlaysSectionProps {
  /** Recent plays already fetched for the current mode (proxy caps at 24). */
  plays: OsuScore[]
  /** Current profile pp for the current mode (skillProfile.pp). */
  currentPp: number
  /** Account snapshots for the current mode, or null while loading / for guests. */
  snapshots: StatSnapshot[] | null
  /** False for guests — snapshots are account-only, so no total is shown. */
  isAccount: boolean
  /** Mode label for the subtitle / empty state (e.g. "Mania"). */
  modeLabel: string
}

function formatPlayDate(createdAt: string | undefined): string | null {
  if (!createdAt) return null
  const d = new Date(createdAt)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString()
}

function formatGain(gain: number): string {
  return gain >= 0 ? `+${fmtInt(gain)} pp` : `−${fmtInt(-gain)} pp`
}

/** Earliest valid `created_at` across the shown plays, or null. */
function oldestPlayAt(plays: OsuScore[]): string | null {
  let oldestMs: number | null = null
  let oldest: string | null = null
  for (const play of plays) {
    if (!play.created_at) continue
    const ms = Date.parse(play.created_at)
    if (!Number.isFinite(ms)) continue
    if (oldestMs === null || ms < oldestMs) {
      oldestMs = ms
      oldest = play.created_at
    }
  }
  return oldest
}

/**
 * Dashboard "Recent plays" section (§AJ): the recent plays the profile
 * already fetches, each with its result pp, plus the profile-pp gain
 * across the plays shown. The gain is a profile delta (current pp −
 * snapshot pp at/before the oldest shown play) — NEVER the sum of the
 * plays' pp. The period date is shown next to the number, always.
 * Guests see the plays with no total (snapshots are account-only).
 */
export default function RecentPlaysSection({
  plays,
  currentPp,
  snapshots,
  isAccount,
  modeLabel,
}: RecentPlaysSectionProps) {
  const gain = isAccount
    ? computeRecentPpGain(currentPp, snapshots, oldestPlayAt(plays))
    : null
  const sinceDate = gain ? new Date(gain.since).toLocaleDateString() : null

  return (
    <div className="flex flex-col gap-space-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-secondary shadow-[0_0_8px_rgba(255,176,204,0.7)]"></span>
            <h2 className="font-headline-md text-headline-md text-on-surface">Recent plays</h2>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Your latest {modeLabel} plays, with the pp each one earned
          </p>
        </div>
        {gain && sinceDate && (
          <span
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container-high text-on-surface self-start sm:self-auto"
            title={`Profile pp gained across the plays shown, measured from the snapshot on ${sinceDate}`}
          >
            <span className="material-symbols-outlined text-primary text-[16px]">
              {gain.gain >= 0 ? 'trending_up' : 'trending_down'}
            </span>
            <span className="font-label-sm text-label-sm">
              <strong className="text-primary font-bold">{formatGain(gain.gain)}</strong> since{' '}
              {sinceDate}
            </span>
          </span>
        )}
      </div>

      {!isAccount && plays.length > 0 && (
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Total pp gain is account-only — guest progress isn&apos;t saved.
        </p>
      )}
      {isAccount && snapshots !== null && snapshots.length === 0 && plays.length > 0 && (
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          No snapshots yet — hit “Sync now” to save your first one, and the pp gain across
          these plays will show from then.
        </p>
      )}

      {plays.length === 0 ? (
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          No recent plays in {modeLabel} yet.
        </p>
      ) : (
        plays.map((play) => {
          const mods = play.mods ?? []
          const date = formatPlayDate(play.created_at)
          const meta: ReactNode[] = []
          if (play.beatmapset?.artist) {
            meta.push(
              <span key="artist" className="text-on-surface">
                {play.beatmapset.artist}
              </span>,
            )
          }
          if (play.beatmap?.version) {
            meta.push(<span key="version">[{play.beatmap.version}]</span>)
          }
          meta.push(
            <span key="acc">{(play.accuracy * 100).toFixed(2)}% acc</span>,
          )
          if (mods.length > 0) {
            meta.push(<span key="mods">{mods.join('')}</span>)
          }
          if (play.rank) {
            meta.push(<span key="rank">rank {play.rank}</span>)
          }
          if (date) {
            meta.push(<span key="date">{date}</span>)
          }
          return (
            <div
              key={play.id ?? play.beatmap?.id}
              className="group relative rounded-full bg-surface-container-low hover:bg-surface-container-high transition-all p-2 pr-space-lg flex items-center justify-between gap-space-md shadow-sm"
            >
              <div className="flex items-center gap-space-md min-w-0 flex-1">
                <div className="relative flex-shrink-0 w-14 h-14 rounded-full p-0.5 bg-primary/40 shadow-[0_0_12px_rgba(164,118,255,0.4)]">
                  <img
                    className="w-full h-full object-cover rounded-full"
                    alt=""
                    src={play.beatmapset?.covers?.card ?? ''}
                  />
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-headline-sm text-headline-sm text-on-surface truncate">
                      {play.beatmapset?.title ?? 'Unknown map'}
                    </span>
                    {play.beatmap && (
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-highest">
                        <span className="text-[#FFCC22] text-[12px] leading-none">★</span>
                        <span className="font-label-sm text-[11px] font-bold text-[#FFCC22]">
                          {play.beatmap.difficulty_rating.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant truncate">
                    {meta.map((node, i) => (
                      <Fragment key={i}>
                        {i > 0 && <span>·</span>}
                        {node}
                      </Fragment>
                    ))}
                  </div>
                </div>
              </div>
              <span className="font-label-md text-label-md text-primary font-bold flex-shrink-0">
                {typeof play.pp === 'number' && Number.isFinite(play.pp)
                  ? `${Math.round(play.pp)} pp`
                  : '—'}
              </span>
            </div>
          )
        })
      )}
    </div>
  )
}
