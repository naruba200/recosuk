// Converted from Stitch export: stitch-raw/05-welcome-recs.html
// M4: the real variant below shows the actual first recommendation
// set generated during onboarding (§5.5) — previews and downloads
// work, gated buttons teach the account lock, and the Skip button
// at the bottom finishes onboarding for good.
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import BeatmapRow from '../components/BeatmapRow'
import LoadErrorPanel from '../components/LoadErrorPanel'
import LoadingState from '../components/LoadingState'
import {
  getWelcomeRecs,
  seedPlayedSets,
  useProfileData,
  type ProfileData,
} from '../lib/profileService'
import { useModeStore } from '../lib/modeStore'
import { MODE_LABELS } from '../lib/mode'
import { defaultFiltersFor, generateRecommendations, type RecCandidate } from '../lib/recommend'
import { seenKey, seenStore } from '../lib/seenStore'
import { useCapabilities } from '../lib/capabilities'
import { useRowMaps } from '../lib/useRowMaps'
import { useAuth } from '../lib/auth'

// ---------------------------------------------------------------------------
// Real variant (M4, §5.5): the temporary welcome-recommendations page.
// ---------------------------------------------------------------------------

function finishOnboarding(navigate: (path: string) => void) {
  try {
    window.localStorage.setItem('recosuk-onboarded', '1')
  } catch {
    /* ignore */
  }
  navigate('/beatmaps')
}

function WelcomeRecsReal({ data }: { data: ProfileData }) {
  const navigate = useNavigate()
  const mode = useModeStore((s) => s.mode)
  const { tier, user } = useAuth()
  const caps = useCapabilities()
  const profile = data.skillProfile
  const key = seenKey(tier, data.user.username)
  const [items, setItems] = useState<RecCandidate[]>(
    () => getWelcomeRecs(data.user.username, mode) ?? [],
  )
  const [busy, setBusy] = useState(false)
  const [downloadedTick, setDownloadedTick] = useState(0)
  // Batched row state (batch 11, part 5) — see RecommendationsReal.
  const rowMaps = useRowMaps({
    userId: user?.id,
    canRate: caps.canRate,
    canSave: caps.canSave,
    feedbackMode: mode,
    beatmapsetIds: items.map((c) => c.beatmapsetId),
  })

  const generate = useCallback(async () => {
    setBusy(true)
    try {
      seedPlayedSets(key, data)
      const seen = seenStore.load(key)
      const result = await generateRecommendations(profile, mode, {
        count: 10,
        filters: defaultFiltersFor(profile),
        seen,
      })
      setItems(result.items)
      seenStore.markMany(key, 'served', result.items.map((c) => c.beatmapsetId))
    } catch {
      /* keep whatever the Generating screen pre-generated */
    } finally {
      setBusy(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, mode, profile])

  useEffect(() => {
    if (items.length === 0) void generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, profile])

  const downloaded = seenStore.load(key).downloaded

  return (
    <div className="flex flex-col w-full max-w-7xl mx-auto gap-space-lg select-none pb-12">
      <div className="relative overflow-hidden rounded-DEFAULT bg-surface-container-low px-space-md py-3 shadow-md flex items-center justify-between gap-space-md">
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-primary/10 rounded-full blur-2xl pointer-events-none"></div>
        <div className="flex items-center gap-space-sm min-w-0">
          <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center flex-shrink-0 shadow-inner">
            <span className="material-symbols-outlined text-primary text-[18px]">auto_awesome</span>
          </div>
          <p className="font-body-md text-body-md text-on-surface truncate">This is how Recommendations works. Preview a map, try a download — when you're ready, head to your dashboard.</p>
        </div>
        <div className="flex items-center gap-space-sm flex-shrink-0">
          <span className="px-2.5 py-1 rounded-full bg-primary-container/20 text-primary font-label-sm text-label-sm uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span>Live picks
          </span>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md pt-2">
        <div className="flex flex-col gap-1 max-w-3xl">
          <div className="flex items-center gap-2 text-primary font-label-sm text-label-sm uppercase tracking-widest">
            <span>Curated for {data.user.username}</span>
            <span>•</span>
            <span className="text-tertiary">osu!{MODE_LABELS[mode].toLowerCase()}{profile.mainKeyCount ? ` ${profile.mainKeyCount}K` : ''}</span>
          </div>
          <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Picked to train your {profile.srCeiling.toFixed(1)}★ gap</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed">
            {profile.isStarter
              ? 'Starter picks — popular Ranked maps for this mode. Play a few and your profile becomes personal.'
              : `Based on your top ${profile.topPlayCount} plays — recommendations focus on ${profile.bpmSweetMin}–${profile.bpmSweetMax} BPM to push past your ${profile.ceilingAccuracy !== null ? `${profile.ceilingAccuracy.toFixed(1)}%` : ''} threshold above ${profile.srCeiling.toFixed(1)}★.`}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-space-md mt-2" id="beatmap-list">
        {busy && items.length === 0 && (
          <p className="font-body-md text-body-md text-on-surface-variant">Generating your first picks…</p>
        )}
        {!busy && items.length === 0 && (
          <p className="font-body-md text-body-md text-on-surface-variant">No picks could be generated just now — the full Recommendations page will retry with the same engine.</p>
        )}
        {items.map((c) => (
          <BeatmapRow
            key={c.beatmapsetId}
            candidate={c}
            mode={mode}
            seenKeyValue={key}
            downloaded={downloaded.includes(c.beatmapsetId)}
            onDownloaded={() => setDownloadedTick((n) => n + 1)}
            feedback={rowMaps.feedbackById.get(c.beatmapId) ?? null}
            containing={rowMaps.containingBySet.get(c.beatmapsetId) ?? []}
            onFeedbackChange={rowMaps.onFeedbackChange}
            onContainingChange={(ids) => rowMaps.onContainingChange(c.beatmapsetId, ids)}
          />
        ))}
        <span className="hidden">{downloadedTick}</span>
      </div>

      {tier !== 'account' && (
        <div className="rounded-DEFAULT bg-surface-container-low p-space-md shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-md mt-2">
          <div className="flex items-center gap-space-md">
            <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center flex-shrink-0 text-primary">
              <span className="material-symbols-outlined text-[24px]">lock_open</span>
            </div>
            <div className="flex flex-col">
              <span className="font-headline-sm text-headline-sm text-on-surface">Guest mode preview</span>
              <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">All audio previews and direct beatmap downloads are unlocked. To save maps to custom collections and submit difficulty ratings, create a free account.</p>
            </div>
          </div>
          <button className="px-space-md py-2 rounded-full bg-surface-container-high hover:bg-surface-variant text-on-surface font-label-md text-label-md transition-all flex items-center gap-1.5 flex-shrink-0" type="button" onClick={(e) => { e.stopPropagation(); navigate('/auth') }}>
            <span className="material-symbols-outlined text-[16px]">person_add</span>Create free account
          </button>
        </div>
      )}

      {/* Bottom strip: Skip finishes onboarding (§5.5) */}
      <div className="flex items-center justify-between pt-space-md mt-4">
        <button className="px-space-md py-3 rounded-full text-on-surface-variant hover:text-on-surface font-label-md text-body-lg transition-colors flex items-center gap-2" type="button" onClick={(e) => { e.stopPropagation(); finishOnboarding(navigate) }}>
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>Skip to dashboard
        </button>
        <div className="flex items-center gap-space-md">
          <span className="hidden md:inline font-label-sm text-label-sm text-on-surface-variant">Step 1 of 1 completed</span>
          <button className="inline-flex items-center justify-center gap-2 px-space-xl py-3.5 rounded-full bg-[#FF66AA] text-[#3e0021] font-headline-sm text-headline-sm shadow-[0_0_24px_rgba(255,102,170,0.45)] hover:shadow-[0_0_32px_rgba(255,102,170,0.65)] hover:bg-[#ff85bd] transition-all transform hover:-translate-y-0.5 active:translate-y-0 active:scale-95" type="button" onClick={(e) => { e.stopPropagation(); finishOnboarding(navigate) }}>
            Go to dashboard
            <span className="material-symbols-outlined text-[22px]">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default function WelcomeRecs() {
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
        <LoadingState label="Loading your recommendations…" />
      </AppShell>
    )
  }
  if ((status !== 'ready' && status !== 'empty') || !data) {
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
      <WelcomeRecsReal data={data} />
    </AppShell>
  )
}
