// Converted from Stitch export: stitch-raw/08b-recommendations-unlimited.html
// M3 (§13): the real variant below is the unlimited feed: windowed
// re-ranking over a cursor-paginated pool, seen-set dedupe, honest
// end card.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AppShell from '../components/AppShell'
import BeatmapRow from '../components/BeatmapRow'
import LoadErrorPanel from '../components/LoadErrorPanel'
import LoadingState from '../components/LoadingState'
import RecFiltersPanel from '../components/RecFiltersPanel'
import { seedPlayedSets, useProfileData, type ProfileData } from '../lib/profileService'
import { useModeStore } from '../lib/modeStore'
import { MODE_LABELS } from '../lib/mode'
import {
  applyDownloadedVisibility,
  defaultFiltersFor,
  FeedSession,
  mostUsedEssentialTags,
  shouldTopUpFeed,
  type RecCandidate,
  type RecFilters,
} from '../lib/recommend'
import BackToTop from '../components/BackToTop'
import { seenKey, seenStore, useSeenVersion, type SeenState } from '../lib/seenStore'
import { supabase } from '../lib/supabase'
import { loadModeBoostFor } from '../lib/feedback'
import { useCapabilities } from '../lib/capabilities'
import { useRowMaps } from '../lib/useRowMaps'
import { useAuth } from '../lib/auth'

// ---------------------------------------------------------------------------
// Real variant (M3, §13): Unlimited — unlimited feed, ordered as it loads.
// ---------------------------------------------------------------------------

const PAGE_TAKE = 20

/**
 * The unlimited feed, usable standalone (via the default export's gate)
 * or embedded in the Recommendations page's Batches/Unlimited switch
 * (batch 5, item B). Filters/draft are lifted state owned by the
 * parent, so both views share the same mode + filters: changing
 * filters or mode restarts the feed session, as before.
 */
export function FeedReal({
  data,
  filters,
  draft,
  onFiltersChange,
  onDraftChange,
  active = true,
  renderBackToTop = true,
}: {
  data: ProfileData
  filters: RecFilters
  draft: RecFilters
  onFiltersChange: (next: RecFilters) => void
  onDraftChange: (next: RecFilters) => void
  /**
   * Keep-place (§AE): the Recommendations gate keeps this view
   * mounted while Batches is shown. `active` is false while
   * hidden — the session effect must not restart the feed
   * until the view is visible again. Defaults true: the
   * standalone gate renders it as the only view.
   */
  active?: boolean
  /**
   * The Recommendations gate renders one shared BackToTop for
   * both views and passes false here; standalone rendering
   * keeps the default true.
   */
  renderBackToTop?: boolean
}) {
  const mode = useModeStore((s) => s.mode)
  const { tier, user } = useAuth()
  const caps = useCapabilities()
  const profile = data.skillProfile
  const key = seenKey(tier, data.user.username)
  const [items, setItems] = useState<RecCandidate[]>([])
  // Batched row state (batch 11, part 5) — see RecommendationsReal.
  const rowMaps = useRowMaps({
    userId: user?.id,
    canRate: caps.canRate,
    canSave: caps.canSave,
    feedbackMode: mode,
    beatmapsetIds: items.map((c) => c.beatmapsetId),
  })
  const [totalMatched, setTotalMatched] = useState<number | null>(null)
  const [feedStats, setFeedStats] = useState({ examined: 0, produced: 0 })
  const [ended, setEnded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [restarted, setRestarted] = useState(false)
  const sessionRef = useRef<FeedSession | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const loadingRef = useRef(false)
  // Top-up bookkeeping (§AE): consecutive top-up-triggered refills,
  // reset whenever the visible list grows or a session restarts.
  const topUpCountRef = useRef(0)
  const prevVisibleCountRef = useRef(0)

  useEffect(() => {
    seedPlayedSets(key, data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, data.user.id, mode])

  const startSession = useCallback(
    async (
      nextFilters: RecFilters,
      seenOverride?: SeenState,
      opts: { fresh?: boolean } = {},
    ) => {
      const seen = seenOverride ?? seenStore.load(key)
      // M5 learning: the mode's own ratings re-weight this feed
      // session. Best-effort — a failed load means no boost.
      const boostFor = await loadModeBoostFor(supabase, user?.id ?? null, mode)
      const session = new FeedSession(profile, mode, nextFilters, seen, key, (k, ids) =>
        seenStore.markMany(k, 'served', ids),
      { fresh: opts.fresh, boostFor },
      )
      sessionRef.current = session
      topUpCountRef.current = 0
      setItems([])
      setEnded(false)
      setError(null)
      loadingRef.current = true
      setLoading(true)
      try {
        const first = await session.take(PAGE_TAKE)
        setItems(first)
        setTotalMatched(session.totalMatched)
        setFeedStats({ examined: session.examinedSets, produced: session.producedCandidates })
        setEnded(session.exhausted && session.bufferedCount === 0)
      } catch {
        setError('The feed could not load just now — osu! or the proxy may be busy.')
      } finally {
        loadingRef.current = false
        setLoading(false)
      }
    },
    [key, mode, profile, user?.id],
  )

  // New session whenever profile/mode changes (§13.2.3). On first
  // mount the shared filters are adopted as-is (they may already
  // carry the user's choices from the Batches view) — only a real
  // profile/mode change resets them to the profile defaults.
  // Keep-place (§AE): while hidden, the effect must NOT run — the
  // signature ref is left untouched, so returning to the view
  // re-runs the effect and starts a session under the current
  // profile/mode instead of showing stale rows.
  const feedSigRef = useRef<string | null>(null)
  useEffect(() => {
    if (!active) return
    const sig = `${data.user.id}:${mode}:${profile.pp}:${profile.comfortSrMin}:${profile.comfortSrMax}`
    if (feedSigRef.current === sig) return
    const firstMount = feedSigRef.current === null
    feedSigRef.current = sig
    const start = firstMount ? filters : defaultFiltersFor(profile)
    if (!firstMount) {
      onFiltersChange(start)
      onDraftChange(start)
    }
    setRestarted(false)
    void startSession(start)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, mode, active])

  const loadMore = useCallback(async () => {
    const session = sessionRef.current
    if (!session || loadingRef.current || session.exhausted) return
    loadingRef.current = true
    setLoading(true)
    try {
      const more = await session.take(10)
      if (more.length > 0) setItems((prev) => [...prev, ...more])
      setTotalMatched(session.totalMatched)
      setFeedStats({ examined: session.examinedSets, produced: session.producedCandidates })
      setEnded(session.exhausted && session.bufferedCount === 0)
    } catch {
      setError('A feed refill failed — scroll again to retry.')
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [])

  // Prefetch on scroll: refill when the sentinel nears the viewport.
  // The margin (§AE: 600px → 1200px) starts the next window before
  // the user reaches the bottom, so scrolling never stalls on a
  // load. The loading guard lives in loadMore.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore()
      },
      { rootMargin: '1200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore, items.length])

  const handleSkip = (c: RecCandidate) => {
    seenStore.mark(key, 'skipped', c.beatmapsetId)
    setItems((prev) => prev.filter((item) => item.beatmapsetId !== c.beatmapsetId))
    // Top the feed back up from the pool (§13.2.6: skips affect the
    // next refill, never reshuffle what is on screen).
    void loadMore()
  }

  const applyFilters = () => {
    onFiltersChange(draft)
    setRestarted(true)
    void startSession(draft)
  }

  const loosenFilters = () => {
    const looser: RecFilters = {
      ...filters,
      srMin: Math.max(0, filters.srMin - 0.5),
      srMax: filters.srMax + 1,
      userTag: null,
      keyCount: null,
    }
    onFiltersChange(looser)
    onDraftChange(looser)
    setRestarted(true)
    void startSession(looser)
  }

  const startOver = () => {
    const seen = seenStore.load(key)
    void startSession(filters, { ...seen, served: [], skipped: [] }, { fresh: true })
  }

  // Live downloaded state: same shared signal as the Generated
  // list — a download in either view re-renders this one, so
  // `downloaded` below is never a stale snapshot.
  const seenVersion = useSeenVersion()
  const downloaded = useMemo(
    () => seenStore.load(key).downloaded,
    [key, seenVersion],
  )
  // Show-downloaded toggle (§AE), default OFF — same control and
  // same scope as Batches: when ON, downloaded sets show again
  // with their downloaded state; only the downloaded rule is
  // overridden. Local state, not persisted.
  const [showDownloaded, setShowDownloaded] = useState(false)
  // Hide downloaded maps from the rendered rows (same rule as
  // Generated: reappear when everything loaded so far is
  // downloaded). The engine's fetch-time exclusion is untouched;
  // this only filters rows already served into `items`, so it
  // re-evaluates live as downloads land and refills arrive. The
  // chip allowlist is computed from the VISIBLE rows.
  const { visible: visibleItems, showingDownloadedFallback } = useMemo(
    () => applyDownloadedVisibility(items, downloaded, { showDownloaded }),
    [items, downloaded, showDownloaded],
  )
  // Top-up (§AE): when hiding leaves fewer than the threshold
  // visible, fetch the next window without waiting for the
  // scroll sentinel. Capped (see shouldTopUpFeed) so an
  // all-downloaded remainder cannot loop forever; the fallback
  // note, not another fetch, is the end state then. The counter
  // resets whenever the visible list grows — a refill that
  // produced visible rows earned its keep.
  useEffect(() => {
    if (visibleItems.length > prevVisibleCountRef.current) topUpCountRef.current = 0
    prevVisibleCountRef.current = visibleItems.length
  }, [visibleItems.length])
  useEffect(() => {
    if (
      active &&
      shouldTopUpFeed({
        visibleCount: visibleItems.length,
        totalCount: items.length,
        ended,
        loading,
        showingFallback: showingDownloadedFallback,
        consecutiveTopUps: topUpCountRef.current,
      })
    ) {
      topUpCountRef.current += 1
      void loadMore()
    }
  }, [visibleItems.length, items.length, ended, loading, showingDownloadedFallback, loadMore, active])
  // Row chips: same top-7 narrowing as the Generated list — the
  // set recomputes as the feed grows.
  const tagAllowlist = useMemo(() => mostUsedEssentialTags(visibleItems), [visibleItems])

  return (
    <div className="flex flex-col w-full">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg pb-space-lg">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-space-sm">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container text-primary font-label-sm text-label-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>Unlimited mode
            </span>
            <span className="text-on-surface-variant font-label-sm text-label-sm">• Unlimited beatmaps for {MODE_LABELS[mode]}</span>
          </div>
          <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Recommendations</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {profile.isStarter
              ? 'Starter picks — popular Ranked maps for this mode until your profile is personal.'
              : 'Unlimited beatmaps ordered for you as they load — scored from the window ahead of your scroll, never a claimed global ranking.'}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start mt-space-sm">
        <RecFiltersPanel
          draft={draft}
          onDraftChange={onDraftChange}
          onApply={applyFilters}
          profile={profile}
          mode={mode}
          appliedCount={null}
        />
        <main className="lg:col-span-8 xl:col-span-9 flex flex-col gap-space-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-space-xs py-1">
            <div className="flex items-center gap-space-sm flex-wrap">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Training your {profile.srCeiling.toFixed(1)}★ gap — Unlimited stream</h2>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary-container/20 text-primary font-label-sm text-[10px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                {totalMatched !== null ? `~${totalMatched.toLocaleString('en-US')} maps match your filters` : 'Live stream • counting matches…'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-on-surface-variant font-label-sm text-label-sm">
              <button
                type="button"
                aria-pressed={showDownloaded}
                onClick={() => setShowDownloaded((v) => !v)}
                title={showDownloaded ? 'Hide downloaded beatmaps again' : 'Show downloaded beatmaps again'}
                className={showDownloaded
                  ? 'px-2.5 py-1 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm flex items-center gap-1 transition-colors'
                  : 'px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm flex items-center gap-1 hover:text-on-surface transition-colors'}
              >
                <span className="material-symbols-outlined text-[16px]">{showDownloaded ? 'visibility' : 'visibility_off'}</span>
                Show downloaded
              </button>
              <span>Sorted by:</span>
              <span className="text-primary font-medium flex items-center gap-0.5 cursor-pointer hover:underline">pp training weight
                <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
              </span>
            </div>
          </div>

          {restarted && (
            <p className="font-body-sm text-body-sm text-tertiary px-space-xs">Filters changed — feed restarted.</p>
          )}
          {error && (
            <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
              <p className="font-body-sm text-body-sm text-error">{error}</p>
              <div className="flex items-center gap-space-sm flex-shrink-0">
                <button className="px-space-md py-2 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md" type="button" onClick={() => void startSession(filters, undefined, { fresh: true })}>Retry</button>
              </div>
            </div>
          )}

          {showingDownloadedFallback && (
            <p className="font-body-sm text-body-sm text-on-surface-variant px-space-xs">
              Everything loaded so far is already downloaded — showing downloaded maps again.
            </p>
          )}
          {visibleItems.map((c) => (
            <BeatmapRow
              key={c.beatmapsetId}
              candidate={c}
              mode={mode}
              seenKeyValue={key}
              tagAllowlist={tagAllowlist}
              downloaded={downloaded.includes(c.beatmapsetId)}
              onSkip={() => handleSkip(c)}
              feedback={rowMaps.feedbackById.get(c.beatmapId) ?? null}
              containing={rowMaps.containingBySet.get(c.beatmapsetId) ?? []}
              onFeedbackChange={rowMaps.onFeedbackChange}
              onContainingChange={(ids) => rowMaps.onContainingChange(c.beatmapsetId, ids)}
              downloadPrimary="auto"
              mods={filters.mods}
            />
          ))}

          {loading && (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-lg bg-surface-container-low p-space-md animate-pulse" aria-hidden="true">
                  <div className="flex items-center gap-space-md">
                    <div className="w-14 h-14 rounded-full bg-surface-container-highest"></div>
                    <div className="flex flex-col gap-2 flex-1">
                      <div className="h-4 w-1/2 rounded bg-surface-container-highest"></div>
                      <div className="h-3 w-1/3 rounded bg-surface-container-highest"></div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          <div ref={sentinelRef} className="h-2"></div>

          {ended && !loading && (
            <div className="p-space-lg rounded-lg bg-surface-container-low flex flex-col items-center gap-space-md text-center">
              <span className="material-symbols-outlined text-primary text-[28px]">flag</span>
              <p className="font-headline-sm text-headline-sm text-on-surface">That's everything matching these filters</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant max-w-md">
                {items.length === 0
                  ? feedStats.examined === 0
                    ? 'osu! search returned no beatmapsets for this SR/BPM window at all — the pool was empty upstream, not filtered out here. Retry, or loosen the SR range.'
                    : feedStats.produced === 0
                      ? `${feedStats.examined} ${feedStats.examined === 1 ? 'set' : 'sets'} came back from osu! search, but none survived the SR/BPM/length/status/key-count filters. Loosen the filters for more maps.`
                      : 'The maps that matched were all already served, downloaded, or skipped. Start over to see seen maps again, or loosen the filters for fresh ones.'
                  : 'The Unlimited feed is honest: the pool ran out. Loosen the filters for more maps, or start over and see the ones you skipped again.'}
              </p>
              <div className="flex items-center gap-space-sm">
                <button className="px-space-md py-2.5 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md" type="button" onClick={loosenFilters}>Loosen filters</button>
                <button className="px-space-md py-2.5 rounded-full bg-surface-container-high text-on-surface font-label-md text-label-md" type="button" onClick={startOver}>Start over (show seen maps again)</button>
              </div>
            </div>
          )}
        </main>
      </div>
      {renderBackToTop && <BackToTop />}
    </div>
  )
}

export default function RecommendationsUnlimited() {
  const mode = useModeStore((s) => s.mode)
  const { tier } = useAuth()
  const { status, data, error, identity, refresh } = useProfileData(mode)
  // Standalone gate owns the filter state FeedReal needs (the
  // Recommendations page owns it itself when embedding the feed).
  const [filtersState, setFiltersState] = useState<RecFilters | null>(null)
  const [draftState, setDraftState] = useState<RecFilters | null>(null)

  if (status === 'loading') {
    return (
      <AppShell identity={{ username: identity?.username ?? 'Loading…', pp: null, tierLabel: tier === 'account' ? 'account' : tier === 'guest' ? 'guest' : 'free tier' }}>
        <LoadingState label="Loading your profile before starting the feed…" />
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
      <FeedReal
        data={data}
        filters={filtersState ?? defaultFiltersFor(data.skillProfile)}
        draft={draftState ?? filtersState ?? defaultFiltersFor(data.skillProfile)}
        onFiltersChange={setFiltersState}
        onDraftChange={setDraftState}
      />
    </AppShell>
  )
}
