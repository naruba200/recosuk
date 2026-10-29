import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import ExampleBlock from '../components/ExampleBlock'
import LoadingState from '../components/LoadingState'
import BeatmapRow from '../components/BeatmapRow'
import LockedButton from '../components/LockedButton'
import { isProxyConfigured, OsuServiceError } from '../lib/osu'
import { useAuth } from '../lib/auth'
import { useGuestStore } from '../lib/guestStore'
import { useDownloadSettings } from '../lib/downloadSettings'
import { downloadManager } from '../lib/downloadManager'
import { attemptSongsCopy } from '../lib/songCopy'
import { seenKey, seenStore } from '../lib/seenStore'
import { useModeStore } from '../lib/modeStore'
import { modeLabel } from '../lib/mode'
import { useCapabilities } from '../lib/capabilities'
import { supabase } from '../lib/supabase'
import {
  RANKED_WINDOWS,
  fetchRankedCompilation,
  rankedListName,
  saveCompilationAsList,
  type RankedCompilation,
  type RankedWindow,
  type RankedWindowId,
} from '../lib/rankedLists'
import {
  fetchBeatmapPack,
  fetchBeatmapPacks,
  groupPacks,
  PACK_PERIOD_LABELS,
  PACK_PERIOD_ORDER,
  type BeatmapPack,
  type PackPeriod,
} from '../lib/packs'

/**
 * Collections (QA batch 2, item 6): beatmap PACKS grouped Weekly /
 * Monthly / Yearly, BeatConnect-style. The packs themselves come
 * from osu!'s public beatmap-packs API via the proxy (see lib/packs.ts
 * for the source-honesty notes) — never fabricated. Each pack
 * downloads through the same native browser-download path as Mirror,
 * and "Download all" queues packs sequentially with a polite gap
 * between requests.
 *
 * The Song-folder copy step (item 8) plugs in through the optional
 * `copySet` seam on the download loop: when the user has auto-copy
 * on, each set is ALSO written into their picked Songs folder.
 * Without it, downloads are browser-only, exactly like Mirror.
 */

const SAMPLE_PACKS: { name: string; tag: string; period: PackPeriod; sets: number }[] = [
  { name: 'Weekly Beatmap Pack (example)', tag: 'weekly-example', period: 'weekly', sets: 42 },
  { name: 'Monthly Beatmap Pack (example)', tag: 'monthly-example', period: 'monthly', sets: 187 },
  { name: 'Yearly Beatmap Pack (example)', tag: 'yearly-example', period: 'yearly', sets: 1240 },
]

function SamplePacks() {
  return (
    <ExampleBlock note="Example packs — sample entries showing the layout, not real packs.">
      <div className="flex flex-col gap-3">
        {SAMPLE_PACKS.map((pack) => (
          <article
            key={pack.tag}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md p-space-md bg-surface-container-low rounded-lg shadow-sm"
          >
            <div className="flex flex-col min-w-0">
              <span className="font-headline-sm text-headline-sm text-on-surface truncate">{pack.name}</span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                {PACK_PERIOD_LABELS[pack.period]} · {pack.sets} beatmapsets
              </span>
            </div>
            <button
              className="px-space-md py-2 rounded-full bg-surface-container-high text-on-surface-variant font-label-md text-label-md flex-shrink-0"
              type="button"
              disabled
            >
              Download (example)
            </button>
          </article>
        ))}
      </div>
    </ExampleBlock>
  )
}

interface DownloadProgress {
  active: boolean
  done: number
  total: number
  copied: number
  label: string
}

function PackCard({
  pack,
  onDownload,
  downloading,
  error,
}: {
  pack: BeatmapPack
  onDownload: (pack: BeatmapPack) => void
  downloading: boolean
  error: string | null
}) {
  return (
    <article className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md p-space-md bg-surface-container-low hover:bg-surface-container transition-all rounded-lg shadow-sm">
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-headline-sm text-headline-sm text-on-surface truncate">{pack.name}</span>
          {pack.date && (
            <span className="font-label-sm text-label-sm text-on-surface-variant">{pack.date}</span>
          )}
        </div>
        <span className="font-body-sm text-body-sm text-on-surface-variant">
          {pack.beatmapsetIds.length > 0
            ? `${pack.beatmapsetIds.length} beatmapsets`
            : 'Contents load when you download'}
          {pack.url ? (
            <>
              {' · '}
              <a
                className="text-primary hover:underline"
                href={pack.url}
                target="_blank"
                rel="noreferrer"
              >
                View pack
              </a>
            </>
          ) : null}
        </span>
        {error && <span className="font-body-sm text-body-sm text-error">{error}</span>}
      </div>
      <button
        className="flex items-center gap-1.5 px-space-md py-2 rounded-full bg-primary text-on-primary font-label-md text-label-md shadow-md hover:bg-primary-container hover:text-on-primary-container active:scale-95 transition-all flex-shrink-0 disabled:opacity-60"
        type="button"
        disabled={downloading}
        onClick={() => onDownload(pack)}
      >
        <span className="material-symbols-outlined text-[18px]">download</span>
        <span>{downloading ? 'Queuing…' : 'Download'}</span>
      </button>
    </article>
  )
}

/**
 * Ranked compilation lists (batch 9): the top 50 most-played maps
 * ranked inside the selected window, compiled live from osu!
 * search. One list per mode, following the GLOBAL mode state
 * (no mode tabs inside the section). All rows are live data —
 * never sample entries. "Save as list" stores the whole 50 as
 * one M5 user list (account-only; guests see the locked state).
 */
function RankedListsSection({ seenKeyValue }: { seenKeyValue: string }) {
  const mode = useModeStore((s) => s.mode)
  const { user } = useAuth()
  const caps = useCapabilities()
  const navigate = useNavigate()
  const [windowId, setWindowId] = useState<RankedWindowId>('week')
  const [compilation, setCompilation] = useState<RankedCompilation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [downloadedTick, setDownloadedTick] = useState(0)
  const runRef = useRef(0)

  const win: RankedWindow =
    RANKED_WINDOWS.find((w) => w.id === windowId) ?? RANKED_WINDOWS[0]

  const load = useCallback(
    async (fresh: boolean) => {
      const run = ++runRef.current
      setLoading(true)
      setError(null)
      try {
        const compiled = await fetchRankedCompilation(mode, win, { fresh })
        if (runRef.current !== run) return
        setCompilation(compiled)
      } catch {
        if (runRef.current !== run) return
        setError('Could not compile the ranked list just now — osu! or the proxy may be busy.')
      } finally {
        if (runRef.current === run) setLoading(false)
      }
    },
    [mode, win],
  )

  useEffect(() => {
    void load(false)
  }, [load])

  useEffect(() => {
    setSaveMessage(null)
    setSaveError(null)
  }, [mode, windowId])

  const saveAsList = useCallback(async () => {
    if (!user || !compilation || saving) return
    setSaving(true)
    setSaveMessage(null)
    setSaveError(null)
    try {
      const result = await saveCompilationAsList(supabase, user.id, {
        name: rankedListName(mode, win),
        mode,
        entries: compilation.entries,
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
  }, [user, compilation, saving, mode, win])

  // Re-read on tick so rows show the downloaded state after a
  // download (same pattern as Mirror).
  void downloadedTick
  const downloaded = seenStore.load(seenKeyValue).downloaded
  const entries = compilation?.entries ?? []

  return (
    <section className="flex flex-col gap-space-md" aria-label="Ranked lists">
      <div className="flex flex-col gap-space-xs">
        <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span>
          <span>Ranked Lists</span>
          <span className="text-outline-variant">•</span>
          <span>Live from osu!</span>
        </div>
        <h2 className="font-headline-sm text-headline-sm text-on-surface">
          Top 50 Ranked — {modeLabel(mode)}
        </h2>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          The most-played maps ranked in the selected window, compiled live from osu! search —
          newest-ranked first, then ordered by play count. Follows your current mode (
          {modeLabel(mode)}); switch modes to see that mode&apos;s list.
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
              aria-selected={w.id === windowId}
              className={`px-space-md py-1.5 rounded-full font-label-md text-label-md transition-all ${
                w.id === windowId
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
              type="button"
              onClick={() => setWindowId(w.id)}
            >
              {w.tabLabel}
            </button>
          ))}
        </div>
        <button
          className="flex items-center gap-1.5 px-space-md py-2 rounded-full bg-surface-container-high text-on-surface font-label-md text-label-md hover:bg-surface-container-highest transition-all disabled:opacity-60"
          type="button"
          disabled={loading}
          onClick={() => void load(true)}
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

      {loading && <LoadingState label={`Compiling the top 50 Ranked ${modeLabel(mode)} maps…`} />}
      {error && !loading && (
        <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
          <p className="font-body-sm text-body-sm text-error">{error}</p>
          <button
            className="px-space-md py-2 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md flex-shrink-0"
            type="button"
            onClick={() => void load(true)}
          >
            Retry
          </button>
        </div>
      )}
      {!loading && !error && compilation && compilation.entries.length === 0 && (
        <div className="p-space-md rounded-lg bg-surface-container-low">
          <p className="font-body-md text-body-md text-on-surface-variant">
            No maps were ranked in this window for {modeLabel(mode)} yet.
          </p>
        </div>
      )}
      {!loading && !error && compilation && compilation.partial && entries.length > 0 && (
        <div className="p-space-md rounded-lg bg-surface-container-low">
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Partial list — the scan stopped early before reaching the start of this window, so
            this may not be the full top 50. Refresh to try the full scan again.
          </p>
        </div>
      )}
      {!loading && !error && entries.length > 0 && (
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
            />
          ))}
        </div>
      )}
    </section>
  )
}

function CollectionsReal() {
  const { tier } = useAuth()
  const guestSession = useGuestStore((s) => s.session)
  const noVideo = useDownloadSettings((s) => s.noVideo)
  const [packs, setPacks] = useState<BeatmapPack[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [packErrors, setPackErrors] = useState<Record<string, string>>({})
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const cancelRef = useRef(false)
  const runRef = useRef(0)

  const username = guestSession?.osuUsername ?? null
  const key = seenKey(tier, username ?? 'collections')

  const load = useCallback(async (fresh: boolean) => {
    const run = ++runRef.current
    setLoading(true)
    setError(null)
    try {
      const list = await fetchBeatmapPacks({ fresh })
      if (runRef.current !== run) return
      setPacks(list)
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
    void load(false)
  }, [load])

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

  const downloadPack = useCallback(
    async (pack: BeatmapPack) => {
      if (progress?.active) return
      setPackErrors((prev) => {
        const next = { ...prev }
        delete next[pack.tag]
        return next
      })
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

  const downloadAll = useCallback(
    async (list: BeatmapPack[], label: string) => {
      if (progress?.active || list.length === 0) return
      cancelRef.current = false
      const byId = new Map<number, { id: number; artist: string; title: string }>()
      for (const pack of list) {
        const full = await ensurePackDetail(pack)
        for (const item of packToItems(full)) {
          if (!byId.has(item.id)) byId.set(item.id, item)
        }
        if (cancelRef.current) break
      }
      if (byId.size === 0) {
        setError('None of these packs exposed downloadable contents just now — try again in a moment.')
        return
      }
      await downloadSets([...byId.values()], label)
    },
    [downloadSets, ensurePackDetail, progress],
  )

  const grouped = groupPacks(packs)
  const visiblePacks = PACK_PERIOD_ORDER.flatMap((period) => grouped[period])
  const busy = progress?.active ?? false

  return (
    <div className="flex flex-col w-full gap-space-lg">
      <section className="flex flex-col gap-space-md">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
          <div className="flex flex-col">
            <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm uppercase tracking-widest mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span>
              <span>Beatmap Packs</span>
              <span className="text-outline-variant">•</span>
              <span>Bulk Downloads</span>
            </div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Collections</h1>
          </div>
          <button
            className="flex items-center gap-1.5 px-space-md py-2.5 rounded-full bg-primary text-on-primary font-label-md text-label-md shadow-md hover:bg-primary-container hover:text-on-primary-container active:scale-95 transition-all disabled:opacity-60 flex-shrink-0"
            type="button"
            disabled={busy || visiblePacks.length === 0}
            onClick={() => void downloadAll(visiblePacks, 'All visible packs')}
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            <span>Download all visible packs</span>
          </button>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant -mt-1">
          Whole beatmap packs — weekly, monthly and yearly — from osu!&apos;s public pack listing.
          Downloading a pack hands every set to your browser&apos;s download manager, one at a time.
          The &quot;Download without video&quot; setting in Settings applies here too.
        </p>
      </section>

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
            onClick={() => void load(true)}
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
            onClick={() => void load(true)}
          >
            Retry
          </button>
        </div>
      )}

      {!loading &&
        PACK_PERIOD_ORDER.map((period) => {
          const list = grouped[period]
          if (list.length === 0) return null
          return (
            <section key={period} className="flex flex-col gap-space-md">
              <div className="flex items-center justify-between gap-space-md">
                <h2 className="font-headline-sm text-headline-sm text-on-surface">
                  {PACK_PERIOD_LABELS[period]}
                </h2>
                <button
                  className="flex items-center gap-1.5 px-space-md py-2 rounded-full bg-surface-container-high text-on-surface font-label-md text-label-md hover:bg-surface-container-highest transition-all disabled:opacity-60"
                  type="button"
                  disabled={busy}
                  onClick={() => void downloadAll(list, PACK_PERIOD_LABELS[period])}
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  <span>Download all ({list.length} packs)</span>
                </button>
              </div>
              <div className="flex flex-col gap-3">
                {list.map((pack) => (
                  <PackCard
                    key={pack.tag}
                    pack={pack}
                    onDownload={(p) => void downloadPack(p)}
                    downloading={busy}
                    error={packErrors[pack.tag] ?? null}
                  />
                ))}
              </div>
            </section>
          )
        })}

      <RankedListsSection seenKeyValue={key} />

      {error && !loading && (
        <div className="mt-space-md">
          <SamplePacks />
        </div>
      )}
    </div>
  )
}

export default function Collections() {
  const { tier, guestSession } = useAuth()
  const identity = {
    username: guestSession?.osuUsername ?? 'Guest',
    pp: 0,
    tierLabel: tier === 'account' ? 'account' : tier === 'guest' ? 'guest' : 'free tier',
  }
  if (!isProxyConfigured) {
    return (
      <AppShell identity={identity}>
        <div className="flex flex-col w-full gap-space-lg">
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Collections</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Real beatmap packs load once the osu! proxy is connected (see docs/M1-SETUP.md).
            Until then, here is how the page looks:
          </p>
          <SamplePacks />
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
