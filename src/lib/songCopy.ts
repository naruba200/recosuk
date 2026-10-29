import { MIRRORS, type MirrorUrlOptions } from './mirrors'
import {
  NATIVE_MIRROR_ORDER,
  NATIVE_MIRROR_ORDER_NO_VIDEO,
} from './downloadManager'
import {
  ensureFolderPermission,
  isFileSystemAccessSupported,
  pickSongsFolder,
  songsFolderStore,
  type SongsFolderStoreDeps,
} from './songsFolder'
import { getAutoCopy } from './downloadSettings'

/**
 * Songs-folder auto-copy (QA batch 2, item 8): the opt-in,
 * best-effort twin of the native browser download. The native
 * iframe path cannot supply bytes to the page, so this path fetches
 * the .osz itself and streams it into the user's picked Songs
 * folder via the File System Access API — IN ADDITION to the normal
 * browser download, never instead of it.
 *
 * Honest limits, baked in:
 * - Fetch is subject to CORS: a mirror that blocks cross-origin
 *   fetches cannot be copied this way. Mirrors are tried in order
 *   and the copy simply reports failure; the browser download
 *   already happened, so nothing is lost.
 * - Chromium desktop only (showDirectoryPicker). Elsewhere the copy
 *   is skipped and the browser download stands alone.
 * - A failed copy NEVER blocks or fakes the download, and success
 *   is only reported when the writable stream actually closed.
 * - osu!stable picks up .osz files in Songs on its next launch
 *   (press F5 in song select to rescan without restarting).
 */

export interface SongCopyRequest {
  beatmapsetId: number
  artist: string
  title: string
  noVideo?: boolean
  /** Restrict attempts to one mirror (explicit menu pick). Omitted = Auto order. */
  mirrorId?: string
}

export type SongCopyOutcome =
  | { status: 'copied'; mirrorId: string; filename: string }
  | { status: 'failed'; reason: string }
  | { status: 'skipped'; reason: string }

/** osu!-style filename, sanitized so it can never escape the folder. */
export function songsFolderFilename(request: SongCopyRequest): string {
  const clean = (s: string): string =>
    s
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/[\u0000-\u001f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120)
  const artist = clean(request.artist) || 'Unknown Artist'
  const title = clean(request.title) || 'Unknown Title'
  return `${request.beatmapsetId} ${artist} - ${title}.osz`
}

export interface SongCopyDeps {
  fetchFn?: typeof fetch
  /** Defaults to the stored handle from IndexedDB. Injected in tests. */
  loadHandle?: () => Promise<FileSystemDirectoryHandle | null>
  ensurePermission?: (handle: FileSystemDirectoryHandle) => Promise<boolean>
  /** Defaults to the real picker flow. Injected in tests. */
  pickFolder?: () => Promise<FileSystemDirectoryHandle | null>
  storeDeps?: SongsFolderStoreDeps
}

/** The mirror attempts for one set, in order: per mirror, the
 * no-video URL first (when requested), then that same mirror's
 * full-file URL. Mirrors with no no-video variant build identical
 * URLs for both attempts and appear once. Shared by the
 * Songs-folder copy and the download queue so both paths try the
 * mirrors in exactly the same order. */
export function mirrorAttemptUrls(request: SongCopyRequest): { mirrorId: string; url: string }[] {
  const fullOrder = request.noVideo ? NATIVE_MIRROR_ORDER_NO_VIDEO : NATIVE_MIRROR_ORDER
  const order = request.mirrorId ? fullOrder.filter((m) => m === request.mirrorId) : fullOrder
  const attempts: { mirrorId: string; url: string }[] = []
  for (const mirrorId of order) {
    const mirror = MIRRORS.find((m) => m.id === mirrorId)
    if (!mirror) continue
    const urls = [...new Set([
      mirror.url(request.beatmapsetId, { noVideo: request.noVideo } satisfies MirrorUrlOptions),
      mirror.url(request.beatmapsetId, {}),
    ])]
    for (const url of urls) attempts.push({ mirrorId, url })
  }
  return attempts
}

export interface FetchedSet {
  response: Response
  mirrorId: string
  url: string
  /** True when the body was assembled from parallel Range requests. */
  chunked?: boolean
}

/** Parallel Range connections used by the chunked download. */
export const CHUNK_CONNECTIONS = 4
/** Files smaller than this are not worth splitting into ranges. */
export const CHUNKED_MIN_BYTES = 256 * 1024

export interface ChunkedFetchDeps extends SongCopyDeps {
  /** Live progress for the chunked path only (real bytes received
   * across the parallel ranges). The single-stream path reports
   * progress from the caller's own reader loop, as today. */
  onProgress?: (received: number, total: number | null) => void
}

/**
 * Fetch the .osz from the mirrors in order and return the first
 * response that answers 2xx, WITHOUT consuming its body — the
 * caller owns the stream (folder write, queued download, or both
 * via Response.clone()). Any non-2xx (a 425 Too Early from catboy's
 * `{id}n` endpoint included) or fetch throw (CORS/network) moves to
 * the next attempt. Returns null when every attempt fails; the last
 * error is kept for honest reporting.
 */
export async function fetchSetResponse(
  request: SongCopyRequest,
  deps: SongCopyDeps = {},
): Promise<{ fetched: FetchedSet; lastError: string } | { fetched: null; lastError: string }> {
  const fetchFn = deps.fetchFn ?? globalThis.fetch
  let lastError = 'all mirrors failed'
  for (const { mirrorId, url } of mirrorAttemptUrls(request)) {
    try {
      const response = await fetchFn(url)
      if (!response.ok) {
        lastError = `${mirrorId} answered ${response.status}`
        continue
      }
      return { fetched: { response, mirrorId, url }, lastError }
    } catch (err) {
      // CORS blocks and network failures land here: try the next
      // attempt (same mirror's full file, then the next mirror).
      lastError = err instanceof Error ? err.message : String(err)
    }
  }
  return { fetched: null, lastError }
}

/**
 * One chunked multi-connection attempt for a single URL: a HEAD /
 * range probe, then up to CHUNK_CONNECTIONS concurrent Range
 * requests reassembled in order. Returns null whenever chunking
 * does not apply or any part fails — the caller then falls back to
 * the plain single-stream fetch of the same URL, so a failed chunk
 * can never produce a partial or corrupt file, and progress is
 * never faked (only bytes actually received are reported).
 *
 * Only used when the mirror's response is CORS-readable AND
 * advertises `Accept-Ranges: bytes` with a known length. Honest
 * limit: if the mirror throttles per-IP rather than per-connection,
 * parallel ranges will NOT help — the dock's rate readout is the
 * evidence either way.
 */
async function tryChunkedFetch(
  url: string,
  fetchFn: typeof fetch,
  onProgress?: (received: number, total: number | null) => void,
): Promise<Response | null> {
  let probe: Response
  try {
    probe = await fetchFn(url, { method: 'HEAD' })
  } catch {
    return null
  }
  if (!probe.ok) return null
  const acceptRanges = probe.headers.get('accept-ranges')
  const lengthHeader = probe.headers.get('content-length')
  const total = lengthHeader ? Number(lengthHeader) : NaN
  if (acceptRanges !== 'bytes' || !Number.isFinite(total) || total < CHUNKED_MIN_BYTES) {
    return null
  }

  const partSize = Math.ceil(total / CHUNK_CONNECTIONS)
  const ranges: Array<[number, number]> = []
  for (let start = 0; start < total; start += partSize) {
    ranges.push([start, Math.min(start + partSize - 1, total - 1)])
  }

  let received = 0
  try {
    const parts = await Promise.all(
      ranges.map(async ([start, end]) => {
        const res = await fetchFn(url, { headers: { Range: `bytes=${start}-${end}` } })
        if (res.status !== 206) return null
        const body = res.body
        if (!body || typeof body.getReader !== 'function') {
          const buf = await res.arrayBuffer()
          if (buf.byteLength !== end - start + 1) return null
          received += buf.byteLength
          onProgress?.(received, total)
          return new Uint8Array(buf)
        }
        const reader = body.getReader()
        const chunks: Uint8Array[] = []
        let partBytes = 0
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) {
            chunks.push(value)
            partBytes += value.byteLength
            received += value.byteLength
            onProgress?.(received, total)
          }
        }
        if (partBytes !== end - start + 1) return null
        const part = new Uint8Array(partBytes)
        let offset = 0
        for (const chunk of chunks) {
          part.set(chunk, offset)
          offset += chunk.byteLength
        }
        return part
      }),
    )
    if (parts.some((p) => p === null)) return null
    const assembled = new Uint8Array(total)
    let offset = 0
    for (const part of parts) {
      assembled.set(part as Uint8Array, offset)
      offset += (part as Uint8Array).byteLength
    }
    return new Response(assembled, { headers: { 'Content-Length': String(total) } })
  } catch {
    return null
  }
}

/**
 * fetchSetResponse with the chunked attempt first: for each mirror
 * attempt URL in order, try the parallel-Range download; on any
 * chunked failure fall back to the plain single-stream fetch of the
 * same URL, then to the next mirror — the same order and the same
 * browser-handoff fallback as fetchSetResponse. The Songs-folder
 * copy still clones the single returned response (no double
 * download).
 */
export async function fetchSetResponseChunked(
  request: SongCopyRequest,
  deps: ChunkedFetchDeps = {},
): Promise<{ fetched: FetchedSet; lastError: string } | { fetched: null; lastError: string }> {
  const fetchFn = deps.fetchFn ?? globalThis.fetch
  let lastError = 'all mirrors failed'
  for (const { mirrorId, url } of mirrorAttemptUrls(request)) {
    try {
      const chunked = await tryChunkedFetch(url, fetchFn, deps.onProgress)
      if (chunked) {
        return { fetched: { response: chunked, mirrorId, url, chunked: true }, lastError }
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
    try {
      const response = await fetchFn(url)
      if (!response.ok) {
        lastError = `${mirrorId} answered ${response.status}`
        continue
      }
      return { fetched: { response, mirrorId, url, chunked: false }, lastError }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }
  return { fetched: null, lastError }
}

export async function writeResponseToFolder(
  handle: FileSystemDirectoryHandle,
  filename: string,
  response: Response,
): Promise<void> {
  const fileHandle = await handle.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  try {
    // Pipe the response stream straight into the file (the writable
    // stream IS a WritableStream, so pipeTo closes it on completion).
    // Fall back to a buffered write for non-streaming bodies.
    if (response.body) {
      await response.body.pipeTo(writable)
    } else {
      await writable.write(await response.arrayBuffer())
      await writable.close()
    }
  } catch (err) {
    try {
      await writable.abort()
    } catch {
      /* abort is best-effort */
    }
    throw err
  }
}

/**
 * Fetch the .osz from the mirrors in order and write it into the
 * folder handle. Returns 'failed' (never throws) when every mirror
 * fails or the write fails. The mirror fallthrough lives in
 * fetchSetResponse (batch 3, item D order preserved).
 */
export async function copySetToSongsFolder(
  request: SongCopyRequest,
  handle: FileSystemDirectoryHandle,
  deps: SongCopyDeps = {},
): Promise<SongCopyOutcome> {
  const filename = songsFolderFilename(request)
  const { fetched, lastError } = await fetchSetResponse(request, deps)
  if (!fetched) return { status: 'failed', reason: lastError }
  try {
    await writeResponseToFolder(handle, filename, fetched.response)
    return { status: 'copied', mirrorId: fetched.mirrorId, filename }
  } catch (err) {
    // A write failure is a folder problem, not a mirror problem:
    // retrying other mirrors would fetch the same bytes into the
    // same failing folder. Report it honestly.
    return { status: 'failed', reason: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Write an already-fetched response into the stored Songs folder —
 * the download queue's twin of attemptSongsCopy, minus the picker:
 * the queue must never pop a folder picker mid-download. When
 * auto-copy is off, the browser cannot pick folders, or no folder
 * was stored, the copy is skipped (never fetched twice, never
 * prompting). Never throws; every outcome is an honest status.
 * The caller passes a Response.clone() so it can still read the
 * original stream for the browser save.
 */
export async function writeFetchedSetToFolder(
  request: SongCopyRequest,
  response: Response,
  deps: SongCopyDeps = {},
): Promise<SongCopyOutcome> {
  if (!getAutoCopy()) return { status: 'skipped', reason: 'auto-copy is off' }
  if (!isFileSystemAccessSupported()) {
    return { status: 'skipped', reason: 'this browser cannot pick folders' }
  }
  const loadHandle = deps.loadHandle ?? songsFolderStore.loadHandle
  const ensurePermission = deps.ensurePermission ?? ensureFolderPermission
  const handle = await loadHandle()
  if (!handle) return { status: 'skipped', reason: 'no Songs folder chosen' }
  if (!(await ensurePermission(handle))) {
    return { status: 'failed', reason: 'Songs folder permission was not granted' }
  }
  const filename = songsFolderFilename(request)
  try {
    await writeResponseToFolder(handle, filename, response)
    return { status: 'copied', mirrorId: '', filename }
  } catch (err) {
    return { status: 'failed', reason: err instanceof Error ? err.message : String(err) }
  }
}

// The user declining the folder picker is remembered for the session
// so the first download prompts once and later downloads fall back
// silently instead of nagging on every click.
let pickerDeclinedThisSession = false

export function resetSongsCopySessionFlags(): void {
  pickerDeclinedThisSession = false
}

/**
 * Full auto-copy attempt for one download: checks the toggle, the
 * browser, the stored handle (prompting the picker once when the
 * toggle is on but no folder is set), permission, then the copy.
 * Never throws; every outcome is an honest status.
 */
export async function attemptSongsCopy(
  request: SongCopyRequest,
  deps: SongCopyDeps = {},
): Promise<SongCopyOutcome> {
  if (!getAutoCopy()) return { status: 'skipped', reason: 'auto-copy is off' }
  if (!isFileSystemAccessSupported()) {
    return { status: 'skipped', reason: 'this browser cannot pick folders' }
  }
  const loadHandle = deps.loadHandle ?? songsFolderStore.loadHandle
  const ensurePermission = deps.ensurePermission ?? ensureFolderPermission
  const pickFolder =
    deps.pickFolder ?? (() => pickSongsFolder())

  let handle = await loadHandle()
  if (!handle) {
    if (pickerDeclinedThisSession) {
      return { status: 'skipped', reason: 'no Songs folder chosen' }
    }
    handle = await pickFolder()
    if (!handle) {
      pickerDeclinedThisSession = true
      return { status: 'skipped', reason: 'no Songs folder chosen' }
    }
  }
  if (!(await ensurePermission(handle))) {
    return { status: 'failed', reason: 'Songs folder permission was not granted' }
  }
  return copySetToSongsFolder(request, handle, deps)
}

