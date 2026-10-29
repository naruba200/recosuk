import { MIRRORS, recordDownload, type MirrorSource } from './mirrors'

/**
 * Beatmap downloads, the fast way (QA fix): the previous implementation
 * fetched the .osz through JavaScript, streamed it chunk by chunk, and
 * buffered the whole file into a Blob before saving. That is
 * single-threaded and memory-bound, and it was abysmally slow.
 *
 * The mirror sites are fast because they do none of that: they link
 * the file and let the BROWSER's native downloader fetch it. This
 * service copies them — it points a hidden iframe at the mirror URL,
 * the page never navigates, and the browser's download manager takes
 * over at full speed. There is deliberately NO fetch() in this module
 * (and no progress bar: native downloads report no progress to the
 * page, so the dock row says "Downloading" and must not
 * fake a percentage).
 *
 * Honest limits (do not soften these in UI copy):
 * - The OFFICIAL osu! source NEVER uses the iframe handoff
 *   (batch 14, reverting batch 13): the browser withholds the
 *   osu! session cookie on cross-site iframe navigations
 *   (SameSite), so osu! sees the frame as logged out, redirects
 *   it to the homepage, and the homepage refuses framing
 *   (X-Frame-Options: sameorigin). Live-verified 2026-10-29
 *   with a signed-in user: no download, console X-Frame-Options
 *   error. Official downloads open in a NEW TAB via the download
 *   queue's `openOfficial` seam (a top-level navigation sends
 *   the cookie). startDownload below REFUSES 'official' outright
 *   so the iframe path can never be used for it by mistake.
 *   Official downloads are not available via the API, and the
 *   official origin is never fetched from the page.
 * - No fallback chain is possible with native downloads: the page
 *   cannot tell whether the browser's download succeeded, so Auto
 *   always uses the first mirror in the order and the menu lets the
 *   user pick another one explicitly.
 * - The download is recorded (seen set + history) on click, since
 *   success cannot be observed from the page.
 */

/** Mirrors that serve the .osz file directly, in preference order. */
export const NATIVE_MIRROR_ORDER = ['beatconnect', 'catboy', 'nerinyan', 'sayobot'] as const

/**
 * Auto order when "Download without video" is on: catboy goes first,
 * because it is the only mirror whose no-video URL form is verified
 * (see mirrors.ts). The other mirrors still serve the full file.
 */
export const NATIVE_MIRROR_ORDER_NO_VIDEO = ['catboy', 'beatconnect', 'nerinyan', 'sayobot'] as const

/**
 * Display/default order (batch 12, part 9): osu! official FIRST,
 * then the native mirrors in their usual order. This order drives
 * the DownloadButton menu and the dock Retry cycle. It does NOT
 * change the Auto default in startDownload below (native order):
 * the pack loop and bulk downloads rely on Auto staying
 * native-only, and official is only handed off when explicitly
 * requested — via the download queue's new-tab opener (batch
 * 14), never through this manager's iframe handoff. The two
 * orders are deliberately separate constants.
 */
export const DISPLAY_MIRROR_ORDER = ['official', ...NATIVE_MIRROR_ORDER] as const
export const DISPLAY_MIRROR_ORDER_NO_VIDEO = [
  'official',
  ...NATIVE_MIRROR_ORDER_NO_VIDEO,
] as const

export interface DownloadRequest {
  beatmapsetId: number
  /** Start from this mirror only (menu pick). Omitted = Auto order. */
  mirrorId?: string
  seenKeyValue: string
  /** Request the no-video variant where the mirror supports one. */
  noVideo?: boolean
}

export interface DownloadResult {
  /** 'started' means the browser was handed the URL; the page cannot observe completion. */
  status: 'started'
  /** The mirror the download was handed to. */
  mirrorId: string
  /** True only when the handed-to mirror actually serves a no-video
   *  file (today: catboy only — official never routes through here;
   *  its `?noVideo=1` is applied to the tab URL by the queue).
   *  Never claim a no-video copy otherwise. */
  noVideoApplied: boolean
}

export interface DownloadManagerDeps {
  /** Defaults to pointing a fresh hidden iframe at the URL. Injected in tests. */
  startBrowserDownload?: (url: string) => void
  /** Defaults to recordDownload from mirrors.ts (seen set + history). */
  record?: (seenKeyValue: string, beatmapsetId: number, mirrorId: string) => Promise<void> | void
}

/** Point a fresh hidden iframe at the URL so the browser's native
 * downloader takes over. Exported for the download queue's fallback
 * path (fetch blocked by CORS → hand off, honestly marked). */
export function startBrowserDownload(url: string): void {
  defaultStartBrowserDownload(url)
}

function defaultStartBrowserDownload(url: string): void {
  // A fresh iframe per download: re-setting the same src on a reused
  // frame does not reliably re-trigger a download.
  const frame = document.createElement('iframe')
  frame.setAttribute('data-recosuk-download', '')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.display = 'none'
  document.body.appendChild(frame)
  frame.src = url
}

function mirrorByIdOrThrow(id: string): MirrorSource {
  const found = MIRRORS.find((m) => m.id === id)
  if (!found) throw new Error(`Unknown mirror: ${id}`)
  return found
}

export function createDownloadManager(deps: DownloadManagerDeps = {}) {
  const startBrowserDownload = deps.startBrowserDownload ?? defaultStartBrowserDownload
  const record = deps.record ?? recordDownload

  function startDownload(request: DownloadRequest): DownloadResult {
    const order = request.noVideo ? NATIVE_MIRROR_ORDER_NO_VIDEO : NATIVE_MIRROR_ORDER
    const mirror = request.mirrorId
      ? mirrorByIdOrThrow(request.mirrorId)
      : mirrorByIdOrThrow(order[0])
    if (mirror.id === 'official') {
      // The iframe handoff cannot carry the osu! session
      // (X-Frame-Options + SameSite — live-verified failure
      // 2026-10-29). Official downloads open in a new tab via
      // the download queue's openOfficial seam; never route one
      // through here, explicitly or via Auto.
      throw new Error(
        'Official downloads must open in a new tab via the download queue (openOfficial) — the hidden-iframe handoff cannot carry the osu! session.',
      )
    }
    const noVideoApplied = request.noVideo === true && mirror.id === 'catboy'
    startBrowserDownload(mirror.url(request.beatmapsetId, { noVideo: request.noVideo }))
    // Recorded on click: native downloads report no completion.
    void record(request.seenKeyValue, request.beatmapsetId, mirror.id)
    return { status: 'started', mirrorId: mirror.id, noVideoApplied }
  }

  return { startDownload }
}

/** Default manager used by the UI (real hidden iframe + recording). */
export const downloadManager = createDownloadManager()
