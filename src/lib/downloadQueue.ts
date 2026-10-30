import { create } from 'zustand'
import {
  createDownloadManager,
  resolveDisplayMirrorOrder,
  resolveNativeMirrorOrder,
  type DownloadManagerDeps,
} from './downloadManager'
import { getNoVideo } from './downloadSettings'
import { MIRRORS, isFetchableMirror, mirrorById, recordDownload } from './mirrors'
import {
  downloadSetViaFetch,
  FetchDownloadError,
  type FetchDownloadProgress,
} from './fetchDownload'
import {
  attemptSongsCopy,
  copyBlobToSongsFolder,
  type SongCopyDeps,
  type SongCopyOutcome,
  type SongCopyRequest,
} from './songCopy'

/**
 * Download register (batch 6, part 1; fetch path batch AI):
 *
 * CORS-open mirrors (hinai, catboy, sayobot, nerinyan — see
 * FETCHABLE_MIRROR_IDS in mirrors.ts) are downloaded IN-PAGE:
 * the file is fetched, validated (2xx + PK zip magic), and saved
 * via a Blob, so the dock row shows REAL state — progress counted
 * off the wire, "Downloaded" on success, "Failed" with the reason
 * when every fetchable mirror fails. A failed mirror falls
 * through AUTOMATICALLY to the next fetchable mirror in the
 * resolved order (one try per mirror); recordDownload fires only
 * on actual success, never on click.
 *
 * BeatConnect + official stay on the old paths (fetch is blocked
 * for BeatConnect — it allows only one other origin — and official
 * needs a login): BeatConnect via the hidden-iframe handoff,
 * official in a new tab. Their rows say honestly that the
 * download was handed off but cannot be verified ("Downloading
 * (unverified)") — never a claim of success.
 *
 * The Songs-folder copy reuses the SAME bytes the fetch just
 * downloaded (no second fetch) when the download went through
 * the fetch path; the iframe path still fetches its own copy
 * (attemptSongsCopy), unchanged. Collections bulk downloads
 * never used this store (they use the downloadManager loop
 * directly) and are untouched.
 *
 * Retry (batch 8): user-driven, one mirror per click — each
 * Retry hands the set off via the NEXT mirror in the display
 * order (official first, then natives, wrapping). A Retry of a
 * fetch row aborts the in-flight fetch first, so a superseded
 * attempt can never land on the row. Attempts are tracked per
 * row in `triedMirrorIds`; the fetch chain appends every mirror
 * it tries, so Retry advances correctly after an automatic
 * fallthrough.
 *
 * Official steps ALWAYS open in a new tab (batch 14, reverting
 * batch 13): the hidden-iframe handoff cannot carry a session
 * cookie (SameSite). osu! sees the frame as logged out,
 * redirects it to the homepage, and the homepage refuses
 * framing (X-Frame-Options: sameorigin) — live-verified
 * 2026-10-29 with a signed-in user: no download, console
 * X-Frame-Options error. A top-level tab navigation DOES send
 * the session cookie, so the tab open is the only working path
 * for official.
 *
 * (BeatConnect's anonymous direct links separately have an
 * hourly per-IP limit + captcha — live-verified 2026-10-30:
 * when the limit is hit /b/{id} answers with an HTML page
 * instead of the file and the frame refuses it. There is no
 * in-page workaround: the dock Retry cycles to the next
 * mirror, and hinai — last in the native order — is the
 * fallback for exactly that case.)
 */

export type DownloadQueueStatus =
  | 'downloading'
  | 'downloaded'
  | 'browser'
  | 'failed'

export interface DownloadProgress {
  /** Bytes counted off the wire so far (real, never faked). */
  received: number
  /** Total bytes from Content-Length, or null when unknown. */
  total: number | null
}

export interface DownloadQueueItem {
  id: string
  beatmapsetId: number
  artist: string
  title: string
  seenKeyValue: string
  mirrorId?: string
  noVideo: boolean
  status: DownloadQueueStatus
  /** Real fetch progress (bytes counted off the wire); null
   * while no fetch is running or the total is unknown — the
   * dock must never show a faked percentage. */
  progress: DownloadProgress | null
  /** Attempt generation: bumped on every handOffAndCopy run so
   * async patches from a superseded attempt (aborted by Retry)
   * can never land on the row. */
  attemptToken: number
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
  /**
   * Fires exactly once when the row reaches a terminal state
   * ('downloaded', 'failed', or 'browser' — the iframe handoff
   * is terminal on handoff). Used by Download All to know when
   * a slot frees up; single downloads never pass it.
   */
  onSettled?: () => void
}

export interface DownloadQueueDeps extends DownloadManagerDeps {
  /** Folder-write deps for the auto-copy (handle/permission/fetch). */
  folderDeps?: SongCopyDeps
  /** Clock for the registered time. Defaults to Date.now. */
  now?: () => number
  /** Official-tab opener (batch 14). Defaults to `window.open`
   * (guarded: no-ops without a window, e.g. tests). Injected
   * in tests. Used for EVERY official attempt: the hidden-iframe
   * handoff cannot carry a session cookie (SameSite) — a
   * top-level tab navigation sends the cookie, so a signed-in
   * user downloads. Kept under the historical name
   * `openOfficial` so the existing call sites and tests need
   * no rename. */
  openOfficial?: (url: string) => void
  /** Fetch for the in-page download path (CORS-open mirrors).
   * Defaults to globalThis.fetch. Injected in tests. */
  fetchFn?: typeof fetch
  /** Save a fetched Blob to the Downloads folder. Defaults to
   * the anchor-click saver (fetchDownload). Injected in tests
   * (the node test environment has no document). */
  saveFile?: (blob: Blob, filename: string) => void
}

let deps: DownloadQueueDeps = {}
let idCounter = 0

/**
 * Per-item settle callbacks (RegisterRequest.onSettled) and
 * in-flight fetch controllers (aborted by Retry). Both are
 * keyed by row id and dropped when the row settles.
 */
const settleCallbacks = new Map<string, () => void>()
const fetchControllers = new Map<string, AbortController>()

/** Test/override hook: replace the register's collaborators. */
export function configureDownloadQueue(next: DownloadQueueDeps): void {
  deps = next
}

/** Test hook: clear items + register state between tests. */
export function resetDownloadQueue(): void {
  deps = {}
  idCounter = 0
  settleCallbacks.clear()
  fetchControllers.clear()
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
 * mirror. Official steps open in a new tab (batch 14); the
 * native steps use the iframe handoff.
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
      // A fresh row is mid-download until the handoff proves
      // otherwise (the iframe/tab branches patch it to 'browser'
      // synchronously below; the fetch branch patches it to
      // 'downloaded' / 'failed' when the download settles).
      status: 'downloading',
      progress: null,
      attemptToken: 0,
      mirrorIdUsed: null,
      triedMirrorIds: [],
      copied: null,
      note: null,
      at: now(),
    }
    if (req.onSettled) settleCallbacks.set(id, req.onSettled)
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
    // Abort any in-flight fetch first: the superseded attempt
    // must never land on the row (its patches are guarded by
    // the attempt token as well).
    fetchControllers.get(id)?.abort()
    const target = nextRetryMirrorId(item)
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id
          ? {
              ...i,
              status: 'downloading' as const,
              progress: null,
              mirrorIdUsed: null,
              copied: null,
              note: null,
            }
          : i,
      ),
      dockOpen: true,
    }))
    handOffAndCopy(
      { ...item, status: 'downloading', progress: null, mirrorIdUsed: null, copied: null, note: null },
      target,
    )
  },

  clearFinished: () => {
    // Only finished rows go: a still-downloading row stays until
    // its fetch settles (clearing must never orphan a download
    // the user can no longer see). Its settle callback already
    // fired when the row went terminal, so no callback is lost.
    set((s) => ({ items: s.items.filter((i) => i.status === 'downloading') }))
  },

  setDockOpen: (open) => set({ dockOpen: open }),
}))

function patchItem(id: string, patch: Partial<DownloadQueueItem>): void {
  useDownloadQueue.setState((s) => ({
    items: s.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  }))
}

/**
 * Patch a row to a terminal state ('downloaded', 'failed', or
 * 'browser') and fire its settle callback exactly once (Download
 * All uses it to free a concurrency slot). Non-terminal patches
 * (progress, copy outcome) go through patchItem and never settle.
 */
function markTerminal(id: string, patch: Partial<DownloadQueueItem>): void {
  patchItem(id, patch)
  const cb = settleCallbacks.get(id)
  if (cb) {
    settleCallbacks.delete(id)
    cb()
  }
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
 * Hand the set to its download path, then run the opt-in
 * Songs-folder copy in the background and patch the row with
 * its outcome. Three paths, decided by the mirror:
 *
 * - official: NEW TAB via the injectable tab opener seam
 *   (batch 14). The hidden-iframe handoff CANNOT work for
 *   official (the browser withholds the osu! session cookie on
 *   cross-site iframe navigations (SameSite), so osu! sees the
 *   frame as logged out, redirects it to the homepage, and the
 *   homepage refuses framing (X-Frame-Options: sameorigin) —
 *   live-verified 2026-10-29 with a signed-in user (no
 *   download, console X-Frame-Options error)). A top-level tab
 *   navigation DOES send the session cookie, so the tab open is
 *   the only working official path. The page never sees session
 *   cookies and must not ask for them. NO Songs-folder copy
 *   fetch runs for official: the authed osu! origin is not
 *   fetchable from the page. The row still records the attempt,
 *   so Retry can cycle on from official to the other mirrors.
 * - CORS-open mirrors (hinai, catboy, sayobot, nerinyan):
 *   FETCH the file in-page (fetchDownload): real progress,
 *   real success/failure. A failed mirror falls through
 *   AUTOMATICALLY to the next fetchable mirror in the resolved
 *   native order, starting at the effective mirror and wrapping
 *   once (one try per mirror). recordDownload fires only on
 *   actual success. The Songs-folder copy reuses the SAME
 *   bytes — no second fetch.
 * - BeatConnect (the only remaining native mirror): the
 *   hidden-iframe handoff via the download manager, exactly as
 *   before — fetch is blocked (BeatConnect allows only one
 *   other origin), so the page cannot observe the outcome and
 *   the row is honestly "Downloading (unverified)". The copy
 *   still fetches its own bytes (attemptSongsCopy).
 *
 * Async patches are guarded by the attempt token: a Retry
 * bumps the token and aborts the in-flight fetch, so a
 * superseded attempt can never land on the row.
 */
async function handOffAndCopy(
  item: DownloadQueueItem,
  mirrorOverride?: string,
): Promise<void> {
  const manager = createDownloadManager({
    startBrowserDownload: deps.startBrowserDownload,
    record: deps.record,
  })
  // A Retry passes the next mirror explicitly; the first attempt
  // uses the explicit pick (or Auto order[0]) as before. Resolve
  // Auto up front so the branch below sees the mirror the
  // download will actually use.
  const effectiveMirrorId = mirrorOverride ?? item.mirrorId
  const resolvedMirrorId =
    effectiveMirrorId ?? resolveNativeMirrorOrder(item.noVideo)[0]

  // Attempt token: bumped on every run; async patches below
  // only land while this run is still the current attempt.
  const current = useDownloadQueue.getState().items.find((i) => i.id === item.id)
  const token = (current?.attemptToken ?? item.attemptToken ?? 0) + 1
  patchItem(item.id, { attemptToken: token })
  const isCurrent = (): boolean =>
    useDownloadQueue.getState().items.find((i) => i.id === item.id)?.attemptToken === token
  const patchIfCurrent = (patch: Partial<DownloadQueueItem>): void => {
    if (isCurrent()) patchItem(item.id, patch)
  }
  const terminalIfCurrent = (patch: Partial<DownloadQueueItem>): void => {
    if (isCurrent()) markTerminal(item.id, patch)
  }
  const applyCopyOutcome = (outcome: SongCopyOutcome): void => {
    if (!isCurrent()) return
    patchItem(item.id, {
      copied: outcome.status,
      note:
        outcome.status === 'failed'
          ? `Songs-folder copy failed: ${outcome.reason}`
          : outcome.status === 'copied'
            ? 'Copied to your Songs folder.'
            : null,
    })
  }

  if (resolvedMirrorId === 'official') {
    const openTab = deps.openOfficial ?? defaultOpenOfficialTab
    const url = mirrorById(resolvedMirrorId).url(item.beatmapsetId, {
      noVideo: item.noVideo,
    })
    try {
      openTab(url)
      const record = deps.record ?? recordDownload
      void record(item.seenKeyValue, item.beatmapsetId, resolvedMirrorId)
    } catch (err) {
      terminalIfCurrent({
        status: 'failed',
        note: err instanceof Error ? err.message : String(err),
      })
      return
    }
    terminalIfCurrent({
      status: 'browser',
      mirrorIdUsed: resolvedMirrorId,
      triedMirrorIds: [...(item.triedMirrorIds ?? []), resolvedMirrorId],
    })
    // Official never runs the Songs-folder copy (the authed osu!
    // origin is not fetchable from the page).
    return
  }

  if (isFetchableMirror(resolvedMirrorId)) {
    await fetchChainAndCopy(item, resolvedMirrorId, {
      isCurrent,
      patchIfCurrent,
      terminalIfCurrent,
      applyCopyOutcome,
    })
    return
  }

  // Iframe-only native mirror (BeatConnect): hand off blind, honestly.
  try {
    const result = manager.startDownload({
      beatmapsetId: item.beatmapsetId,
      mirrorId: effectiveMirrorId,
      seenKeyValue: item.seenKeyValue,
      noVideo: item.noVideo,
    })
    terminalIfCurrent({
      status: 'browser',
      mirrorIdUsed: result.mirrorId,
      triedMirrorIds: [...(item.triedMirrorIds ?? []), result.mirrorId],
    })
  } catch (err) {
    terminalIfCurrent({
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
    .then(applyCopyOutcome)
    .catch(() =>
      applyCopyOutcome({ status: 'failed', reason: 'Songs-folder copy failed.' }),
    )
}

interface FetchChainGuards {
  isCurrent: () => boolean
  patchIfCurrent: (patch: Partial<DownloadQueueItem>) => void
  terminalIfCurrent: (patch: Partial<DownloadQueueItem>) => void
  applyCopyOutcome: (outcome: SongCopyOutcome) => void
}

function isAbortError(err: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (err instanceof Error && err.name === 'AbortError')
}

/**
 * Fetch the set from the CORS-open mirrors in resolved native
 * order, starting at the effective mirror and wrapping once
 * (one try per mirror — iframe-only mirrors are skipped, they
 * cannot be verified). On success: save, record the download
 * (only on actual success), mark the row Downloaded, and copy
 * the SAME bytes to the Songs folder. On total failure: mark
 * the row Failed with the last mirror's reason.
 */
async function fetchChainAndCopy(
  item: DownloadQueueItem,
  effectiveMirrorId: string,
  guards: FetchChainGuards,
): Promise<void> {
  const order = resolveNativeMirrorOrder(item.noVideo)
  const startIdx = Math.max(0, order.indexOf(effectiveMirrorId))
  const candidates: string[] = []
  for (let i = 0; i < order.length; i += 1) {
    const id = order[(startIdx + i) % order.length]
    if (isFetchableMirror(id) && !candidates.includes(id)) candidates.push(id)
  }
  const tried: string[] = [...(item.triedMirrorIds ?? [])]
  let lastError = 'all mirrors failed'
  const controller = new AbortController()
  fetchControllers.set(item.id, controller)
  try {
    for (const mirrorId of candidates) {
      if (!guards.isCurrent()) return
      const url = mirrorById(mirrorId).url(item.beatmapsetId, { noVideo: item.noVideo })
      tried.push(mirrorId)
      guards.patchIfCurrent({ mirrorIdUsed: mirrorId, triedMirrorIds: [...tried] })
      try {
        const downloaded = await downloadSetViaFetch(
          { mirrorId, beatmapsetId: item.beatmapsetId, url },
          {
            fetchFn: deps.fetchFn,
            saveFile: deps.saveFile,
            signal: controller.signal,
            onProgress: (progress: FetchDownloadProgress) =>
              guards.patchIfCurrent({ progress }),
          },
        )
        if (!guards.isCurrent()) return
        // Recorded ONLY on actual success: a failed download
        // must never mark the set downloaded.
        const record = deps.record ?? recordDownload
        void record(item.seenKeyValue, item.beatmapsetId, mirrorId)
        guards.terminalIfCurrent({
          status: 'downloaded',
          mirrorIdUsed: mirrorId,
          triedMirrorIds: [...tried],
          progress: { received: downloaded.bytes, total: downloaded.bytes },
          note: null,
        })
        // Songs-folder copy reuses the SAME bytes (no second
        // fetch). Fire-and-forget, like the iframe path's copy.
        void copyBlobToSongsFolder(
          {
            beatmapsetId: item.beatmapsetId,
            artist: item.artist,
            title: item.title,
            noVideo: item.noVideo,
            mirrorId,
          },
          downloaded.blob,
          deps.folderDeps ?? {},
        )
          .then(guards.applyCopyOutcome)
          .catch(() =>
            guards.applyCopyOutcome({ status: 'failed', reason: 'Songs-folder copy failed.' }),
          )
        return
      } catch (err) {
        if (!guards.isCurrent()) return
        // Superseded by Retry (which aborted this fetch): stop
        // silently — the newer attempt owns the row now.
        if (isAbortError(err, controller.signal)) return
        // A local save failure would fail on every mirror the
        // same way — stop the chain instead of re-downloading.
        if (err instanceof FetchDownloadError && err.fatal) {
          guards.terminalIfCurrent({
            status: 'failed',
            mirrorIdUsed: mirrorId,
            triedMirrorIds: [...tried],
            note: err.message,
          })
          return
        }
        lastError = err instanceof Error ? err.message : String(err)
        // Otherwise fall through to the next candidate.
      }
    }
    guards.terminalIfCurrent({
      status: 'failed',
      mirrorIdUsed: tried[tried.length - 1] ?? null,
      triedMirrorIds: [...tried],
      note: lastError,
    })
  } finally {
    if (fetchControllers.get(item.id) === controller) fetchControllers.delete(item.id)
  }
}

export function mirrorNameFor(id: string | null): string {
  if (!id) return ''
  return MIRRORS.find((m) => m.id === id)?.name ?? id
}
