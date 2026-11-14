// Converted from Stitch export: stitch-raw/08-recommendations.html
// M3: the real variant below runs the windowed recommendation engine
// (see lib/recommend.ts for the ranking-honesty notes) with working
// filters, previews and downloads.
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
  applySeenVisibility,
  clearRecTag,
  defaultFiltersFor,
  emptyGenerationResume,
  emptyPoolReason,
  generateUnseenWindow,
  mostUsedEssentialTags,
  widenRecFilters,
  type GenerationDiagnostics,
  type GenerationResume,
  type RecCandidate,
  type RecFilters,
} from '../lib/recommend'
import { rateLimitMessage } from '../lib/osu'
import { FeedReal } from './RecommendationsUnlimited'
import BackToTop from '../components/BackToTop'
import { seenKey, seenStore, useSeenVersion } from '../lib/seenStore'
import { supabase } from '../lib/supabase'
import { loadModeBoostFor } from '../lib/feedback'
import { useCapabilities } from '../lib/capabilities'
import { useRowMaps } from '../lib/useRowMaps'
import { listLoadingState } from '../lib/listLoadingState'
import { useAuth } from '../lib/auth'

// ---------------------------------------------------------------------------
// Real variant (M3): Generated mode — fixed top-N from the windowed pool.
// ---------------------------------------------------------------------------

export function RecommendationsReal({
  data,
  filters,
  draft,
  onFiltersChange,
  onDraftChange,
  resumeRef,
  active,
}: {
  data: ProfileData
  filters: RecFilters
  draft: RecFilters
  onFiltersChange: (next: RecFilters) => void
  onDraftChange: (next: RecFilters) => void
  /** Resume state owned by the page gate, so switching to the
   * Unlimited view and back does not restart the Generated window. */
  resumeRef: { current: { sig: string; resume: GenerationResume } | null }
  /**
   * Keep-place (§AE): the gate keeps this view mounted while the
   * Unlimited view is shown. `active` is false while hidden —
   * the auto-generate effect must not run (or re-adopt filters)
   * until the view is visible again.
   */
  active: boolean
}) {
  const mode = useModeStore((s) => s.mode)
  const { tier, user } = useAuth()
  const caps = useCapabilities()
  const profile = data.skillProfile
  const key = seenKey(tier, data.user.username)
  const [count, setCount] = useState(30)
  const [items, setItems] = useState<RecCandidate[]>([])
  // Batched row state (batch 11, part 5): one feedback query for
  // the mode + one batched containment lookup for the rendered
  // sets, passed down to the rows — rows never query per row.
  const rowMaps = useRowMaps({
    userId: user?.id,
    canRate: caps.canRate,
    canSave: caps.canSave,
    feedbackMode: mode,
    beatmapsetIds: items.map((c) => c.beatmapsetId),
  })
  const [totalMatched, setTotalMatched] = useState<number | null>(null)
  const [diagnostics, setDiagnostics] = useState<GenerationDiagnostics | null>(null)
  const [busy, setBusy] = useState(false)
  // Batch AM: true only while a Renew-initiated run is in flight —
  // the Renew handler clears the stale batch at press time, so the
  // list area shows the spinner instead of the old maps.
  const [renewing, setRenewing] = useState(false)
  // Batch AM: the batch displayed before a Renew press, kept so a
  // failed Renew restores it instead of blanking the page. Written
  // by the Renew handler only; cleared when the run settles.
  const preRenewItemsRef = useRef<RecCandidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const runRef = useRef(0)
  // Snapshot of the served set BEFORE the currently displayed
  // window was generated (written when a generate press commits,
  // never while a fetch is in flight — otherwise the displayed
  // rows would hide themselves mid-fetch). Items in the snapshot
  // appeared in an earlier generation and hide; the displayed
  // window's own items are exempt because they were not served
  // when the snapshot was taken. A fresh mount starts empty;
  // the first generate captures the live store state.
  const servedBeforeRef = useRef<ReadonlySet<number>>(new Set())
  // Last non-empty window displayed under the current signature,
  // so a Renew that finds the cursor already spent can show that
  // batch again with the seen note instead of an empty list for
  // a pool that exists. Cleared when the signature changes
  // (mode/profile/filter change) — stale rows under new filters
  // must never resurface. Local to this mounted view (the gate
  // keeps it mounted across view switches since §AE, so it also
  // survives a switch to Unlimited and back).
  const lastWindowRef = useRef<{ sig: string; items: RecCandidate[] } | null>(null)

  useEffect(() => {
    seedPlayedSets(key, data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, data.user.id, mode])

  const generate = useCallback(
    async (
      nextFilters: RecFilters,
      nextCount: number,
      opts: { fresh?: boolean } = {},
    ) => {
      const run = ++runRef.current
      setBusy(true)
      setError(null)
      // Resume key: mode + profile identity + the applied filters.
      // A changed key (mode/profile/filter change, Loosen/Clear)
      // restarts from page 1 and drops the retained window; a
      // matching key continues through the next search window
      // instead of re-querying page 1 (batch 5, item A). `fresh`
      // restarts too — the engine ignores the resume on a fresh
      // run. Renew no longer passes fresh: it advances.
      const sig = `${key}:${mode}:${profile.pp}:${profile.comfortSrMin}:${profile.comfortSrMax}:${profile.srCeiling}:${profile.bpmSweetMin}:${profile.bpmSweetMax}:${(profile.playstyleTags ?? []).join(',')}:${JSON.stringify(nextFilters)}`
      if (resumeRef.current?.sig !== sig) {
        resumeRef.current = { sig, resume: emptyGenerationResume() }
        lastWindowRef.current = null
      }
      try {
        const seen = seenStore.load(key)
        // M5 learning: the mode's own ratings re-weight this run.
        // Best-effort — a failed load just means no boost.
        const boostFor = await loadModeBoostFor(supabase, user?.id ?? null, mode)
        // Snapshot for this press: served + downloaded as of now.
        // The skip loop and the render filter both read it, so a
        // window fetched below never hides itself; the ref is
        // only committed alongside the displayed window (after
        // the run guard), never mid-flight.
        const servedBefore = new Set(seen.served)
        const downloadedNow = new Set(seen.downloaded)
        const isHidden = (id: number) => downloadedNow.has(id) || servedBefore.has(id)
        const { result } = await generateUnseenWindow(
          profile,
          mode,
          {
            count: nextCount,
            filters: nextFilters,
            seen,
            fresh: opts.fresh,
            resume: resumeRef.current.resume,
            boostFor,
            // Part 4: Generated mode's fetch-time seen exclusion
            // stays off (ignoreSeen) — downloaded and
            // previously-seen maps are hidden at list level
            // instead (applySeenVisibility), so the engine pool
            // is unaffected. The run still marks served below
            // (the Unlimited feed reads it).
            ignoreSeen: true,
          },
          isHidden,
        )
        if (runRef.current !== run) return
        resumeRef.current = { sig, resume: result.nextResume }
        servedBeforeRef.current = servedBefore
        if (result.items.length > 0) {
          setItems(result.items)
          lastWindowRef.current = { sig, items: result.items }
          setTotalMatched(result.totalMatched)
          setDiagnostics(result.diagnostics)
          // Mark ONLY the displayed window served: skipped
          // windows were fetched but never shown, so they must
          // not count as appeared before — a later fresh run may
          // still show them, and the Unlimited feed must not
          // exclude maps the user never saw.
          seenStore.markMany(
            key,
            'served',
            result.items.map((c) => c.beatmapsetId),
          )
        } else if (lastWindowRef.current && lastWindowRef.current.sig === sig) {
          // Cursor spent and nothing new: show the last batch
          // again — the visibility fallback below flags it with
          // the seen note — instead of an empty list for a pool
          // that exists. Diagnostics come from the spent run so
          // the "end of window" line stays truthful.
          setItems(lastWindowRef.current.items)
          setTotalMatched(result.totalMatched)
          setDiagnostics(result.diagnostics)
        } else {
          setItems([])
          setTotalMatched(result.totalMatched)
          setDiagnostics(result.diagnostics)
        }
      } catch (err) {
        if (runRef.current !== run) return
        // Batch AM: a failed Renew restores the batch it cleared at
        // press time — a failed press never blanks the page. The
        // ref is only ever written by the Renew handler, so other
        // callers keep the current behaviour (error panel, rows
        // untouched).
        if (preRenewItemsRef.current) {
          setItems(preRenewItemsRef.current)
        }
        // A rate-limited search shows the proxy's honest limit
        // message (batch AP item 2a); anything else keeps the
        // existing generic line.
        setError(
          rateLimitMessage(err) ??
            'The recommendation search failed just now — osu! or the proxy may be busy. Try regenerating.',
        )
      } finally {
        if (runRef.current === run) {
          setBusy(false)
          setRenewing(false)
          preRenewItemsRef.current = null
        }
      }
    },
    [key, mode, profile, user?.id],
  )

  // (Re)generate when the profile/mode lands or changes. The old
  // mode's rows are cleared first (item 5): showing them as if
  // current while the new mode generates would be stale data.
  // On first mount the shared filters are adopted as-is (they may
  // already carry the user's choices from the Unlimited feed view) —
  // only a real profile/mode change resets them to the defaults.
  // Keep-place (§AE): while this view is hidden the effect must
  // NOT run — the signature ref is left untouched, so returning
  // to the view re-runs the effect and generates under the
  // current profile/mode instead of showing stale rows.
  const genSigRef = useRef<string | null>(null)
  useEffect(() => {
    if (!active) return
    const sig = `${data.user.id}:${mode}:${profile.pp}:${profile.comfortSrMin}:${profile.comfortSrMax}`
    if (genSigRef.current === sig) return
    const firstMount = genSigRef.current === null
    genSigRef.current = sig
    const start = firstMount ? filters : defaultFiltersFor(profile)
    if (!firstMount) {
      onFiltersChange(start)
      onDraftChange(start)
    }
    setItems([])
    // Batch AM: a mode change is not a Renew run — clear the flag so
    // a Renew superseded by a mode switch still shows skeletons.
    setRenewing(false)
    setTotalMatched(null)
    void generate(start, count)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, mode, active])

  // Live downloaded state: re-render whenever any seen-store
  // mutation lands (a download in the Unlimited view included),
  // so `downloaded` below is never a stale snapshot — the old
  // per-screen downloadedTick only refreshed on this view's
  // own downloads. The downloaded array keeps its identity
  // across served-only marks, so the memos below stay cheap.
  const seenVersion = useSeenVersion()
  const downloaded = useMemo(
    () => seenStore.load(key).downloaded,
    [key, seenVersion],
  )
  // Show-downloaded toggle (§AE), default OFF: when ON,
  // downloaded sets show again with their downloaded state. It
  // overrides ONLY the downloaded rule — the served-before rule
  // still hides non-downloaded maps that appeared before. Local
  // state, not persisted: a transient viewing choice.
  const [showDownloaded, setShowDownloaded] = useState(false)
  // Hide downloaded and previously-seen maps, reappearing when
  // every item in this window is hidden (see
  // applySeenVisibility). The chip allowlist is computed from
  // the VISIBLE rows, so hidden rows' tags never claim top-7
  // slots. The served snapshot is the ref committed with the
  // displayed window — never the live store, which would hide
  // the window's own items the moment they are marked served.
  const {
    visible: visibleItems,
    showingDownloadedFallback,
    showingSeenFallback,
  } = useMemo(
    () => applySeenVisibility(items, downloaded, servedBeforeRef.current, { showDownloaded }),
    [items, downloaded, showDownloaded],
  )
  // Row chips: only the 7 most-used essential tags across the
  // rendered list get chips — the rest of the skillset
  // vocabulary stays hidden on this screen.
  const tagAllowlist = useMemo(() => mostUsedEssentialTags(visibleItems), [visibleItems])
  // Batch AM: which loading state the list area shows (spinner for
  // a Renew run, skeletons otherwise) — resolved once per render.
  const loadingState = listLoadingState({ busy, renewing, itemCount: items.length, error })

  return (
    <div className="flex flex-col w-full">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg pb-space-lg">
        <div className="flex flex-col gap-1">
          <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Recommendations</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {profile.isStarter
              ? `Starter picks for ${MODE_LABELS[mode]} — popular Ranked maps near the starter band, not personalised yet.`
              : `Targeted algorithmic drill sets for ${data.user.username} in ${MODE_LABELS[mode]} — ordered for you from the fetched window.`}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-space-md bg-surface-container-low p-space-sm rounded-lg shadow-sm">
          <div className="flex items-center bg-surface-container-high rounded-full p-0.5" id="count-picker">
            {[20, 30, 50].map((n) => (
              <button
                key={n}
                className={count === n
                  ? 'px-3 py-1 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm shadow-sm transition-all'
                  : 'px-3 py-1 rounded-full text-on-surface-variant font-label-sm text-label-sm hover:text-on-surface transition-colors'}
                data-count={n}
                type="button"
                onClick={() => { setCount(n); void generate(filters, n) }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start mt-space-sm">
        <RecFiltersPanel
          draft={draft}
          onDraftChange={onDraftChange}
          onApply={() => { onFiltersChange(draft); void generate(draft, count) }}
          profile={profile}
          mode={mode}
          appliedCount={renewing ? null : items.length}
        />
        <main className="lg:col-span-8 xl:col-span-9 flex flex-col gap-space-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-space-xs py-1">
            <div className="flex items-center gap-space-sm">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">
                Training your {profile.srCeiling.toFixed(1)}★ gap — {renewing ? '…' : `${items.length} maps`}
              </h2>
              {totalMatched !== null && (
                <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-label-sm text-[10px]">~{totalMatched.toLocaleString('en-US')} sets match on osu!</span>
              )}
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
              <span className="text-primary font-medium flex items-center gap-0.5">pp training weight
                <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
              </span>
            </div>
          </div>

          {error && (
            <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
              <p className="font-body-sm text-body-sm text-error">{error}</p>
              <div className="flex items-center gap-space-sm flex-shrink-0">
                {/* Batch 6, defect 1: no fresh — a failed run never
                    advanced the resume, so fresh only restarted the
                    same window. Plain generate() retries the window
                    the resume points at. */}
                <button className="px-space-md py-2 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md" type="button" onClick={() => void generate(filters, count)}>Retry</button>
              </div>
            </div>
          )}
          {loadingState === 'spinner' && (
            <div className="flex flex-col items-center gap-space-sm py-space-xl" role="status" aria-live="polite" aria-label="Finding your next batch">
              {/* Batch AM: Renew spinner — the progress_activity icon
                  is the codebase's loading icon (same as LoadingState's
                  label row), spun with animate-spin; the skeleton
                  cards stay for first load / mode change. */}
              <span className="material-symbols-outlined text-primary text-[40px] animate-spin">progress_activity</span>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Finding your next batch…</p>
            </div>
          )}
          {loadingState === 'skeletons' && (
            <LoadingState label="Searching osu! and scoring your window…" />
          )}
          {!busy && !error && items.length === 0 && (
            <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {diagnostics
                  ? emptyPoolReason(diagnostics, filters)
                  : 'No maps in the fetched window match these filters. Loosen the SR/BPM ranges or clear the tag and apply again.'}
              </p>
              <div className="flex flex-wrap items-center gap-space-sm flex-shrink-0">
                {diagnostics && diagnostics.afterPick > 0 && diagnostics.afterFilters === 0 && (
                  <>
                    <button
                      className="px-space-md py-2 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md"
                      type="button"
                      title="Widen the SR/BPM/length ranges and generate again with the same tag"
                      onClick={() => {
                        const next = widenRecFilters(filters)
                        onFiltersChange(next)
                        onDraftChange(next)
                        void generate(next, count, { fresh: true })
                      }}
                    >
                      Loosen ranges
                    </button>
                    {filters.userTag !== null && (
                      <button
                        className="px-space-md py-2 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md"
                        type="button"
                        title="Drop the tag filter and generate again with the same ranges"
                        onClick={() => {
                          const next = clearRecTag(filters)
                          onFiltersChange(next)
                          onDraftChange(next)
                          void generate(next, count, { fresh: true })
                        }}
                      >
                        Clear tag
                      </button>
                    )}
                  </>
                )}
                {/* Batch 6, defect 1: same as the error-panel Retry —
                    no fresh, so Retry advances to the next window via
                    the resume instead of re-fetching window 1 and
                    landing on the same empty state. */}
                <button className="px-space-md py-2 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md" type="button" onClick={() => void generate(filters, count)}>Retry</button>
              </div>
            </div>
          )}
          {showingDownloadedFallback && (
            <p className="font-body-sm text-body-sm text-on-surface-variant px-space-xs">
              Everything in this batch is already downloaded — showing downloaded maps again.
            </p>
          )}
          {showingSeenFallback && (
            <p className="font-body-sm text-body-sm text-on-surface-variant px-space-xs">
              Everything in this batch has appeared before — showing seen maps again.
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
              feedback={rowMaps.feedbackById.get(c.beatmapId) ?? null}
              containing={rowMaps.containingBySet.get(c.beatmapsetId) ?? []}
              onFeedbackChange={rowMaps.onFeedbackChange}
              onContainingChange={(ids) => rowMaps.onContainingChange(c.beatmapsetId, ids)}
              downloadPrimary="auto"
              mods={filters.mods}
            />
          ))}
          {/* Part 4 + batch 7, item 3 — Renew: rendered at the bottom
              of the list whenever items were returned (NOT gated on
              windowExhausted). Every press ADVANCES to the next
              fresh window via the resume cursor — it never restarts
              from page 1 — skipping windows whose maps all
              appeared before, in the deterministic PP-anchored
              fixed ranking (no shuffling). When the pool is spent,
              the last batch shows again with the seen note. There
              is no separate Regenerate button anymore. */}
          {!error && items.length > 0 && (
            <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
              {diagnostics?.windowExhausted && (
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  You&apos;ve reached the end of this window.
                </p>
              )}
              <button
                id="renew-btn"
                className="px-space-md py-2 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md flex-shrink-0 disabled:opacity-50"
                type="button"
                disabled={busy}
                title="Show the next fresh batch — maps you haven't seen yet, in the fixed ranking order"
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                  // Batch AM: clear the stale batch at press time —
                  // the list area shows the Renew spinner while the
                  // run is in flight instead of the old maps. The
                  // batch is saved for a failure restore in
                  // generate(); the spent-cursor re-show is
                  // unaffected (it re-shows lastWindowRef on success).
                  preRenewItemsRef.current = items
                  setItems([])
                  setRenewing(true)
                  void generate(filters, count)
                }}
              >
                Renew recommendations
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default function Recommendations() {
  const mode = useModeStore((s) => s.mode)
  const { tier } = useAuth()
  const { status, data, error, identity, refresh } = useProfileData(mode)
  // Batch 5, item B: the feed switch lives ON this page, not in a
  // floating toggle — "Batches" (Generated, fixed top-N per window)
  // vs "Unlimited" (FeedSession, loads more as you scroll). Both
  // views share the same mode + filters state, lifted here.
  const [view, setView] = useState<'generated' | 'unlimited'>('generated')
  // Keep-place (§AE): BOTH views stay mounted (the inactive one
  // hidden with `hidden`), so switching views preserves each
  // view's loaded list and its scroll position is restored from
  // here. The views also receive `active` so their fetch effects
  // only run while visible — a hidden view must not refetch
  // (or re-adopt filters) behind the user's back.
  const scrollPosRef = useRef<Record<'generated' | 'unlimited', number>>({
    generated: 0,
    unlimited: 0,
  })
  const switchView = useCallback(
    (next: 'generated' | 'unlimited') => {
      scrollPosRef.current[view] = window.scrollY
      setView(next)
    },
    [view],
  )
  useEffect(() => {
    const y = scrollPosRef.current[view] ?? 0
    if (y > 0) {
      requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'auto' }))
    }
  }, [view])
  const [filtersState, setFiltersState] = useState<RecFilters | null>(null)
  const [draftState, setDraftState] = useState<RecFilters | null>(null)
  // Generated-mode resume state (batch 5, item A), owned here so
  // switching views does not restart the window: keyed by mode +
  // profile identity + applied filters inside generate().
  const generationResumeRef = useRef<{ sig: string; resume: GenerationResume } | null>(null)

  if (status === 'loading') {
    return (
      <AppShell identity={{ username: identity?.username ?? 'Loading…', pp: null, tierLabel: tier === 'account' ? 'account' : tier === 'guest' ? 'guest' : 'free tier' }}>
        <LoadingState label="Loading your profile before generating recommendations…" />
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

  const sharedFilters = filtersState ?? defaultFiltersFor(data.skillProfile)
  const sharedDraft = draftState ?? sharedFilters

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
      <div className="flex items-center gap-space-sm px-space-xl pt-space-md">
        <div className="flex items-center bg-surface-container-high rounded-full p-0.5" role="tablist" aria-label="Recommendation view">
          <button
            role="tab"
            aria-selected={view === 'generated'}
            className={view === 'generated'
              ? 'px-3 py-1 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm shadow-sm transition-all'
              : 'px-3 py-1 rounded-full text-on-surface-variant font-label-sm text-label-sm hover:text-on-surface transition-colors'}
            type="button"
            onClick={() => switchView('generated')}
          >
            Batches
          </button>
          <button
            role="tab"
            aria-selected={view === 'unlimited'}
            className={view === 'unlimited'
              ? 'px-3 py-1 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm shadow-sm transition-all'
              : 'px-3 py-1 rounded-full text-on-surface-variant font-label-sm text-label-sm hover:text-on-surface transition-colors'}
            type="button"
            onClick={() => switchView('unlimited')}
          >
            Unlimited
          </button>
        </div>
        <span className="font-label-sm text-label-sm text-on-surface-variant">
          {view === 'generated'
            ? 'A fixed batch from each search window — Generate again for the next window.'
            : 'Unlimited beatmaps — keeps loading more as you scroll.'}
        </span>
      </div>
      <div className={view === 'generated' ? undefined : 'hidden'}>
        <RecommendationsReal
          data={data}
          filters={sharedFilters}
          draft={sharedDraft}
          onFiltersChange={setFiltersState}
          onDraftChange={setDraftState}
          resumeRef={generationResumeRef}
          active={view === 'generated'}
        />
      </div>
      <div className={view === 'unlimited' ? undefined : 'hidden'}>
        <FeedReal
          data={data}
          filters={sharedFilters}
          draft={sharedDraft}
          onFiltersChange={setFiltersState}
          onDraftChange={setDraftState}
          active={view === 'unlimited'}
          renderBackToTop={false}
        />
      </div>
      <BackToTop placement="right" />
    </AppShell>
  )
}
