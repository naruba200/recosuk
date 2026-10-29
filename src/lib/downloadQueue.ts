import { create } from 'zustand'
import {
  createDownloadManager,
  resolveDisplayMirrorOrder,
  resolveNativeMirrorOrder,
  type DownloadManagerDeps,
} from './downloadManager'
import { getNoVideo } from './downloadSettings'
import { MIRRORS, mirrorById, recordDownload } from './mirrors'
import {
  attemptSongsCopy,
  type SongCopyDeps,
  type SongCopyRequest,
} from './songCopy'

/**
 * Browser-download register (batch 6, part 1): downloads go back to
 * the browser's native downloader — the hidden-iframe handoff from
 * batch 2/3, via downloadManager — and every click REGISTERS an
 * item in the bottom-right dock window, so the user can see what
 * was handed off, via which mirror, with no-video on or off, and
 * when, plus the outcome of the opt-in Songs-folder copy.
 *
 * There is deliberately NO in-app fetch, NO chunked fetch, and NO
 * Blob save for the download itself (the batch-4/5 queue worker is
 * gone): the browser's native downloader is the only mechanism,
 * and it reports no progress to the page, so dock rows show status
 * text only — never a percentage or a rate, never faked progress.
 *
 * The Songs-folder copy STILL fetches (plain single-stream, via
 * attemptSongsCopy): that fetch IS the copy, not the download —
 * the batch-2 design, unchanged. Its outcome shows on the row.
 * Collections bulk downloads never used this store (they use the
 * downloadManager loop directly) and are untouched.
 *
 * Retry (batch 8): the first attempt still uses order[0] (or the
 * explicit pick) with no automatic fallback — native downloads
 * report nothing back, so no fallback chain is possible there.
 * Retry is user-driven, not automatic: each Retry hands the set
 * off via the NEXT mirror in the same order (wrapping to the
 * start after the last), so re-firing the identical URL — a
 * no-op against a mirror that failed server-side — never happens.
 * Attempts are tracked per row in `triedMirrorIds`. Retry
 * advances to the NEXT mirror in the display order (official
 * first, then the natives), one entry per attempt.
 *
 * Official steps ALWAYS open in a new tab (batch 14, reverting
 * batch 13): the hidden-iframe handoff cannot carry the osu!
 * session — the browser withholds the session cookie on
 * cross-site iframe navigations (SameSite), osu! redirects the
 * frame to its homepage, and the homepage refuses framing
 * (X-Frame-Options: sameorigin). Live-verified 2026-10-29 with
 * a signed-in user: no download, console X-Frame-Options error.
 * A top-level tab navigation DOES send the cookie, so the tab
 * open is the only working official path.
 */

export type DownloadQueueStatus = 'browser' | 'failed'

export interface DownloadQueueItem {
  id: string
  beatmapsetId: number
  artist: string
  title: string
  seenKeyValue: string
  mirrorId?: string
  noVideo: boolean
  status: DownloadQueueStatus
  mirrorIdUsed: string | null
  /** Mirrors this row has been handed off to, in attempt order.
   * The first entry is the register attempt; each Retry appends
   * the next mirror in the order (see nextRetryMirrorId). */
  triedMirrorIds: string[]
  /** Songs-folder copy outcome for this item (only when auto-copy ran). */
  copied: 'copied' | 'failed' | 'skipped' | null
  note: string | null
  /** Epoch ms the download was registered (shown on the dock row). */
  at: number
}

export interface RegisterRequest {
  beatmapsetId: number
  artist: string
  title: string
  seenKeyValue: string
  /** Explicit mirror pick from the menu, or 'official' for the
   * primary (official-first) action. Omitted = Auto native order.
   * 'official' opens the official download URL in a NEW TAB
   * (batch 14): the hidden-iframe handoff cannot carry the osu!
   * session (X-Frame-Options + SameSite — live-verified failure
   * 2026-10-29), while a top-level tab navigation sends the
   * cookie. See handOffAndCopy. */
  mirrorId?: string
  noVideo?: boolean
}

export interface DownloadQueueDeps extends DownloadManagerDeps {
  /** Folder-write deps for the auto-copy (handle/permission/fetch). */
  folderDeps?: SongCopyDeps
  /** Clock for the registered time. Defaults to Date.now. */
  now?: () => number
  /** Opens the official osu! download in a new tab. Defaults to
   * `window.open` (guarded: no-ops without a window, e.g. tests).
   * Injected in tests. Used for EVERY official attempt (batch 14):
   * the iframe handoff cannot carry the osu! session, so the tab
   * open is the official path on first attempts and Retries alike. */
  openOfficial?: (url: string) => void
}

let deps: DownloadQueueDeps = {}
let idCounter = 0

/** Test/override hook: replace the register's collaborators. */
export function configureDownloadQueue(next: DownloadQueueDeps): void {
  deps = next
}

/** Test hook: clear items + register state between tests. */
export function resetDownloadQueue(): void {
  deps = {}
  idCounter = 0
  useDownloadQueue.setState({ items: [], dockOpen: false })
}

/** The mirror order a row cycles through: the resolved native
 * order (the user's Mirror Route Priority from Settings, or the
 * built-in default — catboy first when no-video is on, exactly
 * as startDownload picks). */
export function mirrorOrderFor(noVideo: boolean): readonly string[] {
  return resolveNativeMirrorOrder(noVideo)
}

/**
 * The display order a row's Retry cycles through (batch 12, part
 * 9): osu! official FIRST, then the native mirrors in the
 * resolved order, wrapping to official after the last native
 * mirror. Every step opens the official URL in a new tab (batch
 * 14); native steps use the iframe handoff.
 */
export function displayOrderFor(noVideo: boolean): readonly string[] {
  return resolveDisplayMirrorOrder(noVideo)
}

/**
 * The mirror a Retry of this row would hand off to: the next
 * mirror in the DISPLAY order (official first, then the native
 * mirrors — see displayOrderFor) after the last attempted one,
 * wrapping to the start after the last mirror. An explicit pick
 * counts as the first attempt, so a retry after it advances to
 * the next mirror in the same order. A last attempt outside the
 * order (or none yet) restarts at the first mirror (official).
 */
export function nextRetryMirrorId(
  item: Pick<DownloadQueueItem, 'noVideo' | 'triedMirrorIds' | 'mirrorIdUsed' | 'mirrorId'>,
): string {
  const order = displayOrderFor(item.noVideo)
  const tried = item.triedMirrorIds ?? []
  const last = tried.length > 0 ? tried[tried.length - 1] : (item.mirrorIdUsed ?? item.mirrorId)
  const idx = last ? order.indexOf(last) : -1
  return order[(idx + 1) % order.length]
}

interface DownloadQueueState {
  items: DownloadQueueItem[]
  dockOpen: boolean
  register: (req: RegisterRequest) => string
  retry: (id: string) => void
  clearFinished: () => void
  setDockOpen: (open: boolean) => void
}

export const useDownloadQueue = create<DownloadQueueState>()((set, get) => ({
  items: [],
  dockOpen: false,

  register: (req) => {
    const noVideo = req.noVideo ?? getNoVideo()
    const mirrorId = req.mirrorId ?? undefined
    const now = deps.now ?? Date.now
    const id = `dq-${++idCounter}-${req.beatmapsetId}-${now()}`
    const item: DownloadQueueItem = {
      id,
      beatmapsetId: req.beatmapsetId,
      artist: req.artist,
      title: req.title,
      seenKeyValue: req.seenKeyValue,
      mirrorId,
      noVideo,
      status: 'browser',
      mirrorIdUsed: null,
      triedMirrorIds: [],
      copied: null,
      note: null,
      at: now(),
    }
    set((s) => ({ items: [...s.items, item], dockOpen: true }))
    handOffAndCopy(item)
    return id
  },

  retry: (id) => {
    const item = get().items.find((i) => i.id === id)
    if (!item) return
    // Retry advances to the next mirror in display order
    // (official first, then natives, wrapping). An official step
    // opens in a new tab via handOffAndCopy, like a first attempt.
    const target = nextRetryMirrorId(item)
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id
          ? { ...i, status: 'browser' as const, mirrorIdUsed: null, copied: null, note: null }
          : i,
      ),
      dockOpen: true,
    }))
    handOffAndCopy(
      { ...item, status: 'browser', mirrorIdUsed: null, copied: null, note: null },
      target,
    )
  },

  clearFinished: () => {
    // Every row is a finished handoff record (native downloads
    // report nothing back), so clearing removes all rows. A
    // still-pending Songs-folder copy settles harmlessly: its
    // patch finds no row and is a no-op.
    set({ items: [] })
  },

  setDockOpen: (open) => set({ dockOpen: open }),
}))

function patchItem(id: string, patch: Partial<DownloadQueueItem>): void {
  useDownloadQueue.setState((s) => ({
    items: s.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  }))
}

/** Default official-tab opener: a real new tab, guarded for non-DOM runtimes. */
function defaultOpenOfficialTab(url: string): void {
  if (
    typeof globalThis.window !== 'undefined' &&
    typeof globalThis.window.open === 'function'
  ) {
    globalThis.window.open(url, '_blank', 'noopener,noreferrer')
  }
}

/**
 * Hand the set to the browser's native downloader (mirror order +
 * no-video setting exactly as in batch 2/3, recording included),
 * then run the opt-in Songs-folder copy in the background and patch
 * the row with its outcome. The copy's fetch is the copy itself —
 * plain single-stream via attemptSongsCopy, never the chunked path.
 *
 * Official (batch 14, reverting batch 13): EVERY official attempt
 * opens the official download URL in a NEW TAB via the injectable
 * `openOfficial` seam. The hidden-iframe handoff CANNOT work for
 * official: the browser withholds the osu! session cookie on
 * cross-site iframe navigations (SameSite), so osu! sees the
 * frame as logged out, redirects it to the homepage, and the
 * homepage refuses framing (X-Frame-Options: sameorigin) —
 * live-verified 2026-10-29 with a signed-in user (no download,
 * console X-Frame-Options error). A top-level tab navigation
 * DOES send the cookie, so the tab open is the only working
 * official path. The page never sees session cookies and must
 * not ask for them.
 * Either way, NO Songs-folder copy fetch runs for official:
 * the authed osu! origin is not fetchable from the page. The
 * row still records the attempt, so Retry can cycle on from
 * official to the native mirrors.
 */
function handOffAndCopy(item: DownloadQueueItem, mirrorOverride?: string): void {
  const manager = createDownloadManager({
    startBrowserDownload: deps.startBrowserDownload,
    record: deps.record,
  })
  // A Retry passes the next mirror explicitly; the first attempt
  // uses the explicit pick (or Auto order[0]) as before.
  const effectiveMirrorId = mirrorOverride ?? item.mirrorId
  // Official always opens in a new tab (batch 14): the iframe
  // handoff cannot carry the osu! session (see the comment above
  // handOffAndCopy). The tab opener is injectable for tests.
  if (effectiveMirrorId === 'official') {
    const openOfficial = deps.openOfficial ?? defaultOpenOfficialTab
    const url = mirrorById('official').url(item.beatmapsetId, {
      noVideo: item.noVideo,
    })
    try {
      openOfficial(url)
      const record = deps.record ?? recordDownload
      void record(item.seenKeyValue, item.beatmapsetId, 'official')
    } catch (err) {
      patchItem(item.id, {
        status: 'failed',
        note: err instanceof Error ? err.message : String(err),
      })
      return
    }
    patchItem(item.id, {
      status: 'browser',
      mirrorIdUsed: 'official',
      triedMirrorIds: [...(item.triedMirrorIds ?? []), 'official'],
    })
    return
  }
  try {
    const result = manager.startDownload({
      beatmapsetId: item.beatmapsetId,
      mirrorId: effectiveMirrorId,
      seenKeyValue: item.seenKeyValue,
      noVideo: item.noVideo,
    })
    patchItem(item.id, {
      status: 'browser',
      mirrorIdUsed: result.mirrorId,
      triedMirrorIds: [...(item.triedMirrorIds ?? []), result.mirrorId],
    })
  } catch (err) {
    patchItem(item.id, {
      status: 'failed',
      note: err instanceof Error ? err.message : String(err),
    })
    return
  }

  const copyRequest: SongCopyRequest = {
    beatmapsetId: item.beatmapsetId,
    artist: item.artist,
    title: item.title,
    noVideo: item.noVideo,
    mirrorId: effectiveMirrorId,
  }
  void attemptSongsCopy(copyRequest, deps.folderDeps ?? {})
    .then((outcome) =>
      patchItem(item.id, {
        copied: outcome.status,
        note:
          outcome.status === 'failed'
            ? `Songs-folder copy failed: ${outcome.reason}`
            : outcome.status === 'copied'
              ? 'Copied to your Songs folder.'
              : null,
      }),
    )
    .catch(() =>
      patchItem(item.id, { copied: 'failed', note: 'Songs-folder copy failed.' }),
    )
}

export function mirrorNameFor(id: string | null): string {
  if (!id) return ''
  return MIRRORS.find((m) => m.id === id)?.name ?? id
}
