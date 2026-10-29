import { create } from 'zustand'
import {
  createDownloadManager,
  DISPLAY_MIRROR_ORDER,
  DISPLAY_MIRROR_ORDER_NO_VIDEO,
  NATIVE_MIRROR_ORDER,
  NATIVE_MIRROR_ORDER_NO_VIDEO,
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
 * Attempts are tracked per row in `triedMirrorIds`. Exception
 * (batch 13): a Retry while the row's current step is official
 * re-attempts official in a NEW TAB (see retryTarget) — the
 * visible fallback for the official iframe's silent failure
 * when the user is signed out of osu!. The tab is never used on
 * a first attempt.
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
   * 'official' is preserved: the first attempt hands the official
   * URL to the browser via the SAME hidden-iframe handoff as the
   * native mirrors (no new tab, no redirect) — the browser's osu!
   * session does the auth. Only a later Retry on that row opens
   * the official page in a new tab (see retryTarget). */
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
   * Injected in tests. Used ONLY for the Retry tab fallback (see
   * retryTarget): the first attempt for official uses the iframe
   * handoff like every other mirror, never a tab. */
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

/** The mirror order a row cycles through: catboy first when
 * no-video is on (only its no-video URL form is verified), the
 * default order otherwise — exactly as startDownload picks. */
export function mirrorOrderFor(noVideo: boolean): readonly string[] {
  return noVideo ? NATIVE_MIRROR_ORDER_NO_VIDEO : NATIVE_MIRROR_ORDER
}

/**
 * The display order a row's Retry cycles through (batch 12, part
 * 9): osu! official FIRST, then the native mirrors in their usual
 * order, wrapping to official after the last native mirror. Every
 * step uses the iframe handoff — including official, on the
 * first attempt of that step (batch 13); only a Retry while the
 * row's current step is official re-attempts official in a new
 * tab (see retryTarget).
 */
export function displayOrderFor(noVideo: boolean): readonly string[] {
  return noVideo ? DISPLAY_MIRROR_ORDER_NO_VIDEO : DISPLAY_MIRROR_ORDER
}

/**
 * The mirror a Retry of this row would hand off to: the next
 * mirror in the DISPLAY order (official first, then the native
 * mirrors — see displayOrderFor) after the last attempted one,
 * wrapping to the start after the last mirror. An explicit pick
 * counts as the first attempt, so a retry after it advances to
 * the next mirror in the same order. A last attempt outside the
 * order (or none yet) restarts at the first mirror (official).
 * NOTE (batch 13): this is the cycle order only — the actual
 * Retry target comes from retryTarget, which re-attempts
 * official in a new tab instead of advancing when the row's
 * current step is official and its tab fallback is unused.
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

/**
 * What a Retry click on this row would actually do (batch 13):
 * the mirror it hands off to, and whether that handoff opens a
 * new tab instead of the iframe.
 *
 * The official step is first attempted via the hidden-iframe
 * handoff like every other mirror — no redirect, no new tab —
 * using the browser's osu! session. If the user is NOT signed
 * into osu! in that browser, the iframe fails SILENTLY: the
 * download is cross-origin, so the page cannot observe the
 * failure (no error, no status change — the row still reads
 * "Downloading"). The visible escape hatch is Retry: while the
 * row's current step is official and its tab fallback has not
 * been used yet, Retry re-attempts official in a NEW TAB, where
 * the user can sign in and the download starts.
 *
 * The tab fallback is tracked WITHOUT new state: a tab attempt
 * is recorded in `triedMirrorIds` as a second consecutive
 * 'official' entry (it IS an official attempt — first the
 * iframe, then the tab). Two consecutive 'official' entries
 * therefore mean the tab fallback was already used for this
 * official step, so the next Retry advances to the native
 * mirrors in display order. The display order holds 'official'
 * exactly once, so consecutive duplicates can only come from
 * this fallback — never from normal cycling. A later
 * wrap-around to official starts a fresh step (iframe first,
 * tab fallback available again).
 */
export function retryTarget(
  item: Pick<DownloadQueueItem, 'noVideo' | 'triedMirrorIds' | 'mirrorIdUsed' | 'mirrorId'>,
): { mirrorId: string; viaTab: boolean } {
  const tried = item.triedMirrorIds ?? []
  const last =
    tried.length > 0 ? tried[tried.length - 1] : (item.mirrorIdUsed ?? item.mirrorId)
  if (last === 'official') {
    const prev = tried.length >= 2 ? tried[tried.length - 2] : undefined
    if (prev !== 'official') return { mirrorId: 'official', viaTab: true }
  }
  return { mirrorId: nextRetryMirrorId(item), viaTab: false }
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
    // The target comes from retryTarget, not nextRetryMirrorId
    // alone: a Retry while the row's current step is official
    // re-attempts official in a new tab (the visible fallback
    // for a silent iframe failure); every other Retry advances
    // to the next mirror in display order.
    const target = retryTarget(item)
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
      target.mirrorId,
      target.viaTab,
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
 * Official (batch 13): the FIRST attempt for 'official' uses the
 * SAME hidden-iframe handoff as the native mirrors — navigating
 * a hidden iframe to the official download URL makes the browser
 * save the file without leaving the page, PROVIDED the user is
 * signed into osu! in that browser (the browser's osu! session
 * does the auth; the page never sees session cookies and must
 * not ask for them). If they are not signed in, the iframe
 * fails SILENTLY: the download is cross-origin, so the page
 * cannot observe the failure — the row keeps reading
 * "Downloading" and nothing visibly happens. The escape hatch
 * is Retry (see retryTarget): a Retry while the row's current
 * step is official opens the official page in a NEW TAB
 * (`viaTab`), where the user can sign in and the download
 * starts. The tab is NEVER used on a first attempt.
 * Either way, NO Songs-folder copy fetch runs for official:
 * the authed osu! origin is not fetchable from the page. The
 * row still records the attempt, so Retry can cycle on from
 * official to the native mirrors.
 */
function handOffAndCopy(
  item: DownloadQueueItem,
  mirrorOverride?: string,
  viaTab = false,
): void {
  const manager = createDownloadManager({
    startBrowserDownload: deps.startBrowserDownload,
    record: deps.record,
  })
  // A Retry passes the next mirror explicitly; the first attempt
  // uses the explicit pick (or Auto order[0]) as before.
  const effectiveMirrorId = mirrorOverride ?? item.mirrorId
  if (effectiveMirrorId === 'official' && viaTab) {
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
  if (effectiveMirrorId === 'official') {
    // First attempt: the hidden-iframe handoff, same mechanism
    // as the native mirrors (see downloadManager.startDownload).
    // Silent-failure caveat: see the comment above — if the user
    // is signed out of osu!, nothing visibly happens, and Retry
    // is the escape hatch (tab fallback via retryTarget).
    try {
      const result = manager.startDownload({
        beatmapsetId: item.beatmapsetId,
        mirrorId: 'official',
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
    }
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
