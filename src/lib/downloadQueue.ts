import { create } from 'zustand'
import { startBrowserDownload } from './downloadManager'
import { getNoVideo } from './downloadSettings'
import { MIRRORS, recordDownload } from './mirrors'
import {
  fetchSetResponseChunked,
  mirrorAttemptUrls,
  songsFolderFilename,
  writeFetchedSetToFolder,
  type SongCopyDeps,
  type SongCopyRequest,
} from './songCopy'

/**
 * In-app download queue (batch 4, item C): downloads run through the
 * site first — a small bottom-right window shows progress + rate,
 * many songs can queue, and when a fetch completes the file is
 * saved to the machine immediately via a Blob download.
 *
 * Honest limits (do not soften these in UI copy):
 * - Fetch is subject to CORS: most mirrors send no
 *   Access-Control-Allow-Origin, so the fetch WILL fail for them.
 *   A failed fetch falls back to the existing hidden-iframe native
 *   download and the row is marked "handed to your browser" — never
 *   fake progress, never a fake success.
 * - The queue processes one item at a time (sequential), so the
 *   progress + rate numbers are real per-file numbers.
 * - When Songs-folder auto-copy is on, the fetched bytes are ALSO
 *   written to the folder from a clone of the same response — the
 *   file is fetched ONCE, never twice.
 */

export type DownloadQueueStatus =
  | 'queued'
  | 'downloading'
  | 'done'
  | 'browser'
  | 'failed'
  | 'cancelled'

export interface DownloadQueueItem {
  id: string
  beatmapsetId: number
  artist: string
  title: string
  seenKeyValue: string
  mirrorId?: string
  noVideo: boolean
  status: DownloadQueueStatus
  downloadedBytes: number
  totalBytes: number | null
  /** Bytes/second over the last progress window (0 while idle). */
  rateBps: number
  mirrorIdUsed: string | null
  /** Songs-folder copy outcome for this item (only when auto-copy ran). */
  copied: 'copied' | 'failed' | 'skipped' | null
  note: string | null
}

export interface EnqueueRequest {
  beatmapsetId: number
  artist: string
  title: string
  seenKeyValue: string
  /** Explicit mirror pick from the menu. Omitted = Auto order. */
  mirrorId?: string
  noVideo?: boolean
}

export interface DownloadQueueDeps {
  fetchFn?: typeof fetch
  startBrowserDownload?: (url: string) => void
  record?: (seenKeyValue: string, beatmapsetId: number, mirrorId: string) => Promise<void> | void
  /** Defaults to the anchor-download save. Injected in tests. */
  saveFile?: (blob: Blob, filename: string) => void
  /** Folder-write deps for the auto-copy twin (handle/permission). */
  folderDeps?: SongCopyDeps
  /** Clock for the rate math. Defaults to Date.now. */
  now?: () => number
}

function defaultSaveFile(blob: Blob, filename: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

let deps: DownloadQueueDeps = {}
let processing = false
let idCounter = 0

/** Test/override hook: replace the queue's collaborators. */
export function configureDownloadQueue(next: DownloadQueueDeps): void {
  deps = next
}

/** Test hook: clear items + worker state between tests. */
export function resetDownloadQueue(): void {
  deps = {}
  processing = false
  useDownloadQueue.setState({ items: [], dockOpen: false })
}

function firstAttemptMirrorId(req: SongCopyRequest): string {
  const attempts = mirrorAttemptUrls(req)
  return attempts[0]?.mirrorId ?? 'beatconnect'
}

interface DownloadQueueState {
  items: DownloadQueueItem[]
  dockOpen: boolean
  enqueue: (req: EnqueueRequest) => string
  cancel: (id: string) => void
  retry: (id: string) => void
  clearFinished: () => void
  setDockOpen: (open: boolean) => void
}

export const useDownloadQueue = create<DownloadQueueState>()((set) => ({
  items: [],
  dockOpen: false,

  enqueue: (req) => {
    const noVideo = req.noVideo ?? getNoVideo()
    const mirrorId = req.mirrorId && req.mirrorId !== 'official' ? req.mirrorId : undefined
    const id = `dq-${++idCounter}-${req.beatmapsetId}-${Date.now()}`
    const item: DownloadQueueItem = {
      id,
      beatmapsetId: req.beatmapsetId,
      artist: req.artist,
      title: req.title,
      seenKeyValue: req.seenKeyValue,
      mirrorId,
      noVideo,
      status: 'queued',
      downloadedBytes: 0,
      totalBytes: null,
      rateBps: 0,
      mirrorIdUsed: null,
      copied: null,
      note: null,
    }
    set((s) => ({ items: [...s.items, item], dockOpen: true }))
    // Recorded on enqueue, as the old click-to-download did: the
    // seen mark is what keeps recommendations from re-serving it.
    const record = deps.record ?? recordDownload
    void record(req.seenKeyValue, req.beatmapsetId, mirrorId ?? firstAttemptMirrorId({ ...req, noVideo, mirrorId }))
    void pump()
    return id
  },

  cancel: (id) => {
    set((s) => ({
      items: s.items.map((item) => (item.id === id && (item.status === 'queued' || item.status === 'downloading')
        ? { ...item, status: 'cancelled' as const, rateBps: 0 }
        : item)),
    }))
  },

  retry: (id) => {
    set((s) => ({
      items: s.items.map((item) =>
        item.id === id && (item.status === 'failed' || item.status === 'browser' || item.status === 'cancelled')
          ? {
              ...item,
              status: 'queued' as const,
              downloadedBytes: 0,
              totalBytes: null,
              rateBps: 0,
              mirrorIdUsed: null,
              copied: null,
              note: null,
            }
          : item,
      ),
      dockOpen: true,
    }))
    void pump()
  },

  clearFinished: () => {
    set((s) => ({
      items: s.items.filter(
        (item) => item.status === 'queued' || item.status === 'downloading',
      ),
    }))
  },

  setDockOpen: (open) => set({ dockOpen: open }),
}))

function patchItem(id: string, patch: Partial<DownloadQueueItem>): void {
  useDownloadQueue.setState((s) => ({
    items: s.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  }))
}

function isCancelled(id: string): boolean {
  return useDownloadQueue.getState().items.find((i) => i.id === id)?.status === 'cancelled'
}

async function pump(): Promise<void> {
  if (processing) return
  processing = true
  try {
    for (;;) {
      const next = useDownloadQueue.getState().items.find((i) => i.status === 'queued')
      if (!next) break
      await processItem(next)
    }
  } finally {
    processing = false
  }
}

async function processItem(item: DownloadQueueItem): Promise<void> {
  const fetchFn = deps.fetchFn
  const handOff = deps.startBrowserDownload ?? startBrowserDownload
  const now = deps.now ?? Date.now
  const request: SongCopyRequest = {
    beatmapsetId: item.beatmapsetId,
    artist: item.artist,
    title: item.title,
    noVideo: item.noVideo,
    mirrorId: item.mirrorId,
  }
  patchItem(item.id, { status: 'downloading', mirrorIdUsed: firstAttemptMirrorId(request) })

  // Chunked-path progress/rate (batch 5, item D): real bytes
  // received across the parallel Range requests, throttled to the
  // same 150ms emit cadence as the single-stream loop below. The
  // single-stream path keeps its own reader-loop reporting; a
  // failed chunked attempt restarts progress from 0 on the plain
  // fetch, which is honest — those bytes were never kept.
  let chunkedRateBps = 0
  let chunkedLastAt = now()
  let chunkedLastBytes = 0
  const { fetched } = await fetchSetResponseChunked(request, {
    fetchFn,
    onProgress: (received, total) => {
      const at = now()
      if (at - chunkedLastAt >= 150) {
        chunkedRateBps = (received - chunkedLastBytes) / Math.max((at - chunkedLastAt) / 1000, 0.001)
        chunkedLastAt = at
        chunkedLastBytes = received
        patchItem(item.id, { downloadedBytes: received, totalBytes: total, rateBps: chunkedRateBps })
      }
    },
  })
  if (isCancelled(item.id)) return
  if (!fetched) {
    // CORS/network blocked every mirror: hand the first attempt URL
    // to the browser's native downloader and say so honestly.
    const attempts = mirrorAttemptUrls(request)
    if (attempts[0]) handOff(attempts[0].url)
    patchItem(item.id, {
      status: 'browser',
      rateBps: 0,
      note: 'In-app download was blocked — handed to your browser instead.',
    })
    return
  }
  patchItem(item.id, { mirrorIdUsed: fetched.mirrorId })

  // Songs-folder twin: clone BEFORE reading so the same fetched
  // bytes feed both the folder write and the browser save.
  let copyPromise: Promise<'copied' | 'failed' | 'skipped'> | null = null
  try {
    const clone = fetched.response.clone()
    copyPromise = writeFetchedSetToFolder(request, clone, deps.folderDeps ?? {})
      .then((outcome) => outcome.status)
      .catch((): 'failed' => 'failed')
  } catch {
    copyPromise = Promise.resolve('failed' as const)
  }

  const totalBytes = readContentLength(fetched.response)
  const chunks: Uint8Array[] = []
  let downloadedBytes = 0
  let lastEmitAt = now()
  let lastEmitBytes = 0
  let rateBps = 0
  patchItem(item.id, { totalBytes })
  try {
    if (fetched.chunked) {
      // Bytes already fully received — progress/rate were reported
      // live during the parallel fetch above. Take the assembled
      // body without re-reading it through the rate loop (that
      // would report a meaningless instant rate for in-memory
      // bytes). The Songs-folder clone above already holds the
      // same assembled bytes: still one fetch, no double download.
      const buffer = await fetched.response.arrayBuffer()
      downloadedBytes = buffer.byteLength
      chunks.push(new Uint8Array(buffer))
      patchItem(item.id, { downloadedBytes, totalBytes: buffer.byteLength, rateBps: chunkedRateBps })
    } else if (fetched.response.body && typeof fetched.response.body.getReader === 'function') {
      const body = fetched.response.body
      const reader = body.getReader()
      for (;;) {
        if (isCancelled(item.id)) {
          await reader.cancel().catch(() => undefined)
          return
        }
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          chunks.push(value)
          downloadedBytes += value.byteLength
        }
        const at = now()
        if (at - lastEmitAt >= 150) {
          rateBps = (downloadedBytes - lastEmitBytes) / Math.max((at - lastEmitAt) / 1000, 0.001)
          lastEmitAt = at
          lastEmitBytes = downloadedBytes
          patchItem(item.id, { downloadedBytes, rateBps })
        }
      }
    } else {
      const buffer = await fetched.response.arrayBuffer()
      downloadedBytes = buffer.byteLength
      chunks.push(new Uint8Array(buffer))
    }
  } catch {
    patchItem(item.id, {
      status: 'failed',
      rateBps: 0,
      note: 'The download stream broke — retry, or use the mirror menu for a browser download.',
    })
    return
  }
  if (isCancelled(item.id)) return

  const blob = new Blob(chunks as BlobPart[], { type: 'application/octet-stream' })
  const save = deps.saveFile ?? defaultSaveFile
  save(blob, songsFolderFilename(request))
  const copyOutcome = copyPromise ? await copyPromise : null
  patchItem(item.id, {
    status: 'done',
    downloadedBytes,
    totalBytes: totalBytes ?? downloadedBytes,
    rateBps: 0,
    copied: copyOutcome,
    note: copyOutcome === 'copied' ? 'Saved + copied to your Songs folder.' : null,
  })
}

function readContentLength(response: Response): number | null {
  try {
    const raw = response.headers?.get?.('content-length')
    const parsed = raw ? Number(raw) : NaN
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  } catch {
    return null
  }
}

/** True when any item still needs attention (drives the dock badge). */
export function queueHasActiveItems(items: DownloadQueueItem[]): boolean {
  return items.some((i) => i.status === 'queued' || i.status === 'downloading')
}

export function mirrorNameFor(id: string | null): string {
  if (!id) return ''
  return MIRRORS.find((m) => m.id === id)?.name ?? id
}
