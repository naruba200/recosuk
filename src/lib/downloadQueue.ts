import { create } from 'zustand'
import { createDownloadManager, type DownloadManagerDeps } from './downloadManager'
import { getNoVideo } from './downloadSettings'
import { MIRRORS } from './mirrors'
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
  /** Explicit mirror pick from the menu. Omitted = Auto order. */
  mirrorId?: string
  noVideo?: boolean
}

export interface DownloadQueueDeps extends DownloadManagerDeps {
  /** Folder-write deps for the auto-copy (handle/permission/fetch). */
  folderDeps?: SongCopyDeps
  /** Clock for the registered time. Defaults to Date.now. */
  now?: () => number
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
    const mirrorId = req.mirrorId && req.mirrorId !== 'official' ? req.mirrorId : undefined
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
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id
          ? { ...i, status: 'browser' as const, mirrorIdUsed: null, copied: null, note: null }
          : i,
      ),
      dockOpen: true,
    }))
    handOffAndCopy({ ...item, status: 'browser', mirrorIdUsed: null, copied: null, note: null })
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

/**
 * Hand the set to the browser's native downloader (mirror order +
 * no-video setting exactly as in batch 2/3, recording included),
 * then run the opt-in Songs-folder copy in the background and patch
 * the row with its outcome. The copy's fetch is the copy itself —
 * plain single-stream via attemptSongsCopy, never the chunked path.
 */
function handOffAndCopy(item: DownloadQueueItem): void {
  const manager = createDownloadManager({
    startBrowserDownload: deps.startBrowserDownload,
    record: deps.record,
  })
  try {
    const result = manager.startDownload({
      beatmapsetId: item.beatmapsetId,
      mirrorId: item.mirrorId,
      seenKeyValue: item.seenKeyValue,
      noVideo: item.noVideo,
    })
    patchItem(item.id, { status: 'browser', mirrorIdUsed: result.mirrorId })
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
    mirrorId: item.mirrorId,
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
