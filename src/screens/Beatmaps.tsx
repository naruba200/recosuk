// Converted from Stitch export: stitch-raw/09-mirror.html
// M6: the real variant below wires the search to the osu! API via
// the proxy, with real mirror download links. §AN: the mode tabs
// (incl. All) are gone — the screen follows the global mode.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import AppShell from '../components/AppShell'
import BeatmapRow from '../components/BeatmapRow'
import LoadErrorPanel from '../components/LoadErrorPanel'
import LoadingState from '../components/LoadingState'
import MenuSelect from '../components/MenuSelect'
import UserTagPicker from '../components/UserTagPicker'
import { isProxyConfigured, rateLimitMessage } from '../lib/osu'
import { MODE_LABELS, type GameMode } from '../lib/mode'
import { useModeStore } from '../lib/modeStore'
import { computeSkillProfile } from '../lib/skillProfile'
import {
  setToCandidate,
  type RecCandidate,
  type SearchPage,
} from '../lib/recommend'
import {
  buildMirrorQueryText,
  DEFAULT_MIRROR_SORT,
  defaultMirrorFilters,
  effectiveMirrorSort,
  fetchMirrorPage,
  MIRROR_GENRES,
  MIRROR_LANGUAGES,
  MIRROR_SORTS,
  MIRROR_STATUSES,
  MIRROR_VIEW_STORAGE_KEY,
  mirrorCandidateMatches,
  mirrorSearchMatchesQuery,
  parseMirrorView,
  searchQueryWords,
  type MirrorFilters,
  type MirrorSort,
  type MirrorView,
  type RangeFilter,
} from '../lib/mirrorSearch'
import { seenKey, seenStore, useSeenVersion } from '../lib/seenStore'
import BackToTop from '../components/BackToTop'
import { useCapabilities } from '../lib/capabilities'
import { useRowMaps } from '../lib/useRowMaps'
import { useAuth } from '../lib/auth'
import { useGuestStore } from '../lib/guestStore'
import { useSidebarIdentity } from '../lib/profileService'

// ---------------------------------------------------------------------------
// Real variant (M6): mode-aware mirror search + downloads.
// §AN: the screen follows the GLOBAL mode pills only — its own
// mode tabs (incl. the All-modes view) are gone.
interface MirrorResult {
  candidate: RecCandidate
  mode: GameMode
}

/** Neutral starter profile used only to pick a representative
 *  difficulty per set when the visitor has no linked profile. */
function neutralProfile(mode: GameMode) {
  return computeSkillProfile(
    { id: 0, username: '', playmode: mode, statistics: {} },
    [],
    [],
    [],
    mode,
  )
}

/**
 * Keep-place snapshot (§AE): everything needed to resume Beatmaps
 * exactly where the user left it. Transient UI state (busy,
 * loadingMore, error, drawer) is deliberately NOT preserved —
 * a restored screen shows its results immediately, not a
 * spinner. (§AN: no mode tab — the screen follows the global
 * mode, so the snapshot carries a single cursor/exhausted pair
 * for that mode.)
 */
interface MirrorPlace {
  key: string
  /** The global mode the snapshot's results were fetched in —
   * a mode change since the snapshot must re-search (§AN). */
  mode: GameMode
  query: string
  debouncedQuery: string
  sort: MirrorSort
  filters: MirrorFilters
  view: MirrorView
  results: MirrorResult[]
  total: number | null
  cursor: string | null
  exhausted: boolean
  scrollY: number
}

let mirrorPlace: MirrorPlace | null = null

function BeatmapsReal() {
  const globalMode = useModeStore((s) => s.mode)
  const { tier, user } = useAuth()
  const caps = useCapabilities()
  const guestSession = useGuestStore((s) => s.session)
  // Seen key first: keep-place restore (below) is keyed by it, so
  // it must exist before the state initializers read the holder.
  const username = guestSession?.osuUsername ?? null
  const key = seenKey(tier, username ?? 'mirror')
  // Keep-place (§AE): the last snapshot of this screen's list
  // state, saved on unmount and restored on the next mount with
  // the SAME seen key — navigating away and back keeps the
  // loaded items, cursor, filters and scroll position. A
  // different key (different tier/identity) restores nothing.
  // Module-level, not a store: one snapshot, no persistence
  // beyond the session, no cross-screen sharing.
  const [initialPlace] = useState<MirrorPlace | null>(() =>
    mirrorPlace && mirrorPlace.key === key ? mirrorPlace : null,
  )
  const [query, setQuery] = useState(initialPlace?.query ?? '')
  const [debouncedQuery, setDebouncedQuery] = useState(initialPlace?.debouncedQuery ?? '')
  const [sort, setSort] = useState<MirrorSort>(initialPlace?.sort ?? DEFAULT_MIRROR_SORT)
  // §AQ item 9a: whether the user has picked a sort by hand. The
  // relevance rule only applies while the sort is still the
  // untouched default — an explicit pick (even "Newest") is
  // always respected. A restored non-default sort counts as
  // picked; a restored default counts as untouched.
  const [sortTouched, setSortTouched] = useState(
    initialPlace ? initialPlace.sort !== DEFAULT_MIRROR_SORT : false,
  )
  const [filters, setFilters] = useState<MirrorFilters>(
    () => initialPlace?.filters ?? defaultMirrorFilters(),
  )
  // Drawer animation state: `drawerMounted` keeps the fixed
  // overlay in the DOM for the close transition;
  // `drawerShown` drives the transform/opacity classes. The
  // drawer is a fixed overlay, so opening/closing it never
  // reflows the page (no layout jump); the slide is a pure
  // transform transition.
  const [drawerMounted, setDrawerMounted] = useState(false)
  const [drawerShown, setDrawerShown] = useState(false)
  const drawerTimerRef = useRef<number | null>(null)
  // Grid/list view, persisted in localStorage. List is the
  // pre-existing layout and the fallback for any stored junk.
  // A keep-place restore wins over the stored preference: the
  // user left the screen in that view.
  const [view, setView] = useState<MirrorView>(() => {
    if (initialPlace) return initialPlace.view
    try {
      return parseMirrorView(window.localStorage.getItem(MIRROR_VIEW_STORAGE_KEY))
    } catch {
      return 'list'
    }
  })
  const [results, setResults] = useState<MirrorResult[]>(initialPlace?.results ?? [])
  const [total, setTotal] = useState<number | null>(initialPlace?.total ?? null)
  const [busy, setBusy] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cursor, setCursor] = useState<string | null>(initialPlace?.cursor ?? null)
  const [exhausted, setExhausted] = useState(initialPlace?.exhausted ?? false)
  const runRef = useRef(0)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const loadingMoreRef = useRef(false)
  // Keep-place save/restore (§AE): the latest state is mirrored
  // into a ref every render, so the unmount cleanup below always
  // saves the current list — no stale closure. The restore guards
  // further down (mount-snapshot comparisons) keep the restored
  // list intact: the fresh search must not fire on a restore
  // (a later global-mode change still re-searches, and any
  // sort/filter/query change still runs a fresh search).
  const placeRef = useRef({
    mode: globalMode,
    query,
    debouncedQuery,
    sort,
    filters,
    view,
    results,
    total,
    cursor,
    exhausted,
  })
  placeRef.current = {
    mode: globalMode,
    query,
    debouncedQuery,
    sort,
    filters,
    view,
    results,
    total,
    cursor,
    exhausted,
  }
  // StrictMode-safe restore guards (§AE): dev double-invokes
  // effects, so a "skip once" ref flag would be consumed by the
  // first (simulated) run and the second would discard the
  // restore. These comparisons are idempotent instead — they
  // stay true across the double-invoke and only turn false when
  // something actually changed. `searchRanRef` flips once a real
  // search runs, so reverting filters to exactly the restored
  // values still searches instead of showing the previous
  // filter set's rows.
  const searchRanRef = useRef(false)
  useEffect(
    () => () => {
      mirrorPlace = { key, ...placeRef.current, scrollY: window.scrollY }
    },
    [key],
  )
  useEffect(() => {
    if (!initialPlace || initialPlace.scrollY <= 0) return
    const y = initialPlace.scrollY
    requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'auto' }))
    // Run once on mount: the restore is a mount-time snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const queryText = useMemo(
    () => buildMirrorQueryText(debouncedQuery, filters),
    [debouncedQuery, filters],
  )
  // §AQ item 9b: the plain words of the current free-text query.
  // Non-empty means the strict filter is active, so the count
  // line must not quote the API's unfiltered total.
  const queryWords = useMemo(() => searchQueryWords(debouncedQuery), [debouncedQuery])
  // §AQ item 9a: the sort actually in effect. A query with the
  // untouched default sort ranks by relevance.
  const relevanceActive =
    queryText.trim() !== '' && sort === DEFAULT_MIRROR_SORT && !sortTouched
  // §AN: one mode only — the global mode. No All-modes view.
  const allExhausted = results.length > 0 && exhausted

  const pageToResults = useCallback(
    (
      pages: { mode: GameMode; page: SearchPage }[],
      into: Map<number, MirrorResult>,
      // §AQ item 9b: the plain words of the free-text query. Sets
      // whose title/artist/creator contains none of them are
      // dropped here, so tag/difficulty-only matches never reach
      // the list (or the count line).
      words: string[],
    ): Map<number, MirrorResult> => {
      for (const { mode: m, page } of pages) {
        const profile = neutralProfile(m)
        for (const set of page.beatmapsets ?? []) {
          if (!set || typeof set.id !== 'number' || into.has(set.id)) continue
          const candidate = setToCandidate(set, m, profile)
          if (!candidate || !mirrorCandidateMatches(candidate, filters)) continue
          if (!mirrorSearchMatchesQuery(candidate, words)) continue
          candidate.reason = `${set.status} · ${(set.play_count ?? 0).toLocaleString('en-US')} plays · ${(set.favourite_count ?? 0).toLocaleString('en-US')} favourites`
          into.set(set.id, { candidate, mode: m })
        }
      }
      return into
    },
    [filters],
  )

  // Fresh search: any change to sort/filters/query restarts the
  // list from the first cursor page. Cached pages (item 5) render
  // immediately; Refresh bypasses the cache.
  const runFreshSearch = useCallback(
    async (opts: { fresh: boolean; queryText?: string; freeText?: string }) => {
      const run = ++runRef.current
      // The Search button passes the live input text: the debounced
      // query may still hold the previous keystrokes.
      const effectiveQueryText = opts.queryText ?? queryText
      // The free text behind the search — the live input on a
      // Search press, the debounced query otherwise. It feeds the
      // strict filter; the built query text above feeds the API.
      const effectiveFreeText = opts.freeText ?? debouncedQuery
      setBusy(true)
      setError(null)
      setResults([])
      setTotal(null)
      setCursor(null)
      setExhausted(false)
      try {
        const page = await fetchMirrorPage(
          {
            mode: globalMode,
            queryText: effectiveQueryText,
            filters,
            // §AQ item 9a: relevance when a query is present and
            // the sort is still the untouched default.
            sort: effectiveMirrorSort(effectiveQueryText, sort, sortTouched),
          },
          { fresh: opts.fresh },
        )
        if (runRef.current !== run) return
        const merged = pageToResults(
          [{ mode: globalMode, page }],
          new Map(),
          searchQueryWords(effectiveFreeText),
        )
        setCursor(page.cursor_string ?? null)
        setExhausted(!page.cursor_string)
        setResults([...merged.values()])
        setTotal(typeof page.total === 'number' && page.total > 0 ? page.total : null)
      } catch (err) {
        if (runRef.current !== run) return
        // A rate-limited search shows the proxy's honest limit
        // message (batch AP item 2a); anything else keeps the
        // existing generic line.
        setError(
          rateLimitMessage(err) ??
            'Mirror search failed just now — osu! or the proxy may be busy. Try again.',
        )
        setResults([])
      } finally {
        if (runRef.current === run) setBusy(false)
      }
    },
    [globalMode, queryText, debouncedQuery, filters, sort, sortTouched, pageToResults],
  )

  // Typing is debounced; filter/sort changes search immediately
  // through the effect below (they change queryText/filters/sort).
  // §AN: no mode tab to sync — the global mode IS the search
  // mode, so a global-mode change re-runs the search through
  // runFreshSearch's own dependency on it.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 500)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    // Skipped on a keep-place restore while the search inputs
    // still match the snapshot: the restored list is already on
    // screen, and a fresh search would discard it. Any real
    // change — including a mode change since the snapshot — (or
    // a search having run once) searches normally.
    if (
      initialPlace &&
      !searchRanRef.current &&
      globalMode === initialPlace.mode &&
      sort === initialPlace.sort &&
      filters === initialPlace.filters &&
      queryText === buildMirrorQueryText(initialPlace.debouncedQuery, initialPlace.filters)
    ) {
      return
    }
    searchRanRef.current = true
    void runFreshSearch({ fresh: false })
  }, [runFreshSearch, initialPlace, globalMode, sort, filters, queryText])

  // Infinite scroll: the sentinel loads the next cursor page and
  // appends, deduped. Changing anything above resets the list
  // and cursor (fresh search), so the feed never mixes pages
  // from two different filter sets.
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || busy || exhausted) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    const run = runRef.current
    try {
      const page = await fetchMirrorPage({
        mode: globalMode,
        queryText,
        filters,
        sort: effectiveMirrorSort(queryText, sort, sortTouched),
        cursor,
      })
      if (runRef.current !== run) return
      setResults((prev) => {
        const merged = new Map(prev.map((r) => [r.candidate.beatmapsetId, r]))
        return [
          ...pageToResults(
            [{ mode: globalMode, page }],
            merged,
            searchQueryWords(debouncedQuery),
          ).values(),
        ]
      })
      setCursor(page.cursor_string ?? null)
      setExhausted(!page.cursor_string)
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [busy, exhausted, cursor, globalMode, queryText, debouncedQuery, filters, sort, sortTouched, pageToResults])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore()
      },
      { rootMargin: '600px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore, results.length])

  const updateFilters = (patch: Partial<MirrorFilters>) =>
    setFilters((f) => ({ ...f, ...patch }))

  const updateRange = (field: 'sr' | 'bpm' | 'lengthSec' | 'ar' | 'od' | 'hp' | 'cs', range: RangeFilter) =>
    updateFilters({ [field]: range } as Partial<MirrorFilters>)

  const clearFilters = () => {
    setFilters(defaultMirrorFilters())
    setSort(DEFAULT_MIRROR_SORT)
    // Clearing resets the sort to the untouched default, so a
    // later query ranks by relevance again (§AQ item 9a).
    setSortTouched(false)
  }

  const filtersActive =
    filters.status !== 'any' ||
    filters.genre !== 0 ||
    filters.language !== 0 ||
    filters.creator.trim() !== '' ||
    filters.userTag !== null ||
    [filters.sr, filters.bpm, filters.lengthSec, filters.ar, filters.od, filters.hp, filters.cs].some(
      (r) => r.min !== null || r.max !== null,
    )

  // Badge count for the filter icon: one per active filter group.
  const activeFilterCount =
    (filters.status !== 'any' ? 1 : 0) +
    (filters.genre !== 0 ? 1 : 0) +
    (filters.language !== 0 ? 1 : 0) +
    (filters.creator.trim() !== '' ? 1 : 0) +
    (filters.userTag !== null ? 1 : 0) +
    [filters.sr, filters.bpm, filters.lengthSec, filters.ar, filters.od, filters.hp, filters.cs].filter(
      (r) => r.min !== null || r.max !== null,
    ).length

  const openDrawer = useCallback(() => {
    if (drawerTimerRef.current !== null) {
      window.clearTimeout(drawerTimerRef.current)
      drawerTimerRef.current = null
    }
    setDrawerMounted(true)
    // Two frames so the mount paints in the hidden state before
    // the transition class flips on (otherwise it slides in from
    // mid-transition or appears instantly).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setDrawerShown(true))
    })
  }, [])

  const closeDrawer = useCallback(() => {
    setDrawerShown(false)
    drawerTimerRef.current = window.setTimeout(() => {
      setDrawerMounted(false)
      drawerTimerRef.current = null
    }, 300)
  }, [])

  // Unmount timer cleanup if the screen unmounts mid-close.
  useEffect(
    () => () => {
      if (drawerTimerRef.current !== null) window.clearTimeout(drawerTimerRef.current)
    },
    [],
  )

  // Persist the grid/list choice; a storage failure (private
  // mode) just means the choice does not survive a reload.
  useEffect(() => {
    try {
      window.localStorage.setItem(MIRROR_VIEW_STORAGE_KEY, view)
    } catch {
      /* ignore */
    }
  }, [view])

  // Escape closes the filter drawer; closing never touches the
  // chosen filters (they live in `filters`, not in drawer state).
  useEffect(() => {
    if (!drawerMounted) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerMounted, closeDrawer])

  // Batched row state (batch 11, part 5): feedbackMode is the
  // global mode (§AN — the All tab that mixed modes is gone),
  // one loadAllFeedback for the page, not one query per row.
  const rowMaps = useRowMaps({
    userId: user?.id,
    canRate: caps.canRate,
    canSave: caps.canSave,
    feedbackMode: globalMode,
    beatmapsetIds: results.map((r) => r.candidate.beatmapsetId),
  })

  // Live downloaded state (§AE): the shared seen-version signal,
  // like the two Recommendations screens — the old plain
  // render-time read never re-rendered when a download landed,
  // and the rows suppressed the downloaded indicator entirely
  // (batch 11, part 3), so the download icon could never flip
  // in Mirror. Both are fixed here: the signal re-renders on
  // every seen-store mutation, and the rows receive `downloaded`
  // like every other screen. The "Downloaded from Beatmaps"
  // panel below becomes live with the same change.
  const seenVersion = useSeenVersion()
  const downloaded = useMemo(
    () => seenStore.load(key).downloaded,
    [key, seenVersion],
  )
  const sessionDownloads = results.filter((r) => downloaded.includes(r.candidate.beatmapsetId))

  return (
    <div className="flex flex-col w-full gap-space-lg">
      <section className="flex flex-col gap-space-md">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
          <div className="flex flex-col">
            <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm uppercase tracking-widest mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span>
              <span>Fast Beatmap Pipeline</span>
              <span className="text-outline-variant">•</span>
              <span>Latency Optimized</span>
            </div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
              Beatmaps — {MODE_LABELS[globalMode]}
            </h1>
          </div>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant -mt-1">
          Downloads are the full beatmapset file (.osz contains every difficulty). The mode changes what you discover and which difficulty is shown.
        </p>
        <div className="flex flex-col gap-space-sm pt-space-xs">
          {/* One toolbar row: search bar left, controls right.
              The search button stays inside the input (it submits
              the live text immediately); sort / advanced-filters
              / refresh / view sit in the same row to its right. */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative flex items-center flex-1 min-w-0">
              <span className="material-symbols-outlined absolute left-4 text-on-surface-variant text-[22px] pointer-events-none">search</span>
              <input
                className="w-full h-12 pl-12 pr-32 rounded-full bg-surface-container text-on-surface placeholder:text-on-surface-variant/60 font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary shadow-sm transition-all"
                placeholder="Search beatmaps, artists, or mappers"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="absolute right-1.5 flex items-center">
                <button
                  className="px-space-lg h-9 rounded-full bg-primary text-on-primary font-label-md text-label-md flex items-center gap-1 shadow-md hover:bg-primary-container hover:text-on-primary-container active:scale-95 transition-all"
                  type="button"
                  onClick={() => {
                    setDebouncedQuery(query)
                    void runFreshSearch({
                      fresh: false,
                      queryText: buildMirrorQueryText(query, filters),
                      freeText: query,
                    })
                  }}
                >
                  <span className="material-symbols-outlined text-[18px]">tune</span>
                  <span>Search</span>
                </button>
              </div>
            </div>
            {/* Toolbar controls: custom sort dropdown (MenuSelect —
                the native select's OS popup could not be styled
                and washed out on dark themes), advanced filters
                tune button, icon-only refresh, and the grid/list
                view switcher. Filter/sort/refresh behaviour is
                unchanged — only the presentation. */}
            <div className="flex flex-wrap items-center gap-2 flex-shrink-0" role="toolbar" aria-label="Mirror controls">
              <MenuSelect
                options={
                  relevanceActive
                    ? [
                        { value: 'relevance' as const, label: 'Relevance' },
                        ...MIRROR_SORTS.map((s) => ({
                          value: s.value,
                          label: s.shortLabel,
                        })),
                      ]
                    : MIRROR_SORTS.map((s) => ({ value: s.value, label: s.shortLabel }))
                }
                value={relevanceActive ? 'relevance' : sort}
                onChange={(v) => {
                  // "Relevance" is the effective state, not a
                  // pickable sort — selecting it changes nothing.
                  if (v === 'relevance') return
                  setSort(v as MirrorSort)
                  setSortTouched(true)
                }}
                prefix="Sort:"
                ariaLabel="Sort results"
                buttonClassName="relative flex items-center h-9 w-44 pl-3 pr-8 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm hover:bg-surface-bright transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              <button
                className={`relative flex items-center justify-center w-9 h-9 rounded-full transition-colors ${drawerShown || filtersActive ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container text-on-surface-variant hover:text-on-surface'}`}
                type="button"
                aria-label={`Advanced filters${activeFilterCount > 0 ? `, ${activeFilterCount} active` : ''}`}
                aria-expanded={drawerMounted}
                title="Advanced filters"
                onClick={openDrawer}
              >
                <span className="material-symbols-outlined text-[20px]">tune</span>
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-primary text-on-primary font-label-sm text-[10px] font-bold flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <button
                className="flex items-center justify-center w-9 h-9 rounded-full bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors"
                type="button"
                aria-label="Refresh (bypass cache)"
                title="Refresh (bypass cache)"
                onClick={() => void runFreshSearch({ fresh: true })}
              >
                <span className="material-symbols-outlined text-[18px]">refresh</span>
              </button>
              <div className="flex items-center gap-0.5 p-0.5 rounded-full bg-surface-container" role="group" aria-label="Results view">
                <button
                  className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${view === 'list' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:text-on-surface'}`}
                  type="button"
                  aria-label="List view"
                  aria-pressed={view === 'list'}
                  title="List view"
                  onClick={() => setView('list')}
                >
                  <span className="material-symbols-outlined text-[18px]">view_list</span>
                </button>
                <button
                  className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${view === 'grid' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:text-on-surface'}`}
                  type="button"
                  aria-label="Grid view"
                  aria-pressed={view === 'grid'}
                  title="Grid view"
                  onClick={() => setView('grid')}
                >
                  <span className="material-symbols-outlined text-[18px]">grid_view</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Advanced-filters drawer: slides in from the right on a
          transform transition (mounted for the 300ms close
          transition, then unmounted). Filter state lives in
          `filters` (same as before), so choosing here resets the
          list + cursor exactly like the old panel did, and
          closing the drawer loses nothing. */}
      {drawerMounted && (
        <div className="fixed inset-0 z-50">
          <div
            className={`absolute inset-0 bg-black/60 transition-opacity duration-300 motion-reduce:transition-none ${drawerShown ? 'opacity-100' : 'opacity-0'}`}
            aria-hidden="true"
            onClick={closeDrawer}
          ></div>
          <aside
            className={`absolute right-0 top-0 h-full w-[360px] max-w-[92vw] bg-surface-container-low shadow-xl flex flex-col transition-transform duration-300 ease-out motion-reduce:transition-none ${drawerShown ? 'translate-x-0' : 'translate-x-full'}`}
            role="dialog"
            aria-modal="true"
            aria-label="Advanced filters"
          >
            <div className="flex items-center justify-between px-space-md py-3 border-b border-surface-container-high flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-primary text-[20px]">tune</span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Advanced Filters</h2>
              </div>
              <button
                className="w-9 h-9 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center justify-center transition-colors"
                type="button"
                aria-label="Close advanced filters"
                onClick={closeDrawer}
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-space-md py-space-md flex flex-col gap-space-lg">
              <FilterSection title="Status">
                <ChipGroup
                  ariaLabel="Beatmap status"
                  options={MIRROR_STATUSES}
                  value={filters.status}
                  onChange={(v) => updateFilters({ status: v })}
                />
              </FilterSection>
              <FilterSection title="Genre">
                <ChipGroup
                  ariaLabel="Genre"
                  options={MIRROR_GENRES}
                  value={filters.genre}
                  onChange={(v) => updateFilters({ genre: v })}
                />
              </FilterSection>
              <FilterSection title="Language">
                <ChipGroup
                  ariaLabel="Language"
                  options={MIRROR_LANGUAGES}
                  value={filters.language}
                  onChange={(v) => updateFilters({ language: v })}
                />
              </FilterSection>
              <FilterSection title="Mapper">
                <label className="font-label-md text-label-md text-on-surface font-semibold sr-only" htmlFor="mirror-creator">Mapper / creator</label>
                <input
                  id="mirror-creator"
                  className="w-full h-10 px-4 rounded-full bg-surface-container text-on-surface placeholder:text-on-surface-variant/60 font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                  placeholder="Mapper username"
                  type="text"
                  value={filters.creator}
                  onChange={(e) => updateFilters({ creator: e.target.value })}
                />
              </FilterSection>
              <FilterSection title="User Tag">
                <UserTagPicker
                  mode={globalMode}
                  value={filters.userTag}
                  onChange={(next) => updateFilters({ userTag: next })}
                />
              </FilterSection>
              <FilterSection title="Difficulty">
                <div className="flex flex-col gap-space-md">
                  <RangeSlider label="Star rating" range={filters.sr} min={0} max={12} step={0.1} onChange={(r) => updateRange('sr', r)} />
                  <RangeSlider label="BPM" range={filters.bpm} min={0} max={300} step={1} onChange={(r) => updateRange('bpm', r)} />
                  <RangeSlider label="Length (minutes)" range={filters.lengthSec} min={0} max={20} step={0.5} displayScale={1 / 60} onChange={(r) => updateRange('lengthSec', r)} />
                  <RangeSlider label="Approach rate" range={filters.ar} min={0} max={11} step={0.1} onChange={(r) => updateRange('ar', r)} />
                  <RangeSlider label="Overall difficulty" range={filters.od} min={0} max={11} step={0.1} onChange={(r) => updateRange('od', r)} />
                  <RangeSlider label="HP drain" range={filters.hp} min={0} max={11} step={0.1} onChange={(r) => updateRange('hp', r)} />
                  <RangeSlider label="Circle size / keys" range={filters.cs} min={0} max={10} step={1} onChange={(r) => updateRange('cs', r)} />
                </div>
              </FilterSection>
              <p className="font-label-sm text-label-sm text-on-surface-variant">
                Stat ranges narrow the search on osu! and are re-checked on every result. Genre, language and HP are applied by osu! only.
              </p>
            </div>
            <div className="flex items-center gap-2 px-space-md py-3 border-t border-surface-container-high flex-shrink-0">
              <button
                className="px-4 py-2.5 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high font-label-md text-label-md transition-colors disabled:opacity-40"
                type="button"
                disabled={!filtersActive}
                onClick={clearFilters}
              >
                Clear All
              </button>
              <button
                className="flex-1 py-2.5 rounded-full bg-primary text-on-primary font-label-md text-label-md font-bold hover:opacity-95 transition-opacity"
                type="button"
                onClick={closeDrawer}
              >
                Apply Filters{filtersActive ? ` (${activeFilterCount})` : ''}
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-xl">
        <section className="xl:col-span-8 flex flex-col gap-space-md min-w-0">
          <div className="flex items-center justify-between pb-1">
            <div className="flex items-center gap-space-sm">
              <span className="font-headline-sm text-headline-sm text-on-surface">Search results</span>
              <span className="px-2 py-0.5 rounded-full bg-surface-container-high font-label-sm text-label-sm text-on-surface-variant font-medium">
                {results.length} beatmapsets
                {/* §AQ item 9b: the API total counts full-text
                    matches, so once the strict filter drops rows
                    it no longer matches what is shown — the
                    "~N on osu!" suffix is shown only when no
                    strict filtering is active. */}
                {total !== null && queryWords.length === 0
                  ? ` · ~${total.toLocaleString('en-US')} on osu!`
                  : ''}
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-low font-label-sm text-label-sm">
              <span className="w-2 h-2 rounded-full bg-[#7EE787] animate-pulse"></span>
              <span className="text-on-surface-variant">Beatmaps status:</span>
              <span className="text-on-surface font-semibold">Online</span>
            </div>
          </div>

          {error && (
            <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
              <p className="font-body-sm text-body-sm text-error">{error}</p>
              <button className="px-space-md py-2 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md flex-shrink-0" type="button" onClick={() => void runFreshSearch({ fresh: true })}>Retry</button>
            </div>
          )}
          {busy && (
            <LoadingState label={`Searching osu! in ${MODE_LABELS[globalMode]}…`} />
          )}
          {!busy && !error && results.length === 0 && (
            <p className="font-body-md text-body-md text-on-surface-variant">
              No beatmapsets found for this search in {MODE_LABELS[globalMode]}. Try a different artist, mapper, or title — or loosen the filters.
            </p>
          )}
          {/* List = the pre-existing rows. Grid = the same rows
              as stacked cards in a responsive 2-column grid
              (BeatmapRow `card`), same content and actions.
              Downloaded rows show the downloaded badge + redo
              icon like every other screen (§AE removed the
              batch-11 suppression that hid them here). */}
          {view === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {results.map(({ candidate, mode: entryMode }) => (
                <BeatmapRow
                  key={`${entryMode}-${candidate.beatmapsetId}`}
                  candidate={candidate}
                  mode={entryMode}
                  seenKeyValue={key}
                  downloaded={downloaded.includes(candidate.beatmapsetId)}
                  card
                  feedback={rowMaps.feedbackById.get(candidate.beatmapId) ?? null}
                  containing={rowMaps.containingBySet.get(candidate.beatmapsetId) ?? []}
                  onFeedbackChange={rowMaps.onFeedbackChange}
                  onContainingChange={(ids) =>
                    rowMaps.onContainingChange(candidate.beatmapsetId, ids)
                  }
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {results.map(({ candidate, mode: entryMode }) => (
                <BeatmapRow
                  key={`${entryMode}-${candidate.beatmapsetId}`}
                  candidate={candidate}
                  mode={entryMode}
                  seenKeyValue={key}
                  downloaded={downloaded.includes(candidate.beatmapsetId)}
                  feedback={rowMaps.feedbackById.get(candidate.beatmapId) ?? null}
                  containing={rowMaps.containingBySet.get(candidate.beatmapsetId) ?? []}
                  onFeedbackChange={rowMaps.onFeedbackChange}
                  onContainingChange={(ids) =>
                    rowMaps.onContainingChange(candidate.beatmapsetId, ids)
                  }
                />
              ))}
            </div>
          )}
          {/* Infinite-scroll sentinel: loads the next cursor page. */}
          <div ref={sentinelRef} className="h-2" aria-hidden="true"></div>
          {loadingMore && (
            <p className="font-body-md text-body-md text-on-surface-variant text-center">Loading more…</p>
          )}
          {!busy && !loadingMore && allExhausted && (
            <p className="font-body-md text-body-md text-on-surface-variant text-center">
              You&apos;ve reached the end — {results.length} beatmapsets match these filters.
            </p>
          )}
        </section>

        <aside className="xl:col-span-4 flex flex-col gap-space-md">
          <div className="rounded-lg bg-surface-container-low p-space-md shadow-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-space-sm">Downloaded from Beatmaps</h2>
            {sessionDownloads.length === 0 ? (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Nothing downloaded yet this session. Downloads are recorded locally so
                recommendations won't serve the same maps again.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {sessionDownloads.map(({ candidate }) => (
                  <div key={candidate.beatmapsetId} className="flex items-center gap-2 font-label-sm text-label-sm">
                    <span className="material-symbols-outlined text-tertiary text-[16px]">check_circle</span>
                    <span className="text-on-surface truncate">{candidate.title}</span>
                    <span className="text-on-surface-variant">· {candidate.artist}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
      <BackToTop />
    </div>
  )
}

/** Collapsible filter section in the drawer, BeatConnect-style:
 * uppercase header + chevron, divider below. Sections start open. */
function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <section className="border-b border-surface-container-high pb-space-md last:border-b-0">
      <button
        className="w-full flex items-center justify-between py-1 text-left"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-label-md text-label-md text-on-surface font-bold uppercase tracking-wider">{title}</span>
        <span className="material-symbols-outlined text-on-surface-variant text-[18px]">{open ? 'expand_less' : 'expand_more'}</span>
      </button>
      {open && <div className="pt-2">{children}</div>}
    </section>
  )
}

/** Single-select chip group: one value at a time, exactly like the
 * select it replaces. The selected chip is filled + checked. */
function ChipGroup<T extends string | number>({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  ariaLabel: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => {
        const selected = opt.value === value
        return (
          <button
            key={String(opt.value)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full font-label-md text-label-md transition-colors ${
              selected
                ? 'bg-primary text-on-primary font-bold'
                : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
            }`}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
          >
            {selected && <span className="material-symbols-outlined text-[14px] leading-none">check</span>}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Dual-thumb slider row: two overlapping range inputs (see
 * `.dual-range` in index.css — only the thumbs take pointer
 * events) over one track, paired with editable min/max value
 * boxes. Boxes and sliders stay in sync both ways; dragging a
 * thumb to a domain extreme (or clearing a box) unsets that
 * bound (null), exactly like the old number-only inputs.
 * `displayScale` converts stored units to display units (length
 * is stored in seconds, shown in minutes).
 */
function RangeSlider({
  label,
  range,
  min,
  max,
  step,
  displayScale = 1,
  onChange,
}: {
  label: string
  range: RangeFilter
  min: number
  max: number
  step: number
  displayScale?: number
  onChange: (range: RangeFilter) => void
}) {
  const toDisplay = (v: number | null): number | null => (v === null ? null : v * displayScale)
  const fromDisplay = (d: number | null): number | null => (d === null ? null : d / displayScale)
  const dispMin = toDisplay(range.min)
  const dispMax = toDisplay(range.max)
  const sliderMin = dispMin ?? min
  const sliderMax = dispMax ?? max
  const fmt = (v: number | null): string =>
    v === null ? '' : String(Math.round(v * 100) / 100)
  const parse = (text: string): number | null => {
    if (text.trim() === '') return null
    const n = Number(text)
    return Number.isFinite(n) ? n : null
  }
  const normalize = (next: RangeFilter): RangeFilter => {
    // Extremes mean "unset"; keep min <= max.
    const lo = next.min !== null && next.min <= min ? null : next.min
    const hi = next.max !== null && next.max >= max ? null : next.max
    if (lo !== null && hi !== null && lo > hi) return { min: hi, max: hi }
    return { min: lo, max: hi }
  }
  const setDisplay = (which: 'min' | 'max', text: string) => {
    const parsed = parse(text)
    const stored = fromDisplay(parsed)
    onChange(normalize(which === 'min' ? { ...range, min: stored } : { ...range, max: stored }))
  }
  const pct = (v: number): number => ((v - min) / (max - min)) * 100
  return (
    <div className="flex flex-col gap-1">
      <span className="font-label-md text-label-md text-on-surface font-semibold uppercase tracking-wide text-[11px]">{label}</span>
      <div className="relative h-6 flex items-center">
        <div className="absolute left-0 right-0 h-1.5 rounded-full bg-surface-container-highest" aria-hidden="true" />
        <div
          className="absolute h-1.5 rounded-full bg-primary"
          style={{ left: `${pct(sliderMin)}%`, right: `${100 - pct(sliderMax)}%` }}
          aria-hidden="true"
        />
        <input
          className="dual-range absolute inset-0 w-full z-10"
          type="range"
          min={min}
          max={max}
          step={step}
          value={sliderMin}
          aria-label={`${label} minimum`}
          onChange={(e) => setDisplay('min', e.target.value)}
        />
        <input
          className="dual-range absolute inset-0 w-full z-20"
          type="range"
          min={min}
          max={max}
          step={step}
          value={sliderMax}
          aria-label={`${label} maximum`}
          onChange={(e) => setDisplay('max', e.target.value)}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <input
          aria-label={`${label} minimum value`}
          className="flex-1 min-w-0 h-9 px-3 rounded-lg bg-surface-container text-on-surface font-body-md text-body-md text-center focus:outline-none focus:ring-2 focus:ring-primary"
          type="number"
          step={step}
          value={fmt(dispMin)}
          onChange={(e) => setDisplay('min', e.target.value)}
        />
        <span className="text-on-surface-variant">–</span>
        <input
          aria-label={`${label} maximum value`}
          className="flex-1 min-w-0 h-9 px-3 rounded-lg bg-surface-container text-on-surface font-body-md text-body-md text-center focus:outline-none focus:ring-2 focus:ring-primary"
          type="number"
          step={step}
          value={fmt(dispMax)}
          onChange={(e) => setDisplay('max', e.target.value)}
        />
      </div>
    </div>
  )
}


export default function Beatmaps() {
  const { tier } = useAuth()
  const { username: sidebarName, pp: sidebarPp, avatarUrl: sidebarAvatarUrl } =
    useSidebarIdentity()
  if (!isProxyConfigured) {
    return (
      <AppShell
        identity={{
          username: sidebarName ?? 'Loading…',
          pp: sidebarPp,
          avatarUrl: sidebarAvatarUrl ?? undefined,
          tierLabel: tier === 'account' ? 'account' : tier === 'guest' ? 'guest' : 'beatmaps browsing',
        }}
      >
        <LoadErrorPanel
          message="Beatmaps need the osu! proxy connected (see docs/M1-SETUP.md)."
          onRetry={() => window.location.reload()}
          noProfile={false}
        />
      </AppShell>
    )
  }
  return (
    <AppShell
      identity={{
        username: sidebarName ?? 'Loading…',
        pp: sidebarPp,
        avatarUrl: sidebarAvatarUrl ?? undefined,
        tierLabel: tier === 'account' ? 'account' : tier === 'guest' ? 'guest' : 'beatmaps browsing',
      }}
    >
      <BeatmapsReal />
    </AppShell>
  )
}
