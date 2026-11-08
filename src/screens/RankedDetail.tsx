import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AppShell from '../components/AppShell'
import LoadingState from '../components/LoadingState'
import BeatmapRow from '../components/BeatmapRow'
import LockedButton from '../components/LockedButton'
import { isProxyConfigured } from '../lib/osu'
import { useAuth } from '../lib/auth'
import { useGuestStore } from '../lib/guestStore'
import { useSidebarIdentity } from '../lib/profileService'
import { useDownloadSettings } from '../lib/downloadSettings'
import { seenKey, seenStore } from '../lib/seenStore'
import { isGameMode, modeLabel } from '../lib/mode'
import { useCapabilities } from '../lib/capabilities'
import { useRowMaps } from '../lib/useRowMaps'
import { useDownloadQueue } from '../lib/downloadQueue'
import { scheduleBulkDownload } from '../lib/bulkDownload'
import { supabase } from '../lib/supabase'
import { saveCompilationAsList } from '../lib/rankedLists'
import { cardFromPeriod, rankedCardListName, type RankedGranularity } from '../lib/rankedCards'
import { useRankedCardCompilation } from '../lib/useRankedCard'

const GRANULARITIES: readonly RankedGranularity[] = ['week', 'month', 'year']

function isGranularity(value: string | undefined): value is RankedGranularity {
  return value !== undefined && (GRANULARITIES as readonly string[]).includes(value)
}

/**
 * One ranked period card, opened from Collections (§AN): the
 * song list for a week of the current month or a month of the
 * current year (or the rolling week). DB-first via
 * useRankedCardCompilation — a stored row renders immediately,
 * a missing/stale one compiles live and is stored. "Save as
 * list" and "Download all" live here per card.
 */
export default function RankedDetail() {
  const { mode: modeParam, granularity: granParam, period: periodParam } = useParams()
  const mode = isGameMode(modeParam) ? modeParam : null
  const granularity = isGranularity(granParam) ? granParam : null
  // The visit time is frozen in state so the memo stays pure
  // (oxlint purity rule); a past period key still resolves
  // from the key itself, not from "now".
  const [visitMs] = useState(() => Date.now())
  const card = useMemo(
    () => (granularity && periodParam ? cardFromPeriod(granularity, periodParam, visitMs) : null),
    [granularity, periodParam, visitMs],
  )

  const { tier, user } = useAuth()
  const guestSession = useGuestStore((s) => s.session)
  const { username: sidebarName, pp: sidebarPp, avatarUrl: sidebarAvatarUrl } =
    useSidebarIdentity()
  const caps = useCapabilities()
  const navigate = useNavigate()
  const noVideo = useDownloadSettings((s) => s.noVideo)
  const register = useDownloadQueue((s) => s.register)
  const [refreshSignal, setRefreshSignal] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [downloadedTick, setDownloadedTick] = useState(0)

  // A null card short-circuits the hook to the empty state, so
  // an invalid route never compiles anything.
  const load = useRankedCardCompilation(supabase, mode ?? 'mania', card, refreshSignal)

  const identity = {
    username: sidebarName ?? 'Loading…',
    pp: sidebarPp,
    avatarUrl: sidebarAvatarUrl ?? undefined,
    tierLabel: tier === 'account' ? 'account' : tier === 'guest' ? 'guest' : 'free tier',
  }
  const username = guestSession?.osuUsername ?? null
  const key = seenKey(tier, username ?? 'collections')

  void downloadedTick
  const downloaded = seenStore.load(key).downloaded
  const entries = load.compilation?.entries ?? []

  const rowMaps = useRowMaps({
    userId: user?.id,
    canRate: caps.canRate,
    canSave: caps.canSave,
    feedbackMode: mode ?? 'mania',
    beatmapsetIds: entries.map((e) => e.candidate.beatmapsetId),
  })

  useEffect(() => {
    setSaveMessage(null)
    setSaveError(null)
  }, [mode, granularity, periodParam])

  const bulkCancelRef = useRef<(() => void) | null>(null)
  const [bulkActive, setBulkActive] = useState(false)
  useEffect(
    () => () => {
      bulkCancelRef.current?.()
      bulkCancelRef.current = null
    },
    [mode, granularity, periodParam],
  )
  const downloadAll = () => {
    if (bulkActive || entries.length === 0) return
    bulkCancelRef.current?.()
    setBulkActive(true)
    bulkCancelRef.current = scheduleBulkDownload(
      entries.map((e) => ({
        beatmapsetId: e.candidate.beatmapsetId,
        artist: e.candidate.artist,
        title: e.candidate.title,
      })),
      {
        register,
        seenKeyValue: key,
        noVideo,
        onSettled: () => {
          setBulkActive(false)
          bulkCancelRef.current = null
        },
      },
    )
  }

  const saveAsList = useCallback(async () => {
    if (!user || !mode || !card || !load.compilation || saving) return
    setSaving(true)
    setSaveMessage(null)
    setSaveError(null)
    try {
      const result = await saveCompilationAsList(supabase, user.id, {
        name: rankedCardListName(mode, card),
        mode,
        entries: load.compilation.entries,
      })
      setSaveMessage(
        result.added > 0
          ? `Saved ${result.added} of ${result.total} maps to "${result.listName}"` +
              (result.alreadyHad > 0 ? ` — ${result.alreadyHad} were already in it.` : '.')
          : `All ${result.total} maps were already in "${result.listName}" — nothing new added.`,
      )
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [user, mode, card, load.compilation, saving])

  if (!isProxyConfigured) {
    return (
      <AppShell identity={identity}>
        <div className="flex flex-col w-full gap-space-lg">
          <Link to="/collections" className="font-label-md text-label-md text-primary w-fit">
            ← Collections
          </Link>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
            Ranked list
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Ranked lists load once the osu! proxy is connected (see docs/M1-SETUP.md).
          </p>
        </div>
      </AppShell>
    )
  }

  if (!mode || !granularity || !periodParam || !card) {
    return (
      <AppShell identity={identity}>
        <div className="flex flex-col w-full gap-space-lg">
          <Link to="/collections" className="font-label-md text-label-md text-primary w-fit">
            ← Collections
          </Link>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
            Ranked list not found
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            There is no ranked list for that period — the link may be from an older month, or
            mistyped.
          </p>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell identity={identity}>
      <div className="flex flex-col w-full gap-space-lg">
        <Link to="/collections" className="font-label-md text-label-md text-primary w-fit">
          ← Collections
        </Link>
        <div className="flex flex-col gap-space-xs">
          <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm uppercase tracking-widest">
            <span>Ranked Lists</span>
            <span className="text-outline-variant">•</span>
            <span>{card.label}</span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
            {rankedCardListName(mode, card)}
          </h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            The most-played {modeLabel(mode)} maps ranked {card.label.toLowerCase()} — compiled
            from osu! search and stored in the database, so a second visit loads instantly.
            {load.stale ? ' Showing the stored list while it updates in the background.' : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-space-md">
          <button
            className="flex items-center gap-1.5 px-space-md py-2 rounded-full bg-surface-container-high text-on-surface font-label-md text-label-md hover:bg-surface-container-highest transition-all disabled:opacity-60"
            type="button"
            disabled={load.loading}
            onClick={() => setRefreshSignal((n) => n + 1)}
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            <span>Refresh</span>
          </button>
          <LockedButton
            allowed={caps.canSave}
            lockedTitle="Create a free account to save lists"
            onLocked={() => navigate('/auth')}
            onClick={() => void saveAsList()}
            className="flex items-center gap-1.5 px-space-md py-2 rounded-full bg-primary text-on-primary font-label-md text-label-md shadow-md hover:bg-primary-container hover:text-on-primary-container active:scale-95 transition-all disabled:opacity-60"
            aria-label="Save this ranked list as one of my lists"
          >
            <span className="material-symbols-outlined text-[18px]">bookmark_add</span>
            <span>{saving ? 'Saving…' : 'Save as list'}</span>
          </LockedButton>
          <button
            className="flex items-center gap-1.5 px-space-md py-2 rounded-full bg-surface-container-high text-on-surface font-label-md text-label-md hover:bg-surface-container-highest transition-all disabled:opacity-60"
            type="button"
            disabled={load.loading || bulkActive || entries.length === 0}
            onClick={downloadAll}
            aria-label={`Download all ${entries.length} ranked maps`}
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            <span>{bulkActive ? 'Queuing downloads…' : `Download all (${entries.length})`}</span>
          </button>
        </div>

        {saveMessage && (
          <p className="font-body-sm text-body-sm text-on-surface" role="status">
            {saveMessage}
          </p>
        )}
        {saveError && (
          <p className="font-body-sm text-body-sm text-error" role="alert">
            {saveError}
          </p>
        )}

        {load.loading && !load.compilation && (
          <LoadingState label={`Compiling the top 50 Ranked ${modeLabel(mode)} maps…`} />
        )}
        {load.error && !load.loading && (
          <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
            <p className="font-body-sm text-body-sm text-error">{load.error}</p>
            <button
              className="px-space-md py-2 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md flex-shrink-0"
              type="button"
              onClick={() => setRefreshSignal((n) => n + 1)}
            >
              Retry
            </button>
          </div>
        )}
        {!load.loading && !load.error && load.compilation && load.compilation.entries.length === 0 && (
          <div className="p-space-md rounded-lg bg-surface-container-low">
            <p className="font-body-md text-body-md text-on-surface-variant">
              No maps were ranked in this period for {modeLabel(mode)} yet.
            </p>
          </div>
        )}
        {!load.loading && !load.error && load.compilation && load.compilation.partial && entries.length > 0 && (
          <div className="p-space-md rounded-lg bg-surface-container-low">
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Partial list — the scan stopped early before reaching the start of this period, so
              this may not be the full top 50. Refresh to try the full scan again.
            </p>
          </div>
        )}
        {!load.loading && !load.error && entries.length > 0 && (
          <div className="flex flex-col gap-3">
            {entries.map((entry) => (
              <BeatmapRow
                key={entry.candidate.beatmapsetId}
                candidate={entry.candidate}
                mode={mode}
                seenKeyValue={key}
                downloaded={downloaded.includes(entry.candidate.beatmapsetId)}
                onDownloaded={() => setDownloadedTick((n) => n + 1)}
                rank={entry.rank}
                feedback={rowMaps.feedbackById.get(entry.candidate.beatmapId) ?? null}
                containing={rowMaps.containingBySet.get(entry.candidate.beatmapsetId) ?? []}
                onFeedbackChange={rowMaps.onFeedbackChange}
                onContainingChange={(ids) =>
                  rowMaps.onContainingChange(entry.candidate.beatmapsetId, ids)
                }
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
