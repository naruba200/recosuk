import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import LoadingState from '../components/LoadingState'
import BeatmapRow from '../components/BeatmapRow'
import LockedButton from '../components/LockedButton'
import { isProxyConfigured, OsuServiceError } from '../lib/osu'
import { useAuth } from '../lib/auth'
import { useGuestStore } from '../lib/guestStore'
import { useSidebarIdentity } from '../lib/profileService'
import { useDownloadSettings } from '../lib/downloadSettings'
import { downloadManager } from '../lib/downloadManager'
import { attemptSongsCopy } from '../lib/songCopy'
import { seenKey, seenStore } from '../lib/seenStore'
import { useModeStore } from '../lib/modeStore'
import { modeLabel, type GameMode } from '../lib/mode'
import { useCapabilities } from '../lib/capabilities'
import { useRowMaps } from '../lib/useRowMaps'
import { useDownloadQueue } from '../lib/downloadQueue'
import { scheduleBulkDownload } from '../lib/bulkDownload'
import { supabase } from '../lib/supabase'
import {
  RANKED_WINDOWS,
  rankedListName,
  saveCompilationAsList,
  type RankedCompilation,
  type RankedWindow,
  type RankedWindowId,
} from '../lib/rankedLists'
import {
  RANKED_CARD_COMPILE_ERROR,
  compileCardCompilation,
  isCompilationFresh,
  isUnreachableCompilation,
  listStoredCompilations,
  loadStoredCompilation,
  rankedCardsForWindow,
  storeCompilation,
  type RankedPeriodCard,
  type StoredHistoryEntry,
} from '../lib/rankedCards'
import {
  PACK_CATEGORIES,
  PACK_CATEGORY_LABELS,
  PACKS_PAGE_SIZE,
  fetchBeatmapPack,
  fetchBeatmapPacksPage,
  packDateLabel,
  packDownloadLabel,
  packEffectiveMode,
  packVisibleForMode,
  paginatePackList,
  type BeatmapPack,
  type PackCategory,
} from '../lib/packs'

/**
 * Collections: beatmap PACKS in osu!'s seven categories (Standard,
 * Featured, Tournament, Loved, Chart, Theme, Artist), with a mode
 * filter. The packs themselves come from osu!'s public
 * beatmap-packs API via the proxy (see lib/packs.ts for the
 * researched facts) — never fabricated. "View pack" expands a pack
 * in place to list its contents (never a download); "Download"
 * opens the pack's archive URL when the API provides one (the `url`
 * field IS the pack download URL), and otherwise hands every set to
 * the browser one at a time through the same native browser-download
 * path as Beatmaps. No pack-level bulk-download buttons: the Ranked
 * section's Download All is the only bulk action on this page.
 *
 * The Song-folder copy step (item 8) plugs in through the optional
 * `copySet` seam on the download loop: when the user has auto-copy
 * on, each set is ALSO written into their picked Songs folder.
 * Without it, downloads are browser-only, exactly like Beatmaps.
 */

/** Cap on expanded pack contents rendered at once: yearly packs
 * can hold 1000+ sets, and rendering every row would jank the
 * page. The note under the list says the rest is in the download. */
const EXPANDED_SET_LIMIT = 200

function PackCard({
  pack,
  onDownload,
  onToggleView,
  onDownloadSet,
  expanded,
  detailLoading,
  downloading,
  error,
}: {
  pack: BeatmapPack
  onDownload: (pack: BeatmapPack) => void
  onToggleView: (pack: BeatmapPack) => void
  onDownloadSet: (pack: BeatmapPack, item: { id: number; artist: string; title: string }) => void
  expanded: boolean
  detailLoading: boolean
  downloading: boolean
  error: string | null
}) {
  const meta = new Map((pack.setMeta ?? []).map((m) => [m.id, m]))
  const shownIds = pack.beatmapsetIds.slice(0, EXPANDED_SET_LIMIT)
  const packMode = packEffectiveMode(pack)
  return (
    <article className="flex flex-col gap-space-md p-space-md bg-surface-container-low hover:bg-surface-container transition-all rounded-lg shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-headline-sm text-headline-sm text-on-surface truncate">{pack.name}</span>
            {packMode && (
              <span className="px-2 py-0.5 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm">
                {modeLabel(packMode)}
              </span>
            )}
            {pack.packType !== 'unknown' && (
              <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm">
                {PACK_CATEGORY_LABELS[pack.packType]}
              </span>
            )}
          </div>
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            {pack.tag}
            {pack.date ? ` · ${packDateLabel(pack.date)}` : ''}
            {` · `}
            {pack.beatmapsetIds.length > 0
              ? `${pack.beatmapsetIds.length} beatmapsets`
              : 'Contents load when you view the pack'}
          </span>
          {error && <span className="font-body-sm text-body-sm text-error">{error}</span>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            className="flex items-center gap-1.5 px-space-md py-2 rounded-full bg-surface-container-high text-on-surface font-label-md text-label-md hover:bg-surface-container-highest transition-all flex-shrink-0"
            type="button"
            aria-expanded={expanded}
            onClick={() => onToggleView(pack)}
          >
            <span className="material-symbols-outlined text-[18px]">visibility</span>
            <span>{expanded ? 'Hide contents' : 'View pack'}</span>
          </button>
          <button
            className="flex items-center gap-1.5 px-space-md py-2 rounded-full bg-primary text-on-primary font-label-md text-label-md shadow-md hover:bg-primary-container hover:text-on-primary-container active:scale-95 transition-all flex-shrink-0 disabled:opacity-60"
            type="button"
            disabled={downloading}
            onClick={() => onDownload(pack)}
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            <span>{downloading ? 'Queuing…' : packDownloadLabel(pack)}</span>
          </button>
        </div>
      </div>
      {expanded && (
        <div className="flex flex-col gap-1 border-t border-surface-container-highest/60 pt-space-sm">
          {detailLoading ? (
            <span className="font-body-sm text-body-sm text-on-surface-variant">Loading contents…</span>
          ) : pack.beatmapsetIds.length === 0 ? (
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              This pack&apos;s contents could not be loaded just now — try viewing it again in a moment.
            </span>
          ) : (
            <>
              {shownIds.map((id) => {
                const m = meta.get(id)
                return (
                  <div key={id} className="flex items-center justify-between gap-space-md py-1">
                    <span className="font-body-sm text-body-sm text-on-surface truncate min-w-0">
                      {m && (m.artist || m.title) ? `${m.artist} — ${m.title}` : `Beatmapset ${id}`}
                    </span>
                    <button
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm hover:bg-surface-container-highest transition-all flex-shrink-0 disabled:opacity-60"
                      type="button"
                      disabled={downloading}
                      aria-label={`Download beatmapset ${id}`}
                      onClick={() =>
                        onDownloadSet(pack, {
                          id,
                          artist: m?.artist ?? '',
                          title: m?.title ?? '',
                        })
                      }
                    >
                      <span className="material-symbols-outlined text-[16px]">download</span>
                      <span>Download</span>
                    </button>
                  </div>
                )
              })}
              {pack.beatmapsetIds.length > EXPANDED_SET_LIMIT && (
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  Showing the first {EXPANDED_SET_LIMIT} of {pack.beatmapsetIds.length} sets — use Download to get them all.
                </span>
              )}
            </>
          )}
        </div>
      )}
    </article>
  )
}

/**
 * Ranked compilation lists (batch 9, reworked in batch AN, rolling
 * in batch AO): the top 50 most-played maps ranked inside a period,
 * following the GLOBAL mode state (no mode tabs inside the section).
 * Week stays ONE list; month shows 4 cards (the TRAILING 4 calendar
 * weeks) and year 12 cards (the TRAILING 12 calendar months); each
 * card opens a detail page with the song list. A History tab lists
 * past stored periods, newest first.
 *
 * DATABASE-BACKED (batch AN, migration 003): compiled lists are
 * stored in the `ranked_compilations` table and read FIRST — a
 * visit no longer live-compiles 4–12 lists. A missing or stale
 * card (TTL: week 1h, month 6h, year 24h) compiles live in the
 * background, one card at a time so a cold visit never fires 12
 * scans at once, and is stored when it lands. Stale rows stay on
 * screen while they refresh; a failed recompile never hides them.
 * All rows are live data — never sample entries. "Save as list"
 * stores a whole 50 as one M5 user list (account-only; guests
 * see the locked state) — on the week list here, per card on the
 * detail page.
 *
 * HIDDEN CARDS (§AO): a card whose compile found nothing AND the
 * scan stopped early (partial — the interval is beyond the scan's
 * reach) is HIDDEN, not shown as "0 maps". The empty result is
 * stored, so the hide is cached; an unreachable stored row is
 * never recompiled on TTL expiry (its interval only gets older).
 * A transient failure still shows an error, never a silent hide.
 */
interface CardState {
  compilation: RankedCompilation | null
  compiling: boolean
  error: string | null
  stale: boolean
  /** §AO: unreachable (0 entries + partial) — hidden from the grid. */
  hidden: boolean
}

const EMPTY_CARD_STATE: CardState = {
  compilation: null,
  compiling: true,
  error: null,
  stale: false,
  hidden: false,
}

/** One period card tile: label, entry count, #1 map cover/title. */
function RankedCardTile({
  card,
  state,
  onOpen,
}: {
  card: RankedPeriodCard
  state: CardState
  onOpen: () => void
}) {
  const first = state.compilation?.entries[0]
  const count = state.compilation?.entries.length
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left rounded-2xl bg-surface-container-low overflow-hidden hover:bg-surface-container transition-colors focus-visible:outline-2 focus-visible:outline-primary"
      aria-label={`${card.label} — ${count != null ? `${count} maps` : 'loading'}`}
    >
      {first?.candidate.cover ? (
        <img
          src={first.candidate.cover}
          alt=""
          className="w-full h-28 object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-28 bg-surface-container-high flex items-center justify-center">
          <span className="material-symbols-outlined text-on-surface-variant text-[32px]">
            music_note
          </span>
        </div>
      )}
      <div className="p-space-md flex flex-col gap-1">
        <p className="font-headline-sm text-headline-sm text-on-surface">{card.label}</p>
        {state.compiling && !state.compilation && (
          <p className="font-body-sm text-body-sm text-on-surface-variant">Compiling…</p>
        )}
        {state.error && (
          <p className="font-body-sm text-body-sm text-error">{state.error}</p>
        )}
        {state.compilation && (
          <>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {count} {count === 1 ? 'map' : 'maps'}
            </p>
            {first && (
              <p className="font-body-sm text-body-sm text-on-surface truncate">
                #1 {first.candidate.title} — {first.candidate.artist}
              </p>
            )}
            {state.stale && (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Updating in the background…
              </p>
            )}
            {state.compilation.partial && (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Partial list — the scan stopped early.
              </p>
            )}
          </>
        )}
      </div>
    </button>
  )
}

/**
 * History tab (§AO): past stored periods for the current mode,
 * newest first. Each row opens the same detail page as a card.
 * `rows` is undefined while loading, null when the read fails
 * (no client, or the table does not exist yet — migration 003
 * not run), and [] when the table exists but nothing is stored
 * yet. Guests read like everyone else (public read policy);
 * nobody stores from here — rows appear only once a period has
 * been compiled and stored elsewhere.
 */
function RankedHistoryList({
  mode,
  signal,
}: {
  mode: GameMode
  signal: number
}) {
  const navigate = useNavigate()
  const [rows, setRows] = useState<StoredHistoryEntry[] | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    setRows(undefined)
    void listStoredCompilations(supabase, mode).then((listed) => {
      if (!cancelled) setRows(listed)
    })
    return () => {
      cancelled = true
    }
  }, [mode, signal])

  if (rows === undefined) {
    return <LoadingState label="Loading past collections…" />
  }
  if (rows === null) {
    return (
      <div className="p-space-md rounded-lg bg-surface-container-low">
        <p className="font-body-md text-body-md text-on-surface-variant">
          Past collections are not available yet — the ranked-compilations table has not been
          created. Run migration 003 (supabase/migrations/003_ranked_compilations.sql) in the
          Supabase SQL editor, and periods will start appearing here once they have been
          compiled and stored.
        </p>
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <div className="p-space-md rounded-lg bg-surface-container-low">
        <p className="font-body-md text-body-md text-on-surface-variant">
          No past collections stored yet — periods appear here once they have been compiled
          and stored. New ones arrive as the weeks and months roll on.
        </p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <button
          key={`${row.granularity}:${row.period}`}
          type="button"
          onClick={() =>
            navigate(`/collections/ranked/${mode}/${row.granularity}/${row.period}`)
          }
          className="flex items-center justify-between gap-space-md p-space-md rounded-lg bg-surface-container-low hover:bg-surface-container transition-colors text-left"
        >
          <span className="flex flex-col min-w-0">
            <span className="font-headline-sm text-headline-sm text-on-surface truncate">
              {row.label}
            </span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              {row.entryCount} {row.entryCount === 1 ? 'map' : 'maps'}
              {row.partial ? ' · Partial list — the scan stopped early' : ''}
              {row.compiledAtMs > 0
                ? ` · Compiled ${new Date(row.compiledAtMs).toLocaleDateString()}`
                : ''}
            </span>
          </span>
          <span className="material-symbols-outlined text-on-surface-variant text-[20px] flex-shrink-0">
            chevron_right
          </span>
        </button>
      ))}
    </div>
  )
}

function RankedListsSection({ seenKeyValue }: { seenKeyValue: string }) {
  const mode = useModeStore((s) => s.mode)
  const { user } = useAuth()
  const caps = useCapabilities()
  const navigate = useNavigate()
  const noVideo = useDownloadSettings((s) => s.noVideo)
  const register = useDownloadQueue((s) => s.register)
  const [windowId, setWindowId] = useState<RankedWindowId>('week')
  const [refreshSignal, setRefreshSignal] = useState(0)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historySignal, setHistorySignal] = useState(0)
  const [cardStates, setCardStates] = useState<Record<string, CardState>>({})
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [downloadedTick, setDownloadedTick] = useState(0)
  const runRef = useRef(0)
  const lastRefreshRef = useRef(refreshSignal)

  const win: RankedWindow =
    RANKED_WINDOWS.find((w) => w.id === windowId) ?? RANKED_WINDOWS[0]

  // Cards for the current window, fixed at window change; the
  // rolling week card's end is the visit time, and the DB key
  // stays stable within the visit. (The visit time is frozen in
  // state so the memo stays pure — see the oxlint purity rule.)
  const [visitMs] = useState(() => Date.now())
  const cards = useMemo(() => rankedCardsForWindow(windowId, visitMs), [windowId, visitMs])

  // DB-first load + sequential background compiles (batch AN).
  useEffect(() => {
    const run = ++runRef.current
    const isRefreshRun = refreshSignal !== lastRefreshRef.current
    lastRefreshRef.current = refreshSignal
    setCardStates(Object.fromEntries(cards.map((c) => [c.period, { ...EMPTY_CARD_STATE }])))
    let cancelled = false
    void (async () => {
      const nowMs = Date.now()
      const reads = await Promise.all(
        cards.map((c) => loadStoredCompilation(supabase, mode, c.granularity, c.period)),
      )
      if (cancelled || runRef.current !== run) return
      const queue: RankedPeriodCard[] = []
      const next: Record<string, CardState> = {}
      cards.forEach((c, i) => {
        const stored = reads[i]
        if (stored && isUnreachableCompilation(stored.compilation)) {
          // §AO: unreachable — hide the card and never recompile
          // it (its interval only gets older). The stored empty
          // result is what makes the hide stick across visits.
          next[c.period] = {
            compilation: stored.compilation,
            compiling: false,
            error: null,
            stale: false,
            hidden: true,
          }
        } else if (
          stored &&
          !isRefreshRun &&
          isCompilationFresh(stored.compiledAtMs, c.window.ttlMs, nowMs)
        ) {
          next[c.period] = {
            compilation: stored.compilation,
            compiling: false,
            error: null,
            stale: false,
            hidden: false,
          }
        } else if (stored) {
          next[c.period] = {
            compilation: stored.compilation,
            compiling: true,
            error: null,
            stale: true,
            hidden: false,
          }
          queue.push(c)
        } else {
          next[c.period] = { compilation: null, compiling: true, error: null, stale: false, hidden: false }
          queue.push(c)
        }
      })
      setCardStates(next)
      // One card at a time: a cold month/year visit compiles up
      // to 12 lists, and 12 parallel scans would hammer the proxy.
      for (const card of queue) {
        if (cancelled || runRef.current !== run) return
        try {
          const compiled = await compileCardCompilation(mode, card, {
            now: nowMs,
            fresh: isRefreshRun,
          })
          if (cancelled || runRef.current !== run) return
          void storeCompilation(supabase, mode, card.granularity, card.period, compiled, Date.now())
          if (cancelled || runRef.current !== run) return
          setCardStates((prev) => ({
            ...prev,
            [card.period]: {
              compilation: compiled,
              compiling: false,
              error: null,
              stale: false,
              // §AO: a compile that found nothing with the scan
              // stopped early hides the card (the stored empty
              // result keeps it hidden on the next visit too).
              hidden: isUnreachableCompilation(compiled),
            },
          }))
        } catch {
          if (cancelled || runRef.current !== run) return
          setCardStates((prev) => {
            const cur = prev[card.period]
            if (cur?.compilation) return { ...prev, [card.period]: { ...cur, compiling: false } }
            return {
              ...prev,
              [card.period]: {
                compilation: null,
                compiling: false,
                error: RANKED_CARD_COMPILE_ERROR,
                stale: false,
                hidden: false,
              },
            }
          })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mode, windowId, refreshSignal, cards])

  // The week view is the single 'current' card rendered as rows.
  const weekState = windowId === 'week' ? cardStates['current'] : undefined
  const weekCompilation = weekState?.compilation ?? null
  const weekLoading = weekState ? weekState.compiling && !weekState.compilation : true
  const weekError = weekState?.error ?? null
  const anyCompiling = Object.values(cardStates).some((s) => s.compiling)
  // §AO: unreachable cards never render — the grid shows only
  // what the scan could actually reach.
  const visibleCards = cards.filter((c) => !(cardStates[c.period]?.hidden ?? false))

  useEffect(() => {
    setSaveMessage(null)
    setSaveError(null)
  }, [mode, windowId])

  const saveAsList = useCallback(async () => {
    if (!user || !weekCompilation || saving) return
    setSaving(true)
    setSaveMessage(null)
    setSaveError(null)
    try {
      const result = await saveCompilationAsList(supabase, user.id, {
        name: rankedListName(mode, win),
        mode,
        entries: weekCompilation.entries,
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
  }, [user, weekCompilation, saving, mode, win])

  // Re-read on tick so rows show the downloaded state after a
  // download (same pattern as Beatmaps).
  void downloadedTick
  const downloaded = seenStore.load(seenKeyValue).downloaded
  const entries = weekCompilation?.entries ?? []

  // Batched row state (batch 11, part 5): one feedback query for
  // the global mode + one batched containment lookup, passed to
  // the rows — rows never query per row.
  const rowMaps = useRowMaps({
    userId: user?.id,
    canRate: caps.canRate,
    canSave: caps.canSave,
    feedbackMode: mode,
    beatmapsetIds: entries.map((e) => e.candidate.beatmapsetId),
  })

  // Download all (batch 11, part 7): every entry through the
  // dock register, staggered — see lib/bulkDownload.ts. A
  // pending run is cancelled when the mode/window changes or
  // the section unmounts, so a stale run never downloads the
  // previous window's list.
  const bulkCancelRef = useRef<(() => void) | null>(null)
  const [bulkActive, setBulkActive] = useState(false)
  useEffect(
    () => () => {
      bulkCancelRef.current?.()
      bulkCancelRef.current = null
    },
    [mode, windowId],
  )
  const downloadAllRanked = () => {
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
        seenKeyValue,
        noVideo,
        onSettled: () => {
          setBulkActive(false)
          bulkCancelRef.current = null
        },
      },
    )
  }

  return (
    <section className="flex flex-col gap-space-md" aria-label="Ranked lists">
      <div className="flex flex-col gap-space-xs">
        <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span>
          <span>Ranked Lists</span>
          <span className="text-outline-variant">•</span>
          <span>Stored in the database</span>
        </div>
        <h2 className="font-headline-sm text-headline-sm text-on-surface">
          Top 50 Ranked — {modeLabel(mode)}
        </h2>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          The most-played maps ranked in the selected period — newest-ranked first, then ordered
          by play count. Lists are compiled from osu! search and stored in the database, so a
          second visit loads instantly; stale ones refresh in the background. Follows your
          current mode ({modeLabel(mode)}); switch modes to see that mode&apos;s lists. This week
          is one list; the last 4 weeks are 4 cards and the last 12 months are 12 cards — open a
          card to see its songs. Cards the scan cannot reach are hidden instead of shown empty,
          and past periods live under History.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-space-md">
        <div
          className="inline-flex items-center gap-1 p-1 rounded-full bg-surface-container-low"
          role="tablist"
          aria-label="Ranked list window"
        >
          {RANKED_WINDOWS.map((w) => (
            <button
              key={w.id}
              role="tab"
              aria-selected={w.id === windowId && !historyOpen}
              className={`px-space-md py-1.5 rounded-full font-label-md text-label-md transition-all ${
                w.id === windowId && !historyOpen
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
              type="button"
              onClick={() => {
                setHistoryOpen(false)
                setWindowId(w.id)
              }}
            >
              {w.tabLabel}
            </button>
          ))}
          <button
            role="tab"
            aria-selected={historyOpen}
            className={`px-space-md py-1.5 rounded-full font-label-md text-label-md transition-all ${
              historyOpen
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
            type="button"
            onClick={() => setHistoryOpen(true)}
          >
            History
          </button>
        </div>
        <button
          className="flex items-center gap-1.5 px-space-md py-2 rounded-full bg-surface-container-high text-on-surface font-label-md text-label-md hover:bg-surface-container-highest transition-all disabled:opacity-60"
          type="button"
          disabled={anyCompiling}
          onClick={() => {
            setRefreshSignal((n) => n + 1)
            setHistorySignal((n) => n + 1)
          }}
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          <span>Refresh</span>
        </button>
        {windowId === 'week' && !historyOpen && (
          <>
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
              disabled={weekLoading || bulkActive || entries.length === 0}
              onClick={downloadAllRanked}
              aria-label={`Download all ${entries.length} ranked maps`}
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              <span>{bulkActive ? 'Queuing downloads…' : `Download all (${entries.length})`}</span>
            </button>
          </>
        )}
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

      {historyOpen && <RankedHistoryList mode={mode} signal={historySignal} />}

      {!historyOpen && windowId === 'week' && (
        <>
          {weekLoading && (
            <LoadingState label={`Compiling the top 50 Ranked ${modeLabel(mode)} maps…`} />
          )}
          {weekError && !weekLoading && (
            <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
              <p className="font-body-sm text-body-sm text-error">{weekError}</p>
              <button
                className="px-space-md py-2 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md flex-shrink-0"
                type="button"
                onClick={() => setRefreshSignal((n) => n + 1)}
              >
                Retry
              </button>
            </div>
          )}
          {!weekLoading && !weekError && weekCompilation && weekCompilation.entries.length === 0 && (
            <div className="p-space-md rounded-lg bg-surface-container-low">
              <p className="font-body-md text-body-md text-on-surface-variant">
                No maps were ranked in this window for {modeLabel(mode)} yet.
              </p>
            </div>
          )}
          {!weekLoading && !weekError && weekCompilation && weekCompilation.partial && entries.length > 0 && (
            <div className="p-space-md rounded-lg bg-surface-container-low">
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Partial list — the scan stopped early before reaching the start of this window, so
                this may not be the full top 50. Refresh to try the full scan again.
              </p>
            </div>
          )}
          {!weekLoading && !weekError && weekState?.stale && entries.length > 0 && (
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Showing the stored list — updating in the background…
            </p>
          )}
          {!weekLoading && !weekError && entries.length > 0 && (
            <div className="flex flex-col gap-3">
              {entries.map((entry) => (
                <BeatmapRow
                  key={entry.candidate.beatmapsetId}
                  candidate={entry.candidate}
                  mode={mode}
                  seenKeyValue={seenKeyValue}
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
        </>
      )}
      {!historyOpen && windowId !== 'week' && (
        <>
          {visibleCards.length === 0 && !anyCompiling ? (
            <div className="p-space-md rounded-lg bg-surface-container-low">
              <p className="font-body-md text-body-md text-on-surface-variant">
                No ranked collections in reach for {modeLabel(mode)} — the scan only reaches
                back a few weeks from today, so periods it cannot reach are hidden instead of
                shown empty. Older periods appear under History once they have been compiled.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-md">
              {visibleCards.map((card) => (
                <RankedCardTile
                  key={card.period}
                  card={card}
                  state={cardStates[card.period] ?? { ...EMPTY_CARD_STATE }}
                  onOpen={() =>
                    navigate(`/collections/ranked/${mode}/${card.granularity}/${card.period}`)
                  }
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** Bulk pack-download progress (local shape: counts of sets, not
 *  bytes — downloadQueue's DownloadProgress is per-row byte counts). */
interface PackDownloadProgress {
  active: boolean
  done: number
  total: number
  copied: number
  label: string
}

function CollectionsReal() {
  const { tier } = useAuth()
  const guestSession = useGuestStore((s) => s.session)
  const noVideo = useDownloadSettings((s) => s.noVideo)
  const globalMode = useModeStore((s) => s.mode)
  const [packs, setPacks] = useState<BeatmapPack[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [packErrors, setPackErrors] = useState<Record<string, string>>({})
  const [progress, setProgress] = useState<PackDownloadProgress | null>(null)
  const [visibleCount, setVisibleCount] = useState(PACKS_PAGE_SIZE)
  const [expandedTag, setExpandedTag] = useState<string | null>(null)
  const [detailLoadingTag, setDetailLoadingTag] = useState<string | null>(null)
  const [packType, setPackType] = useState<PackCategory>('standard')
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const cancelRef = useRef(false)
  const runRef = useRef(0)

  const username = guestSession?.osuUsername ?? null
  const key = seenKey(tier, username ?? 'collections')

  const load = useCallback(async (fresh: boolean, type: PackCategory) => {
    const run = ++runRef.current
    setLoading(true)
    setError(null)
    try {
      const { packs: list, cursor } = await fetchBeatmapPacksPage({ type, fresh })
      if (runRef.current !== run) return
      setPacks(list)
      setNextCursor(cursor)
      setVisibleCount(PACKS_PAGE_SIZE)
      setExpandedTag(null)
      setDetailLoadingTag(null)
    } catch (err) {
      if (runRef.current !== run) return
      // A 400 here is the OLD deployed Edge Function: it does not know
      // the pack actions yet (it demands `mode` for every action).
      // Name the one command that fixes it; anything else keeps the
      // generic busy message instead of blaming the deploy.
      const isOldFunction =
        err instanceof OsuServiceError && err.status === 400
      setError(
        isOldFunction
          ? 'Live packs need the Edge Function redeployed: supabase functions deploy osu-proxy --no-verify-jwt'
          : 'Could not load beatmap packs just now — osu! or the proxy may be busy.',
      )
    } finally {
      if (runRef.current === run) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(false, packType)
  }, [load, packType])

  /** "Show more": when the last fetch returned a cursor, load the
   * next cursor page (it extends the buffer); otherwise reveal the
   * next 12 buffered items. Never a fake "more". */
  const loadMore = useCallback(async () => {
    if (loadingMore) return
    if (!nextCursor) {
      setVisibleCount((c) => c + PACKS_PAGE_SIZE)
      return
    }
    const run = ++runRef.current
    setLoadingMore(true)
    try {
      const { packs: merged, cursor } = await fetchBeatmapPacksPage({
        type: packType,
        cursor: nextCursor,
      })
      if (runRef.current !== run) return
      setPacks(merged)
      setNextCursor(cursor)
    } catch {
      if (runRef.current !== run) return
      setError('Could not load more packs just now — try again in a moment.')
    } finally {
      if (runRef.current === run) setLoadingMore(false)
    }
  }, [loadingMore, nextCursor, packType])

  /** Fill a pack's beatmapset ids via the detail endpoint when the list didn't carry them. */
  const ensurePackDetail = useCallback(async (pack: BeatmapPack): Promise<BeatmapPack> => {
    if (pack.beatmapsetIds.length > 0) return pack
    const full = await fetchBeatmapPack(pack.tag)
    if (full && full.beatmapsetIds.length > 0) {
      setPacks((prev) =>
        prev.map((p) =>
          p.tag === pack.tag
            ? { ...p, beatmapsetIds: full.beatmapsetIds, setMeta: full.setMeta ?? p.setMeta }
            : p,
        ),
      )
      return { ...pack, beatmapsetIds: full.beatmapsetIds, setMeta: full.setMeta ?? pack.setMeta }
    }
    return pack
  }, [])

  const downloadSets = useCallback(
    async (items: { id: number; artist: string; title: string }[], label: string) => {
      cancelRef.current = false
      setProgress({ active: true, done: 0, total: items.length, copied: 0, label })
      for (let i = 0; i < items.length; i += 1) {
        if (cancelRef.current) break
        const item = items[i]
        downloadManager.startDownload({
          beatmapsetId: item.id,
          seenKeyValue: key,
          noVideo,
        })
        // Songs-folder auto-copy (item 8): best-effort, counted
        // honestly — only a closed stream increments `copied`.
        const outcome = await attemptSongsCopy({
          beatmapsetId: item.id,
          artist: item.artist,
          title: item.title,
          noVideo,
        })
        setProgress((p) =>
          p ? { ...p, done: i + 1, copied: p.copied + (outcome.status === 'copied' ? 1 : 0) } : p,
        )
        // Polite gap between handed-off downloads (bulk courtesy).
        await new Promise((r) => setTimeout(r, 250))
      }
      setProgress((p) => (p ? { ...p, active: false } : p))
    },
    [key, noVideo],
  )

  const packToItems = (pack: BeatmapPack): { id: number; artist: string; title: string }[] => {
    const meta = new Map((pack.setMeta ?? []).map((m) => [m.id, m]))
    return pack.beatmapsetIds.map((id) => ({
      id,
      artist: meta.get(id)?.artist ?? '',
      title: meta.get(id)?.title ?? '',
    }))
  }

  /** Expand a pack in place to list its contents (never a download). */
  const toggleView = useCallback(
    async (pack: BeatmapPack) => {
      if (expandedTag === pack.tag) {
        setExpandedTag(null)
        return
      }
      setExpandedTag(pack.tag)
      if (pack.beatmapsetIds.length > 0) return
      setDetailLoadingTag(pack.tag)
      try {
        await ensurePackDetail(pack)
      } catch {
        setPackErrors((prev) => ({
          ...prev,
          [pack.tag]: "This pack's contents could not be loaded — try again in a moment.",
        }))
      } finally {
        setDetailLoadingTag(null)
      }
    },
    [expandedTag, ensurePackDetail],
  )

  /** One set from an expanded pack, through the same sequential loop. */
  const downloadSet = useCallback(
    async (
      pack: BeatmapPack,
      item: { id: number; artist: string; title: string },
    ) => {
      if (progress?.active) return
      await downloadSets([item], pack.name)
    },
    [downloadSets, progress],
  )

  const downloadPack = useCallback(
    async (pack: BeatmapPack) => {
      if (progress?.active) return
      setPackErrors((prev) => {
        const next = { ...prev }
        delete next[pack.tag]
        return next
      })
      // The API's `url` field IS the pack's download URL (osu! API
      // docs, BeatmapPack object: "The download url of the beatmap
      // pack"), so Download opens the single archive in a new tab.
      // It is never fetched or iframed from here, and nothing is
      // recorded per set for an archive open.
      if (pack.url) {
        if (typeof globalThis.window !== 'undefined') {
          globalThis.window.open(pack.url, '_blank', 'noopener,noreferrer')
        }
        return
      }
      try {
        const full = await ensurePackDetail(pack)
        if (full.beatmapsetIds.length === 0) {
          setPackErrors((prev) => ({
            ...prev,
            [pack.tag]: "This pack's contents could not be loaded — try again in a moment.",
          }))
          return
        }
        await downloadSets(packToItems(full), pack.name)
      } catch {
        setPackErrors((prev) => ({
          ...prev,
          [pack.tag]: 'Download failed just now — the proxy or osu! may be busy.',
        }))
      }
    },
    [downloadSets, ensurePackDetail, progress],
  )

  // Packs render in chunks (batch 12, part 10): the buffered list is
  // never rendered whole. Packs follow the GLOBAL mode (§AQ item
  // 10: the section's own mode filter chips are removed) — the
  // list endpoint has no mode param; each pack's mode comes from
  // its `ruleset_id`, unknown modes always shown. "Show more"
  // loads the next cursor page while one exists, else reveals
  // the next buffered chunk.
  const filteredPacks = packs.filter((pack) => packVisibleForMode(pack, globalMode))
  const { visible: visiblePacks, remaining: remainingPacks } = paginatePackList(
    filteredPacks,
    visibleCount,
  )
  const canShowMore = nextCursor !== null || remainingPacks > 0
  const busy = progress?.active ?? false

  return (
    <div className="flex flex-col w-full gap-space-lg">
      <section className="flex flex-col gap-space-md">
        <div className="flex flex-col">
          <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm uppercase tracking-widest mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span>
            <span>Beatmap Packs</span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Collections</h1>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant -mt-1">
          Whole beatmap packs from osu!&apos;s public pack listing, in seven categories.
          View a pack to see its contents; Download opens the pack&apos;s archive, or downloads
          every map in it when no archive link is provided.
          The &quot;Download without video&quot; setting in Settings applies to per-map downloads here too.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-space-md">
        <div
          className="inline-flex flex-wrap items-center gap-1 p-1 rounded-full bg-surface-container-low"
          role="tablist"
          aria-label="Pack category"
        >
          {PACK_CATEGORIES.map((category) => (
            <button
              key={category}
              role="tab"
              aria-selected={category === packType}
              className={`px-space-md py-1.5 rounded-full font-label-md text-label-md transition-all ${
                category === packType
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
              type="button"
              onClick={() => setPackType(category)}
            >
              {PACK_CATEGORY_LABELS[category]}
            </button>
          ))}
        </div>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant -mt-1">
        Showing {PACK_CATEGORY_LABELS[packType]} packs for {modeLabel(globalMode)}. Packs with an
        unknown mode are always shown.
      </p>

      {progress && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md p-space-md rounded-lg bg-surface-container-low shadow-sm">
          <p className="font-body-sm text-body-sm text-on-surface">
            {progress.active ? 'Queuing downloads' : 'Queue finished'} — {progress.label}:{' '}
            {progress.done} of {progress.total} requested
            {progress.copied > 0 ? ` · ${progress.copied} copied to your Songs folder` : ''}
          </p>
          {progress.active && (
            <button
              className="px-space-md py-2 rounded-full bg-surface-container-high text-on-surface font-label-md text-label-md flex-shrink-0"
              type="button"
              onClick={() => {
                cancelRef.current = true
              }}
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {loading && <LoadingState label="Loading beatmap packs…" />}
      {error && !loading && (
        <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
          <p className="font-body-sm text-body-sm text-error">{error}</p>
          <button
            className="px-space-md py-2 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md flex-shrink-0"
            type="button"
            onClick={() => void load(true, packType)}
          >
            Retry
          </button>
        </div>
      )}
      {!loading && !error && packs.length === 0 && (
        <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
          <p className="font-body-md text-body-md text-on-surface-variant">
            osu! returned no packs right now. Try again in a moment.
          </p>
          <button
            className="px-space-md py-2 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md flex-shrink-0"
            type="button"
            onClick={() => void load(true, packType)}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && visiblePacks.length > 0 && (
        <div className="flex flex-col gap-3">
          {visiblePacks.map((pack) => (
            <PackCard
              key={pack.tag}
              pack={pack}
              onDownload={(p) => void downloadPack(p)}
              onToggleView={(p) => void toggleView(p)}
              onDownloadSet={(p, item) => void downloadSet(p, item)}
              expanded={expandedTag === pack.tag}
              detailLoading={detailLoadingTag === pack.tag}
              downloading={busy}
              error={packErrors[pack.tag] ?? null}
            />
          ))}
        </div>
      )}

      {!loading && !error && packs.length > 0 && visiblePacks.length === 0 && (
        <div className="p-space-md rounded-lg bg-surface-container-low">
          <p className="font-body-md text-body-md text-on-surface-variant">
            No {modeLabel(globalMode)} packs in the loaded {PACK_CATEGORY_LABELS[packType]} packs.
            Packs with an unknown mode are always shown, so this means every loaded pack
            belongs to another mode.
          </p>
        </div>
      )}

      {!loading && !error && canShowMore && (
        <div className="flex items-center justify-center">
          <button
            className="flex items-center gap-1.5 px-space-md py-2.5 rounded-full bg-surface-container-high text-on-surface font-label-md text-label-md hover:bg-surface-container-highest transition-all disabled:opacity-60"
            type="button"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            <span className="material-symbols-outlined text-[18px]">expand_more</span>
            <span>
              {loadingMore
                ? 'Loading…'
                : nextCursor
                  ? 'Show more packs'
                  : `Show more packs (${remainingPacks} more)`}
            </span>
          </button>
        </div>
      )}

      <RankedListsSection seenKeyValue={key} />

      {error && !loading && (
        <div className="mt-space-md">
          <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
            <p className="font-body-sm text-body-sm text-error">{error}</p>
            <button
              className="px-space-md py-2 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md flex-shrink-0"
              type="button"
              onClick={() => void load(true, packType)}
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Collections() {
  const { tier } = useAuth()
  const { username: sidebarName, pp: sidebarPp, avatarUrl: sidebarAvatarUrl } =
    useSidebarIdentity()
  const identity = {
    username: sidebarName ?? 'Loading…',
    pp: sidebarPp,
    avatarUrl: sidebarAvatarUrl ?? undefined,
    tierLabel: tier === 'account' ? 'account' : tier === 'guest' ? 'guest' : 'free tier',
  }
  if (!isProxyConfigured) {
    return (
      <AppShell identity={identity}>
        <div className="flex flex-col w-full gap-space-lg">
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Collections</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Real beatmap packs load once the osu! proxy is connected (see docs/M1-SETUP.md).
          </p>
        </div>
      </AppShell>
    )
  }
  return (
    <AppShell identity={identity}>
      <CollectionsReal />
    </AppShell>
  )
}
