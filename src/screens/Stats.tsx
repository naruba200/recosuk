// Converted from Stitch export: stitch-raw/07-stats.html
// M2: the real variant below renders the same design language
// with live per-mode data, the interpretation layer, top plays,
// and snapshot history.
import { useEffect, useRef, useState } from 'react'
import AppShell from '../components/AppShell'
import LoadErrorPanel from '../components/LoadErrorPanel'
import LoadingState from '../components/LoadingState'
import AccBandChart from '../components/AccBandChart'
import StatCards from '../components/StatCards'
import LockedButton from '../components/LockedButton'
import { useProfileData, useSnapshots, type ProfileData } from '../lib/profileService'
import { useModeStore } from '../lib/modeStore'
import { MODE_LABELS } from '../lib/mode'
import { fmtAcc, fmtInt, interpretProfile } from '../lib/interpretations'
import { useAuth } from '../lib/auth'
import { useCapabilities } from '../lib/capabilities'
import { hasMoreToShow, nextVisibleCount, TOP_PLAYS_PAGE_SIZE } from '../lib/showMore'

// ---------------------------------------------------------------------------
// Real variant (M2): full stat tracker for the linked player.
// ---------------------------------------------------------------------------

function formatHours(seconds: number | undefined): string {
  if (!seconds) return '0'
  return fmtInt(Math.round(seconds / 3600))
}

export function StatsReal({
  data,
}: {
  data: ProfileData
}) {
  const mode = useModeStore((s) => s.mode)
  const { user, skillProfile: p } = data
  const stats = user.statistics ?? {}
  const caps = useCapabilities()
  const [snapToken, setSnapToken] = useState(0)
  const snapshots = useSnapshots(mode, snapToken)
  // §AQ item 5: the Stats header (and its "Refresh from osu!"
  // button) is gone — the Dashboard's "Sync now" is the only
  // refresh. A sync still writes a new snapshot, so reload the
  // Progress history whenever a refresh lands (generatedAt moves);
  // the first run is skipped so the mount fetch is not doubled.
  const firstGeneratedAt = useRef(p.generatedAt)
  useEffect(() => {
    if (firstGeneratedAt.current === p.generatedAt) return
    firstGeneratedAt.current = p.generatedAt
    setSnapToken((n) => n + 1)
  }, [p.generatedAt])
  // §AQ item 6: the longer top-plays list reveals +15 per press.
  // Reset to the first page when the mode changes (adjusted
  // during render, so the first render after a switch already
  // shows 15 — an effect would flash the old count first).
  const [visibleTopPlays, setVisibleTopPlays] = useState(TOP_PLAYS_PAGE_SIZE)
  const [prevTopPlaysMode, setPrevTopPlaysMode] = useState(mode)
  if (prevTopPlaysMode !== mode) {
    setPrevTopPlaysMode(mode)
    setVisibleTopPlays(TOP_PLAYS_PAGE_SIZE)
  }

  return (
    <div className="flex flex-col w-full">
      {/* §AQ item 5: no Stats header block — the Dashboard above
          already carries the profile heading and the only refresh
          ("Sync now"), so a second title/description/refresh in
          the middle of the page is redundant. */}
      {p.isStarter && (
        <div className="p-space-md rounded-DEFAULT bg-surface-container-low shadow-[0_4px_16px_rgba(0,0,0,0.35)] mb-space-xl">
          <p className="font-body-md text-body-md text-on-surface">
            Not enough {MODE_LABELS[mode]} plays yet — {user.username} has no top plays in this mode, so
            the numbers below are their account totals and the analysis cards show starter estimates,
            not a personalised profile.
          </p>
        </div>
      )}

      {/* Headline numbers strip (§AQ item 1: the Performance
          Points card is removed — the Dashboard above already
          shows the pp; the remaining four cards fill the row, so
          the grid drops from five columns to four on xl). */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-space-md mb-space-xl">
        <div className="relative overflow-hidden p-space-md rounded-DEFAULT bg-surface-container-low shadow-[0_4px_16px_rgba(0,0,0,0.35)]">
          <div className="flex items-center justify-between text-on-surface-variant mb-1">
            <span className="font-label-sm text-label-sm uppercase tracking-wider">Global Ranking</span>
            {user.country_code && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary-container text-secondary font-label-sm text-[10px] font-bold">
                <span>{user.country_code}</span>
                <span>{p.countryRank !== null ? `#${fmtInt(p.countryRank)}` : ''}</span>
              </div>
            )}
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-metric-display text-metric-display text-on-surface tracking-tight leading-none">{p.globalRank !== null ? `#${fmtInt(p.globalRank)}` : '—'}</span>
          </div>
          <div className="flex items-center gap-1 mt-2 text-on-surface-variant">
            <span className="font-label-sm text-label-sm">{MODE_LABELS[mode]} leaderboard</span>
          </div>
        </div>
        <div className="relative overflow-hidden p-space-md rounded-DEFAULT bg-surface-container-low shadow-[0_4px_16px_rgba(0,0,0,0.35)]">
          <div className="flex items-center justify-between text-on-surface-variant mb-1">
            <span className="font-label-sm text-label-sm uppercase tracking-wider">Hit Accuracy</span>
            <span className="material-symbols-outlined text-tertiary text-[18px]">adjust</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-metric-display text-metric-display text-on-surface tracking-tight leading-none">{fmtAcc(p.accuracy)}</span>
          </div>
          <div className="flex items-center gap-1 mt-2 text-on-surface-variant">
            <span className="font-label-sm text-label-sm">{p.recentAccuracy !== null ? `recent plays ${fmtAcc(p.recentAccuracy)}` : 'lifetime average'}</span>
          </div>
        </div>
        <div className="relative overflow-hidden p-space-md rounded-DEFAULT bg-surface-container-low shadow-[0_4px_16px_rgba(0,0,0,0.35)]">
          <div className="flex items-center justify-between text-on-surface-variant mb-1">
            <span className="font-label-sm text-label-sm uppercase tracking-wider">Total Plays</span>
            <span className="material-symbols-outlined text-on-surface-variant text-[18px]">play_circle</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-metric-display text-metric-display text-on-surface tracking-tight leading-none">{fmtInt(p.playCount)}</span>
          </div>
          <div className="flex items-center gap-1 mt-2 text-on-surface-variant">
            <span className="font-label-sm text-label-sm">grades: {stats.grade_counts?.ss ?? 0} SS · {stats.grade_counts?.s ?? 0} S · {stats.grade_counts?.a ?? 0} A</span>
          </div>
        </div>
        <div className="relative overflow-hidden p-space-md rounded-DEFAULT bg-surface-container-low shadow-[0_4px_16px_rgba(0,0,0,0.35)] col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-on-surface-variant mb-1">
            <span className="font-label-sm text-label-sm uppercase tracking-wider">Time on Stage</span>
            <span className="material-symbols-outlined text-on-surface-variant text-[18px]">timer</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-metric-display text-metric-display text-on-surface tracking-tight leading-none">{formatHours(stats.play_time)}</span>
            <span className="font-headline-sm text-headline-sm text-on-surface-variant">hrs</span>
          </div>
          <div className="flex items-center gap-1 mt-2 text-primary font-label-sm text-label-sm font-medium">
            <span>Level {stats.level?.current ?? '—'}</span>
            <span className="text-on-surface-variant">• max combo {fmtInt(stats.maximum_combo ?? 0)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
        <div className="lg:col-span-7 flex flex-col gap-space-lg">
          <div className="relative p-space-lg rounded-DEFAULT bg-surface-container-low shadow-[0_4px_24px_rgba(0,0,0,0.4)] overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-space-md">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">bar_chart</span>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">Accuracy by Star Rating Band</h2>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Your average accuracy grouped by map difficulty — the comfort band and the collapse band</p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm">Sample: top {p.topPlayCount} plays</span>
              </div>
            </div>
            <AccBandChart profile={p} />
          </div>

          <div className="relative p-space-lg rounded-DEFAULT bg-surface-container-low shadow-[0_4px_24px_rgba(0,0,0,0.4)] overflow-hidden">
            <div className="flex items-center gap-2 mb-space-md">
              <span className="material-symbols-outlined text-primary text-[20px]">emoji_events</span>
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Top Plays</h2>
            </div>
            {data.topPlays.length === 0 ? (
              <p className="font-body-sm text-body-sm text-on-surface-variant">No top plays in {MODE_LABELS[mode]} yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {data.topPlays.slice(0, visibleTopPlays).map((play) => (
                  <div key={play.id ?? play.beatmap?.id} className="flex items-center gap-space-md p-2 rounded-DEFAULT bg-surface-container">
                    {play.beatmapset?.covers?.list ? (
                      <img className="w-16 h-10 rounded object-cover flex-shrink-0" alt="" src={play.beatmapset.covers.list} />
                    ) : (
                      <div className="w-16 h-10 rounded bg-surface-container-highest flex-shrink-0"></div>
                    )}
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-label-md text-label-md text-on-surface truncate">
                        {play.beatmapset?.title ?? 'Unknown map'} <span className="text-on-surface-variant">[{play.beatmap?.version}]</span>
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant truncate">
                        {play.beatmapset?.artist} · {play.beatmap?.bpm ?? '—'} BPM · mapped by {play.beatmapset?.creator ?? '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-space-md flex-shrink-0 font-label-sm text-label-sm">
                      <span className="text-[#FFCC22] font-bold">{play.beatmap?.difficulty_rating.toFixed(2)}★</span>
                      <span className="text-on-surface">{(play.accuracy * 100).toFixed(2)}%</span>
                      <span className="text-primary font-bold">{play.pp ? `${Math.round(play.pp)}pp` : '—'}</span>
                      <span className="text-on-surface-variant">{fmtInt(play.max_combo)}x</span>
                      {/* §AQ item 8: the mods are badges now — always
                          visible, not small text hidden below xl. */}
                      {(play.mods ?? []).length > 0 && (
                        <span className="flex items-center gap-1">
                          {(play.mods ?? []).map((mod) => (
                            <span
                              key={mod}
                              className="px-1.5 py-0.5 rounded-full bg-surface-container-highest text-on-surface font-label-sm text-[10px] font-bold"
                            >
                              {mod}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {/* §AQ item 6: reveal +15 per press until the loaded
                    list (up to 100) is exhausted; then the button
                    goes away instead of pretending there is more. */}
                {hasMoreToShow(visibleTopPlays, data.topPlays.length) && (
                  <button
                    className="mt-1 px-space-md py-2 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-md text-label-md transition-colors self-center"
                    type="button"
                    onClick={() =>
                      setVisibleTopPlays((n) =>
                        nextVisibleCount(n, data.topPlays.length, TOP_PLAYS_PAGE_SIZE),
                      )
                    }
                  >
                    Show more ({data.topPlays.length - visibleTopPlays} more)
                  </button>
                )}
              </div>
            )}
          </div>

          {data.mostPlayed.length > 0 && (
            <div className="relative p-space-lg rounded-DEFAULT bg-surface-container-low shadow-[0_4px_24px_rgba(0,0,0,0.4)] overflow-hidden">
              <div className="flex items-center gap-2 mb-space-md">
                <span className="material-symbols-outlined text-primary text-[20px]">repeat</span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Most Played Maps</h2>
              </div>
              <div className="flex flex-col gap-2">
                {data.mostPlayed.slice(0, 8).map((entry) => (
                  <div key={entry.beatmap?.id ?? entry.beatmapset?.id} className="flex items-center gap-space-md p-2 rounded-DEFAULT bg-surface-container">
                    {entry.beatmapset?.covers?.list ? (
                      <img className="w-16 h-10 rounded object-cover flex-shrink-0" alt="" src={entry.beatmapset.covers.list} />
                    ) : (
                      <div className="w-16 h-10 rounded bg-surface-container-highest flex-shrink-0"></div>
                    )}
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-label-md text-label-md text-on-surface truncate">{entry.beatmapset?.title ?? 'Unknown map'}</span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant truncate">{entry.beatmapset?.artist}</span>
                    </div>
                    <span className="font-label-sm text-label-sm text-primary font-bold flex-shrink-0">{entry.count} plays</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 flex flex-col gap-space-lg">
          <div className="relative p-space-lg rounded-DEFAULT bg-surface-container-low shadow-[0_4px_24px_rgba(0,0,0,0.4)] overflow-hidden">
            <div className="flex items-center gap-2 mb-space-md">
              <span className="material-symbols-outlined text-primary text-[20px]">insights</span>
              <h2 className="font-headline-sm text-headline-sm text-on-surface">What your numbers mean</h2>
            </div>
            <StatCards cards={interpretProfile(p)} />
          </div>

          {/* Snapshot history: accounts get their progress log; guests get
              the locked panel (PLAN-v2 §4.2/§6). */}
          <div className="relative p-space-lg rounded-DEFAULT bg-surface-container-low shadow-[0_4px_24px_rgba(0,0,0,0.4)] overflow-hidden">
            <div className="flex items-center gap-2 mb-space-md">
              <span className="material-symbols-outlined text-primary text-[20px]">history</span>
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Progress history</h2>
            </div>
            {caps.canSnapshotHistory ? (
              snapshots === null ? (
                <p className="font-body-sm text-body-sm text-on-surface-variant">Loading snapshots…</p>
              ) : snapshots.length === 0 ? (
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  No snapshots yet for {MODE_LABELS[mode]}. Hit "Sync now" and your first
                  snapshot is saved — future refreshes build your progress-over-time line.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {snapshots.map((snap) => (
                    <div key={snap.id} className="flex items-center justify-between p-2 rounded-DEFAULT bg-surface-container font-label-sm text-label-sm">
                      <span className="text-on-surface-variant">{new Date(snap.created_at).toLocaleDateString()} {new Date(snap.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="text-primary font-bold">{snap.pp !== null ? `${fmtInt(snap.pp)} pp` : '—'}</span>
                      <span className="text-on-surface">{snap.global_rank !== null ? `#${fmtInt(snap.global_rank)}` : '—'}</span>
                      <span className="text-on-surface-variant">{snap.accuracy !== null ? fmtAcc(snap.accuracy) : '—'}</span>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="flex flex-col gap-space-sm">
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Snapshot history is account-only: guests get live stats, but their progress
                  over time isn't kept. Create a free account and every refresh is saved here.
                </p>
                <LockedButton
                  allowed={false}
                  lockedTitle="Create a free account to keep snapshot history"
                  className="flex items-center justify-center gap-2 px-space-md py-2.5 rounded-full bg-surface-container-high text-on-surface font-label-md text-label-md"
                >
                  View snapshot history
                </LockedButton>
              </div>
            )}
          </div>

          {p.modUsage.length > 0 && (
            <div className="relative p-space-lg rounded-DEFAULT bg-surface-container-low shadow-[0_4px_24px_rgba(0,0,0,0.4)] overflow-hidden">
              <div className="flex items-center gap-2 mb-space-md">
                <span className="material-symbols-outlined text-primary text-[20px]">tune</span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Mod usage</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {p.modUsage.slice(0, 8).map((entry) => (
                  <span key={entry.mod} className="px-3 py-1.5 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm">
                    {entry.mod} · {entry.count}
                  </span>
                ))}
              </div>
              {p.playstyleTags.length > 0 && (
                <>
                  <div className="flex items-center gap-2 mt-space-md mb-space-sm">
                    <span className="material-symbols-outlined text-primary text-[20px]">sell</span>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface">Playstyle tags</h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {p.playstyleTags.map((tag) => (
                      <span key={tag} className="px-3 py-1.5 rounded-full bg-primary-container/25 text-primary font-label-sm text-label-sm">{tag}</span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Stats() {
  const mode = useModeStore((s) => s.mode)
  const { tier } = useAuth()
  const { status, data, error, identity, refresh } = useProfileData(mode)

  if (status === 'loading') {
    return (
      <AppShell
        identity={{
          username: identity?.username ?? 'Loading…',
          pp: null,
          tierLabel: tier === 'account' ? 'account' : tier === 'guest' ? 'guest' : 'free tier',
        }}
      >
        <LoadingState label={`Loading your ${MODE_LABELS[mode]} stats from osu!…`} />
      </AppShell>
    )
  }
  if (status === 'error' || !data) {
    return (
      <AppShell
        identity={{
          username: identity?.username ?? 'No linked profile',
          pp: null,
          tierLabel: tier === 'account' ? 'account' : tier === 'guest' ? 'guest' : 'free tier',
        }}
      >
        <LoadErrorPanel message={error} onRetry={refresh} noProfile={!identity?.username} />
      </AppShell>
    )
  }

  return (
    <AppShell
      identity={{
        username: data.user.username,
        pp: data.skillProfile.pp,
        countryCode: data.user.country_code,
        avatarUrl: `https://a.ppy.sh/${data.user.id}`,
        tierLabel: tier === 'account' ? 'account' : 'guest',
      }}
    >
      <StatsReal data={data} />
    </AppShell>
  )
}
