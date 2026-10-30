import { MIRRORS, type MirrorUrlOptions } from './mirrors'
import { resolveNativeMirrorOrder } from './downloadManager'
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
 * URLs for both attempts and appear once. Used by the Songs-folder
 * copy's fetch (fetchSetResponse). */
export function mirrorAttemptUrls(request: SongCopyRequest): { mirrorId: string; url: string }[] {
  // The copy tries the mirrors in the resolved order (the user's
  // Mirror Route Priority, or the built-in default) — the same
  // order the download itself uses.
  const fullOrder = resolveNativeMirrorOrder(request.noVideo === true)
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
}

/**
 * Fetch the .osz from the mirrors in order and return the first
 * response that answers 2xx, WITHOUT consuming its body — the
 * caller owns the stream (the Songs-folder copy). Any non-2xx (a
 * 425 Too Early from catboy's `{id}n` endpoint included) or fetch
 * throw (CORS/network) moves to the next attempt. Returns null
 * when every attempt fails; the last error is kept for honest
 * reporting.
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

// The user declining the folder picker is remembered for the session
// so the first download prompts once and later downloads fall back
// silently instead of nagging on every click.
let pickerDeclinedThisSession = false

export function resetSongsCopySessionFlags(): void {
  pickerDeclinedThisSession = false
}

/**
 * Resolve the Songs folder for a copy: checks the toggle, the
 * browser, the stored handle (prompting the picker once when the
 * toggle is on but no folder is set), and permission. Shared by
 * attemptSongsCopy (which fetches its own bytes) and the
 * fetch-download path (which hands over the bytes it already
 * downloaded — no second fetch). Never throws; every outcome is
 * an honest status.
 */
export type SongsFolderReady =
  | { ready: true; handle: FileSystemDirectoryHandle }
  | { ready: false; outcome: SongCopyOutcome }

export async function prepareSongsFolderCopy(
  deps: SongCopyDeps = {},
): Promise<SongsFolderReady> {
  if (!getAutoCopy()) return { ready: false, outcome: { status: 'skipped', reason: 'auto-copy is off' } }
  if (!isFileSystemAccessSupported()) {
    return { ready: false, outcome: { status: 'skipped', reason: 'this browser cannot pick folders' } }
  }
  const loadHandle = deps.loadHandle ?? songsFolderStore.loadHandle
  const ensurePermission = deps.ensurePermission ?? ensureFolderPermission
  const pickFolder = deps.pickFolder ?? (() => pickSongsFolder())

  let handle = await loadHandle()
  if (!handle) {
    if (pickerDeclinedThisSession) {
      return { ready: false, outcome: { status: 'skipped', reason: 'no Songs folder chosen' } }
    }
    handle = await pickFolder()
    if (!handle) {
      pickerDeclinedThisSession = true
      return { ready: false, outcome: { status: 'skipped', reason: 'no Songs folder chosen' } }
    }
  }
  if (!(await ensurePermission(handle))) {
    return { ready: false, outcome: { status: 'failed', reason: 'Songs folder permission was not granted' } }
  }
  return { ready: true, handle }
}

/** Write already-downloaded bytes into the folder (no fetch).
 * The Blob is written directly (FileSystemWritableFileStream
 * accepts a Blob); piping a Response body would need a real
 * WritableStream and buys nothing — the bytes are already in
 * memory. */
export async function writeBlobToFolder(
  handle: FileSystemDirectoryHandle,
  filename: string,
  blob: Blob,
): Promise<void> {
  const fileHandle = await handle.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  try {
    await writable.write(blob)
    await writable.close()
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
 * Copy bytes the download path already fetched (batch AI): the
 * same .osz that was just saved to the Downloads folder is
 * written into the Songs folder — one fetch serves both, the
 * copy never downloads the file a second time. The filename
 * follows the existing osu!-style convention (songsFolderFilename),
 * exactly as the fetch-own copy does.
 */
export async function copyBlobToSongsFolder(
  request: SongCopyRequest,
  blob: Blob,
  deps: SongCopyDeps = {},
): Promise<SongCopyOutcome> {
  const prepared = await prepareSongsFolderCopy(deps)
  if (!prepared.ready) return prepared.outcome
  const filename = songsFolderFilename(request)
  try {
    await writeBlobToFolder(prepared.handle, filename, blob)
    return { status: 'copied', mirrorId: request.mirrorId ?? 'download', filename }
  } catch (err) {
    // A write failure is a folder problem, not a mirror problem:
    // retrying other mirrors would fetch the same bytes into the
    // same failing folder. Report it honestly.
    return { status: 'failed', reason: err instanceof Error ? err.message : String(err) }
  }
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
  const prepared = await prepareSongsFolderCopy(deps)
  if (!prepared.ready) return prepared.outcome
  return copySetToSongsFolder(request, prepared.handle, deps)
}

