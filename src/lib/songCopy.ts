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

async function writeToFolder(
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
 * fails or the write fails.
 */
export async function copySetToSongsFolder(
  request: SongCopyRequest,
  handle: FileSystemDirectoryHandle,
  deps: SongCopyDeps = {},
): Promise<SongCopyOutcome> {
  const fetchFn = deps.fetchFn ?? globalThis.fetch
  const order = request.noVideo ? NATIVE_MIRROR_ORDER_NO_VIDEO : NATIVE_MIRROR_ORDER
  const filename = songsFolderFilename(request)
  const opts: MirrorUrlOptions = { noVideo: request.noVideo }
  let lastError = 'all mirrors failed'
  for (const mirrorId of order) {
    const mirror = MIRRORS.find((m) => m.id === mirrorId)
    if (!mirror) continue
    try {
      const response = await fetchFn(mirror.url(request.beatmapsetId, opts))
      if (!response.ok) {
        lastError = `${mirrorId} answered ${response.status}`
        continue
      }
      await writeToFolder(handle, filename, response)
      return { status: 'copied', mirrorId, filename }
    } catch (err) {
      // CORS blocks and network failures land here: try the next mirror.
      lastError = err instanceof Error ? err.message : String(err)
    }
  }
  return { status: 'failed', reason: lastError }
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

