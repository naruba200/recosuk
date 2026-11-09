// Converted from Stitch export: stitch-raw/06-dashboard.html
// M2: the real variant renders the same design with the linked
// player's live data via useProfileData().
import { useState } from 'react'
import AppShell from '../components/AppShell'
import LoadErrorPanel from '../components/LoadErrorPanel'
import LoadingState from '../components/LoadingState'
import AccBandChart from '../components/AccBandChart'
import RecentPlaysSection from '../components/RecentPlaysSection'
import { useProfileData, useSnapshots, type ProfileData } from '../lib/profileService'
import { useCapabilities } from '../lib/capabilities'
import { useModeStore } from '../lib/modeStore'
import { MODE_LABELS } from '../lib/mode'
import { fmtAcc, fmtInt, fmtSr } from '../lib/interpretations'
import { useAuth } from '../lib/auth'

// ---------------------------------------------------------------------------
// Real variant (M2): same design, live data for the linked player.
// ---------------------------------------------------------------------------

export function DashboardReal({ data, onRefresh }: { data: ProfileData; onRefresh: () => void }) {
  const mode = useModeStore((s) => s.mode)
  const { user, skillProfile: p } = data
  const stats = user.statistics ?? {}
  const drop =
    p.ceilingAccuracy !== null
      ? Math.round((p.comfortAccuracy - p.ceilingAccuracy) * 10) / 10
      : null
  const caps = useCapabilities()
  // Snapshots reload after a sync (same snapToken pattern as Stats):
  // the new snapshot row is written best-effort by persistProfile, so
  // the refetch may land just before the insert — the next mount or
  // sync picks it up, matching Stats behaviour.
  const [snapToken, setSnapToken] = useState(0)
  const snapshots = useSnapshots(mode, snapToken)
  const handleRefresh = () => {
    onRefresh()
    setSnapToken((n) => n + 1)
  }
  // Freshness cue (§AK): the profile's generatedAt stamp moves on
  // every refetch — manual or automatic — so this is only ever
  // shown after a real generation, never faked.
  const generatedMs = Date.parse(p.generatedAt)
  const updatedLabel = Number.isFinite(generatedMs)
    ? new Date(generatedMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null
  const updatedTitle =
    Number.isFinite(generatedMs)
      ? `Last refreshed ${new Date(generatedMs).toLocaleDateString()} ${new Date(generatedMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : null

  return (
    <div className="flex flex-col w-full">
      <div className="relative w-full">
        <div className="absolute -top-12 left-1/3 w-96 h-96 bg-primary/10 rounded-full blur-[140px] pointer-events-none -z-10"></div>
        <div className="absolute top-48 right-10 w-72 h-72 bg-secondary/5 rounded-full blur-[110px] pointer-events-none -z-10"></div>
        {/* Profile hero */}
        <div className="relative w-full rounded-lg bg-surface-container-low shadow-xl overflow-hidden mb-space-lg">
          <div className="w-full h-44 bg-cover bg-center relative" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuDa5Gd6-otAY9OlG_DpeR4pvH7tHzAQdUnTPg-wqPjFx04URRto6MclmhzcPELrSvs7GoGdvl4u_PpZCUavUzP6Dm7UaTdeujXVuIXIUHlbnSHwguyByff45YUMnZzZ447V5sreYDsVe6ydJCvjXMswBsFrbgfHtkHqB3KLJm3KHg9h1iV2m1g2DNdBlUons_7lBswxS-u72kA91JlNiBIEScja7SGNPCjMrb4u3xkefiWg5VXEsxub')" }}>
            <div className="absolute inset-0 bg-gradient-to-t from-surface-container-low via-surface-container-low/80 to-transparent"></div>
            <div className="absolute inset-0 bg-gradient-to-r from-surface-container-lowest/90 via-surface-container-low/40 to-primary-container/20"></div>
            <div className="absolute top-4 right-6 flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container-lowest/70 backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-[#7EE787] shadow-[0_0_8px_#7EE787]"></span>
              <span className="font-label-sm text-label-sm text-on-surface">osu! {MODE_LABELS[mode].toLowerCase()} live tracking</span>
            </div>
          </div>
          <div className="relative px-space-lg pb-space-lg pt-0">
            <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-space-lg -mt-16">
              <div className="flex flex-col sm:flex-row items-start sm:items-end gap-space-md min-w-0">
                <div className="relative group flex-shrink-0">
                  <div className="w-28 h-28 rounded-full bg-surface-container-high p-1 shadow-[0_0_28px_rgba(164,118,255,0.4)]">
                    <img className="w-full h-full object-cover rounded-full" alt="" src={`https://a.ppy.sh/${user.id}`} />
                  </div>
                  {user.country_code && (
                    <div className="absolute bottom-1 right-1 flex items-center justify-center px-1.5 h-7 rounded-full bg-surface-container-lowest shadow-md">
                      <span className="text-[11px] leading-none font-bold text-on-surface" title={user.country_code}>{user.country_code}</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex flex-wrap items-center gap-space-xs">
                    <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight leading-none">{user.username}</h1>
                    <div className="px-2.5 py-0.5 rounded-full bg-primary-container/30 text-primary font-label-sm text-label-sm font-semibold tracking-wide uppercase">
                      {MODE_LABELS[mode]}{p.mainKeyCount ? ` ${p.mainKeyCount}K` : ''} profile
                    </div>
                    {p.globalRank !== null && (
                      <div className="px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm">Global #{fmtInt(p.globalRank)}</div>
                    )}
                  </div>
                  <div className="flex items-baseline gap-3 my-1">
                    <span className="font-metric-display text-metric-display text-primary drop-shadow-[0_0_18px_rgba(210,187,255,0.35)]">{fmtInt(p.pp)}</span>
                    <span className="font-headline-md text-headline-md text-on-surface-variant tracking-normal">pp</span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant pl-2">Weighted: 100% ({MODE_LABELS[mode].toLowerCase()})</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-space-md gap-y-1 font-body-sm text-body-sm text-on-surface-variant">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-tertiary">public</span>
                      <span className="text-on-surface font-semibold font-label-md text-label-md">Global {p.globalRank !== null ? `#${fmtInt(p.globalRank)}` : '—'}</span>
                    </div>
                    <span className="text-outline-variant">·</span>
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-secondary">flag</span>
                      <span className="text-on-surface font-semibold font-label-md text-label-md">Country {p.countryRank !== null ? `#${fmtInt(p.countryRank)}` : '—'}</span>
                    </div>
                    <span className="text-outline-variant">·</span>
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-[#7EE787]">track_changes</span>
                      <span className="text-on-surface font-semibold font-label-md text-label-md">Accuracy {fmtAcc(p.accuracy)}</span>
                    </div>
                    <span className="text-outline-variant">·</span>
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-primary">equalizer</span>
                      <span className="text-on-surface font-semibold font-label-md text-label-md">{fmtInt(p.playCount)} plays</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 pt-2 xl:pt-0">
                <button className="flex items-center gap-2 px-space-md py-2.5 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md font-semibold hover:brightness-110 active:scale-95 transition-all shadow-[0_0_16px_rgba(164,118,255,0.3)]" type="button" onClick={handleRefresh}>
                  <span className="material-symbols-outlined text-[18px]">sync</span>
                  <span>Sync now</span>
                </button>
                {updatedLabel && (
                  <span className="font-label-sm text-label-sm text-on-surface-variant" title={updatedTitle ?? undefined}>Updated {updatedLabel}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {p.isStarter ? (
          <div className="w-full rounded-lg bg-surface-container-low p-space-lg shadow-md">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full bg-secondary shadow-[0_0_8px_rgba(255,176,204,0.7)]"></span>
              <h2 className="font-headline-md text-headline-md text-on-surface">Not enough {MODE_LABELS[mode]} plays yet</h2>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
              {user.username} has no recorded top plays in {MODE_LABELS[mode]}, so there is no personal
              skill profile to show for this mode. Recommendations for {MODE_LABELS[mode]} use starter
              picks (popular Ranked maps around {fmtSr(p.comfortSrMin)}–{fmtSr(p.comfortSrMax)}★) — clearly
              not personalised. Play some {MODE_LABELS[mode]} and sync again to build the real profile.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="px-3 py-1.5 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm">Starter comfort band: {fmtSr(p.comfortSrMin)}–{fmtSr(p.comfortSrMax)}★</span>
              <span className="px-3 py-1.5 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm">Starter tempo: {p.bpmSweetMin}–{p.bpmSweetMax} BPM</span>
              <span className="px-3 py-1.5 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm">Play count in mode: {fmtInt(stats.play_count ?? 0)}</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
            <div className="lg:col-span-8 flex flex-col gap-space-lg">
              <div className="w-full rounded-lg bg-surface-container-low p-space-lg shadow-md relative overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm mb-space-md">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_8px_rgba(210,187,255,0.8)]"></span>
                      <h2 className="font-headline-md text-headline-md text-on-surface">Your skill gap</h2>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Accuracy degradation across star difficulties ({MODE_LABELS[mode]})</p>
                  </div>
                  {drop !== null && (
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container-high text-on-surface">
                      <span className="material-symbols-outlined text-secondary text-[16px]">crisis_alert</span>
                      <span className="font-label-sm text-label-sm">Collapse point detected: <strong className="text-secondary font-bold">{fmtSr(p.srCeiling)}★</strong> (-{drop.toFixed(1)}% drop)</span>
                    </div>
                  )}
                </div>
                <AccBandChart profile={p} />
                <div className="mt-space-sm pt-space-xs flex flex-wrap items-center justify-between gap-2 font-body-sm text-body-sm text-on-surface-variant">
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-primary text-[16px]">info</span>
                    Analysis derived from your top {p.topPlayCount} plays in {MODE_LABELS[mode]}.
                  </span>
                </div>
              </div>

            </div>

            <div className="lg:col-span-4 flex flex-col gap-space-lg">
              <div className="w-full rounded-lg bg-surface-container-low p-space-lg shadow-md">
                <div className="flex items-center justify-between mb-space-md">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center">
                      <span className="font-headline-sm text-[11px] leading-none">{MODE_LABELS[mode].slice(0, 3).toLowerCase()}</span>
                    </div>
                    <h3 className="font-headline-sm text-headline-sm text-on-surface">Skill profile</h3>
                  </div>
                  <span className="font-label-sm text-label-sm text-primary font-semibold">Active Model</span>
                </div>
                <div className="flex flex-col gap-space-md">
                  <div className="p-space-sm rounded-DEFAULT bg-surface-container flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-label-md text-label-md text-on-surface">Comfort band</span>
                      <span className="font-label-md text-label-md text-[#7EE787] font-bold">{fmtSr(p.comfortSrMin)}–{fmtSr(p.comfortSrMax)}★</span>
                    </div>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">{fmtAcc(p.comfortAccuracy)} average accuracy inside the band</span>
                  </div>
                  <div className="p-space-sm rounded-DEFAULT bg-surface-container flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-label-md text-label-md text-on-surface">Accuracy ceiling</span>
                      <span className="font-label-md text-label-md text-secondary font-bold">{fmtSr(p.srCeiling)}★</span>
                    </div>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">{p.ceilingAccuracy !== null ? `${fmtAcc(p.ceilingAccuracy)} accuracy at and above it` : 'Not reached in your top plays yet'}</span>
                  </div>
                  <div className="p-space-sm rounded-DEFAULT bg-surface-container flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-label-md text-label-md text-on-surface">Best tempo</span>
                      <span className="font-label-md text-label-md text-tertiary font-bold">{p.bpmSweetMin}–{p.bpmSweetMax} BPM</span>
                    </div>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">Mean {p.bpmMean} BPM across your top plays</span>
                  </div>
                  {mode === 'mania' && p.mainKeyCount !== null && (
                    <div className="p-space-sm rounded-DEFAULT bg-surface-container flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="font-label-md text-label-md text-on-surface">Main key count</span>
                        <span className="font-label-md text-label-md text-primary font-bold">{p.mainKeyCount}K</span>
                      </div>
                      <span className="font-body-sm text-body-sm text-on-surface-variant">{p.keySharePct}% of your top plays use this layout</span>
                    </div>
                  )}
                  {p.playstyleTags.length > 0 && (
                    <div className="p-space-sm rounded-DEFAULT bg-surface-container flex flex-col gap-1">
                      <span className="font-label-md text-label-md text-on-surface">Playstyle tags</span>
                      <div className="flex flex-wrap gap-1.5">
                        {p.playstyleTags.map((tag) => (
                          <span key={tag} className="px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm">{tag}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Recent plays (§AJ): below the main grid so it shows for
            starters too — same left-column width as the top plays. */}
        <div className="mt-space-lg grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
          <div className="lg:col-span-8">
            <RecentPlaysSection
              plays={data.recentPlays}
              currentPp={p.pp}
              snapshots={snapshots}
              isAccount={caps.isAccount}
              modeLabel={MODE_LABELS[mode]}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const mode = useModeStore((s) => s.mode)
  const { tier } = useAuth()
  const { status, data, error, identity, refresh } = useProfileData(mode)

  if (status === 'loading' && !data) {
    return (
      <AppShell
        identity={{
          username: identity?.username ?? 'Loading…',
          pp: null,
          tierLabel: tier === 'account' ? 'account' : tier === 'guest' ? 'guest' : 'free tier',
        }}
      >
        <LoadingState label={`Loading your ${MODE_LABELS[mode]} profile from osu!…`} />
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
      <DashboardReal data={data} onRefresh={refresh} />
    </AppShell>
  )
}
