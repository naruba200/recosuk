// Converted from Stitch export: stitch-raw/11-history.html
import { useEffect, useMemo, useState } from 'react'
import AppShell from '../components/AppShell'
import LockedPage from '../components/LockedPage'
import { useAuth } from '../lib/auth'
import { useSidebarIdentity } from '../lib/profileService'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { MODE_ACCENTS, useModeStore } from '../lib/modeStore'
import DownloadButton from '../components/DownloadButton'
import { GAME_MODES, modeLabel, type GameMode } from '../lib/mode'
import {
  deleteFeedback,
  loadAllFeedback,
  upsertFeedback,
  type FeedbackEntry,
  type FeedbackStatus,
} from '../lib/feedback'
import {
  fetchBeatmapsetSummary,
  type BeatmapsetSummary,
} from '../lib/beatmapsets'
import {
  seenKey,
  seenStore,
  takeRecentDownloaded,
  useSeenVersion,
} from '../lib/seenStore'

/** Cap on rendered download rows: the store is id-only, so each
 * row costs one (cached) beatmapset lookup. */
const DOWNLOAD_HISTORY_LIMIT = 50
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

interface HistoryRow {
  entry: FeedbackEntry
  summary: BeatmapsetSummary | null
}

function HistoryReal({ userId, username }: { userId: string; username: string | null }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const globalMode = useModeStore((s) => s.mode)
  const [modeFilter, setModeFilter] = useState<GameMode | 'all'>('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  // Downloaded section (§AE): the seen store's `downloaded` list
  // for this account's key is the same source of truth the
  // recommendation hiding uses — ids only, newest first, capped.
  // Titles come from the same cached beatmapset lookup the
  // feedback rows use; an id that cannot be resolved shows the
  // honest `Beatmapset #id` fallback, never an invented title.
  // Limits, stated in the section footnote: per-browser and per
  // tier+username key — guest downloads live under the guest key
  // and do not carry into this account view.
  const seenVersion = useSeenVersion()
  const downloadKey = username ? seenKey('account', username) : null
  const downloadIds = useMemo(
    () => (downloadKey ? seenStore.load(downloadKey).downloaded : []),
    [downloadKey, seenVersion],
  )
  const { ids: recentDownloadIds, total: totalDownloads } = useMemo(
    () => takeRecentDownloaded(downloadIds, DOWNLOAD_HISTORY_LIMIT),
    [downloadIds],
  )
  const [downloadSummaries, setDownloadSummaries] = useState<
    Record<number, BeatmapsetSummary | null>
  >({})
  useEffect(() => {
    if (recentDownloadIds.length === 0) return
    let live = true
    Promise.all(recentDownloadIds.map((id) => fetchBeatmapsetSummary(id)))
      .then((summaries) => {
        if (!live) return
        setDownloadSummaries((prev) => {
          const next = { ...prev }
          summaries.forEach((s, i) => {
            next[recentDownloadIds[i]] = s
          })
          return next
        })
      })
      .catch(() => {
        // Summaries stay absent → id-fallback rows. A failed
        // lookup must never block the downloads list itself.
      })
    return () => {
      live = false
    }
  }, [recentDownloadIds])

  useEffect(() => {
    let live = true
    setError(null)
    loadAllFeedback(supabase, userId)
      .then(async (entries) => {
        const enriched = await Promise.all(
          entries.map(async (entry): Promise<HistoryRow> => {
            const summary =
              entry.beatmapset_id !== null
                ? await fetchBeatmapsetSummary(entry.beatmapset_id, {
                    mode: entry.mode ?? undefined,
                    beatmapId: entry.beatmap_id,
                  })
                : null
            return { entry, summary }
          }),
        )
        if (live) setRows(enriched)
      })
      .catch((err) => {
        if (live) setError(errorMessage(err))
      })
    return () => {
      live = false
    }
  }, [userId])

  const save = async (row: HistoryRow, next: { rating: number | null; status: FeedbackStatus }) => {
    const key = row.entry.id ?? String(row.entry.beatmap_id)
    setBusyId(key)
    setRowError(null)
    try {
      const updated = await upsertFeedback(supabase, userId, {
        beatmapId: row.entry.beatmap_id,
        beatmapsetId: row.entry.beatmapset_id ?? 0,
        mode: row.entry.mode,
        status: next.status,
        rating: next.rating,
      })
      setRows((prev) =>
        prev?.map((r) => (r.entry.beatmap_id === row.entry.beatmap_id ? { ...r, entry: updated } : r)) ?? null,
      )
    } catch (err) {
      setRowError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (row: HistoryRow) => {
    const key = row.entry.id ?? String(row.entry.beatmap_id)
    setBusyId(key)
    setRowError(null)
    try {
      await deleteFeedback(supabase, userId, row.entry.beatmap_id)
      setRows((prev) => prev?.filter((r) => r.entry.beatmap_id !== row.entry.beatmap_id) ?? null)
    } catch (err) {
      setRowError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const visible = (rows ?? []).filter((r) => modeFilter === 'all' || r.entry.mode === modeFilter)
  const triedCount = (rows ?? []).filter((r) => r.entry.status === 'tried').length
  const ratedCount = (rows ?? []).filter((r) => r.entry.rating !== null).length
  const skippedCount = (rows ?? []).filter((r) => r.entry.status === 'skipped').length
  const anySummaryMissing = visible.some((r) => r.summary === null)

  return (
    <div className="flex flex-col w-full">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-lg mb-space-lg">
        <div className="flex flex-col gap-space-xs max-w-3xl">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-primary font-label-sm text-label-sm tracking-wider uppercase">
              Adaptive Training Log
            </span>
          </div>
          <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Tried and rated</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Track played recommendation outcomes and view how your feedback calibrates future
            algorithmic drills — per mode.
          </p>
        </div>
      </div>

      {error && (
        <p className="mb-space-md font-body-sm text-body-sm text-error" role="alert">
          {error}
        </p>
      )}

      {rows === null && !error && (
        <p className="font-body-md text-body-md text-on-surface-variant">Loading your history…</p>
      )}

      {rows !== null && (
        <>
          <div className="w-full bg-surface-container-low p-space-md rounded-DEFAULT shadow-md mb-space-lg">
            <div className="flex flex-wrap items-center gap-space-lg font-label-md text-label-md text-on-surface-variant">
              <span>
                <strong className="text-on-surface">{triedCount}</strong> tried
              </span>
              <span>
                <strong className="text-on-surface">{ratedCount}</strong> rated
              </span>
              <span>
                <strong className="text-on-surface">{skippedCount}</strong> skipped
              </span>
              <span className="text-[11px]">Ratings re-weight your next run in the same mode only.</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-space-md">
            <button
              className={`px-3 py-1.5 rounded-full font-label-md text-label-md ${modeFilter === 'all' ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container text-on-surface-variant'}`}
              type="button"
              onClick={() => setModeFilter('all')}
            >
              All modes
            </button>
            {GAME_MODES.map((m) => (
              <button
                key={m}
                className={`px-3 py-1.5 rounded-full font-label-md text-label-md flex items-center gap-1.5 ${modeFilter === m ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container text-on-surface-variant'}`}
                type="button"
                onClick={() => setModeFilter(m)}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: MODE_ACCENTS[m] }} />
                {modeLabel(m)}
              </button>
            ))}
          </div>

          {rowError && (
            <p className="mb-space-sm font-body-sm text-body-sm text-error" role="alert">
              {rowError}
            </p>
          )}

          {visible.length === 0 && (
            <div className="p-space-lg rounded-DEFAULT bg-surface-container-low">
              <p className="font-body-md text-body-md text-on-surface-variant">
                {rows.length === 0
                  ? 'No tried or rated maps yet. Rate maps from any recommendation or Beatmaps card with the star button — your ratings re-weight the next run in that mode.'
                  : 'Nothing in this mode yet. Switch the filter or rate a map in this mode.'}
              </p>
            </div>
          )}

          {anySummaryMissing && visible.length > 0 && (
            <p className="mb-space-sm font-body-sm text-body-sm text-on-surface-variant">
              Some map details could not be loaded — the proxy may need a redeploy for the beatmap
              lookup. Your ratings themselves are intact.
            </p>
          )}

          <div className="flex flex-col gap-space-sm">
            {visible.map((row) => {
              const key = row.entry.id ?? String(row.entry.beatmap_id)
              const busy = busyId === key
              const rating = row.entry.rating
              return (
                <div
                  key={key}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-space-md rounded-DEFAULT bg-surface-container"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 bg-surface-container-highest">
                      {row.summary?.cover ? (
                        <img className="w-full h-full object-cover" alt="" src={row.summary.cover} loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="material-symbols-outlined text-on-surface-variant">music_note</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-label-md text-label-md text-on-surface truncate">
                        {row.summary ? row.summary.title : `Beatmapset #${row.entry.beatmapset_id ?? row.entry.beatmap_id}`}
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant truncate">
                        {row.summary ? `by ${row.summary.artist}` : 'Details unavailable'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {row.entry.mode && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface font-label-sm text-[11px]">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: MODE_ACCENTS[row.entry.mode] }} />
                        {modeLabel(row.entry.mode)}
                      </span>
                    )}
                    <span
                      className={`px-2 py-0.5 rounded-full font-label-sm text-[11px] ${row.entry.status === 'tried' ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-highest text-on-surface-variant'}`}
                    >
                      {row.entry.status}
                    </span>
                    <div className="flex items-center gap-0.5 text-[#FFCC22]">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          className="p-0.5 hover:scale-110 transition-transform disabled:opacity-60"
                          type="button"
                          aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
                          title={`${n} star${n > 1 ? 's' : ''} (click the current rating to clear it)`}
                          disabled={busy}
                          onClick={() =>
                            void save(row, { rating: rating === n ? null : n, status: 'tried' })
                          }
                        >
                          <span
                            className="material-symbols-outlined text-[20px]"
                            style={rating !== null && n <= rating ? { fontVariationSettings: "'FILL' 1" } : undefined}
                          >
                            star
                          </span>
                        </button>
                      ))}
                    </div>
                    <button
                      className={`px-2.5 py-1 rounded-full font-label-sm text-label-sm ${row.entry.status === 'skipped' ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-highest text-on-surface-variant'}`}
                      type="button"
                      disabled={busy}
                      onClick={() => void save(row, { rating, status: row.entry.status === 'skipped' ? 'tried' : 'skipped' })}
                    >
                      {row.entry.status === 'skipped' ? 'Mark tried' : 'Mark skipped'}
                    </button>
                    <button
                      className="w-8 h-8 rounded-full hover:bg-surface-container-high text-on-surface-variant hover:text-error flex items-center justify-center disabled:opacity-60"
                      type="button"
                      aria-label="Remove from history"
                      title="Remove this entry"
                      disabled={busy}
                      onClick={() => void remove(row)}
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {downloadKey && (
        <section className="mt-space-lg" aria-label="Downloaded beatmaps">
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-space-xs">Downloaded</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-sm">
            {totalDownloads === 0
              ? 'No downloads recorded in this browser yet.'
              : `Showing the ${recentDownloadIds.length} most recent of ${totalDownloads} downloaded beatmapsets.`}
          </p>
          {recentDownloadIds.length > 0 && (
            <div className="flex flex-col gap-space-sm">
              {recentDownloadIds.map((id) => {
                const summary = downloadSummaries[id] ?? null
                return (
                  <div
                    key={id}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 p-space-md rounded-DEFAULT bg-surface-container"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 bg-surface-container-highest">
                        {summary?.cover ? (
                          <img className="w-full h-full object-cover" alt="" src={summary.cover} loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="material-symbols-outlined text-on-surface-variant">music_note</span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-label-md text-label-md text-on-surface truncate">
                          {summary ? summary.title : `Beatmapset #${id}`}
                        </span>
                        <span className="font-label-sm text-label-sm text-on-surface-variant truncate">
                          {summary ? `by ${summary.artist}` : 'Details unavailable'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-label-sm text-[11px]">
                        Downloaded
                      </span>
                      {/* §AQ item 11: redownload from the same
                          flow as every other screen — the button
                          knows the set is already downloaded, so
                          it offers "Download again". */}
                      <DownloadButton
                        beatmapsetId={id}
                        artist={summary?.artist ?? 'Unknown artist'}
                        title={summary ? summary.title : `Beatmapset #${id}`}
                        mode={globalMode}
                        seenKeyValue={downloadKey}
                        downloaded
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-sm">
            Download history is stored locally in this browser, under this account&apos;s key —
            it doesn&apos;t follow you to other browsers, and guest downloads stay separate.
          </p>
        </section>
      )}
    </div>
  )
}

export default function History() {
  const { user, tier } = useAuth()
  const { username: sidebarName, pp: sidebarPp, avatarUrl: sidebarAvatarUrl } =
    useSidebarIdentity()
  const pageIdentity = {
    username: sidebarName ?? 'Loading…',
    pp: sidebarPp,
    avatarUrl: sidebarAvatarUrl ?? undefined,
    tierLabel: tier === 'account' ? 'account' : tier === 'guest' ? 'guest' : 'free tier',
  }
  const isReal = tier === 'account' && !!user && isSupabaseConfigured
  return (
    <AppShell identity={pageIdentity}>
      {isReal && user ? (
        <HistoryReal userId={user.id} username={sidebarName} />
      ) : (
        <LockedPage
          title="History"
          description="Your tried and rated maps are tracked on your RecOsuk account. Create a free account to keep your history."
        />
      )}
    </AppShell>
  )
}
