import { MIRRORS, recordDownload, type MirrorSource } from './mirrors'
import { getMirrorPriority, MIRROR_PRIORITY_DEFAULT } from './downloadSettings'

/**
 * Beatmap downloads (batch AI, 2026-10-30): this manager keeps
 * the mirror order resolution and the hidden-iframe handoff.
 * The iframe handoff is now ONLY for mirrors the page cannot
 * fetch (BeatConnect — CORS-blocked — and, via the queue, the
 * official tab): CORS-open mirrors (hinai, catboy, sayobot,
 * nerinyan) are fetched in-page by lib/fetchDownload.ts, which
 * gives real progress, real success/failure, and automatic
 * fallback to the next mirror. The old comment below about
 * "no fetch in this module" still holds for THIS module —
 * the fetch lives in fetchDownload.ts and is orchestrated by
 * the download queue — but the dock rows no longer have to say
 * "Downloading" forever: fetch rows report their real state.
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
 * - BeatConnect's anonymous direct links have an hourly per-IP
 *   limit + captcha (live-verified 2026-10-30): when the limit
 *   is hit /b/{id} answers with an HTML page instead of the
 *   file, the frame refuses the page (X-Frame-Options: deny),
 *   no download, dock stuck on "Downloading". There is no
 *   in-page workaround — the dock Retry cycles to the next
 *   mirror, and hinai (last in the native order) is the
 *   fallback for exactly that case. A BeatConnect row now says
 *   "Downloading (unverified)" so the limit is visible as a
 *   row that never confirms, instead of a row that claims a
 *   download is in progress.
 * - The iframe download is recorded (seen set + history) on
 *   click, since success cannot be observed from the page.
 *   The FETCH path records only on actual success (the queue
 *   does it, not startDownload).
 */

/** Mirrors that serve the .osz file directly, in preference order.
 * hinai sits LAST (fallback position, batch AH): the default order
 * stays beatconnect first. Its eight-source cascade is the safety
 * net when the earlier mirrors rate-limit or 503. */
export const NATIVE_MIRROR_ORDER = ['beatconnect', 'catboy', 'nerinyan', 'sayobot', 'hinai'] as const

/**
 * Auto order when "Download without video" is on: catboy goes first,
 * because it is the only mirror whose no-video URL form was verified
 * when this order was written (see mirrors.ts). hinai's ?noVideo=1
 * form is verified too (batch AH) but hinai stays last — fallback
 * position, same as the plain order. The other mirrors still serve
 * the full file.
 */
export const NATIVE_MIRROR_ORDER_NO_VIDEO = ['catboy', 'beatconnect', 'nerinyan', 'sayobot', 'hinai'] as const

/**
 * The native mirror order actually used for a download, resolved
 * from the user's stored Mirror Route Priority (Settings) — the
 * SINGLE source of truth. Every consumer (startDownload below,
 * the download queue's Retry cycle, the Songs-folder copy fetch
 * order, the picker menu) reads through this function, so no
 * second order constant can drift apart from it.
 *
 * No-video interplay (simplest coherent rule): the stored
 * priority defines the order. When the user has set NO custom
 * priority ('balanced', missing, or an unknown/stale value), the
 * built-in defaults apply — catboy first when no-video is on
 * (its `{id}n` form was the first verified no-video form;
 * hinai's `?noVideo=1` is verified too, batch AH, but hinai
 * stays last as the fallback), beatconnect first otherwise.
 * When a custom priority IS set (a native mirror id), it wins
 * as the base order in BOTH cases: the chosen mirror goes
 * first and the rest keep their default relative order. Per-mirror no-video URL shaping is unchanged
 * (see mirrors.ts): catboy still serves its `{id}n` file wherever
 * it sits in the order, and the other mirrors still fall back
 * to the full file.
 *
 * Official is NEVER in this order: it stays pinned first in
 * display only, and opens in a new tab via the download queue.
 */
export function resolveNativeMirrorOrder(noVideo: boolean): readonly string[] {
  const priority = getMirrorPriority()
  if (
    priority !== MIRROR_PRIORITY_DEFAULT &&
    (NATIVE_MIRROR_ORDER as readonly string[]).includes(priority)
  ) {
    return [priority, ...NATIVE_MIRROR_ORDER.filter((m) => m !== priority)]
  }
  return noVideo ? NATIVE_MIRROR_ORDER_NO_VIDEO : NATIVE_MIRROR_ORDER
}

/**
 * Which source the DownloadButton's main button uses first.
 * 'official' = osu! official in a new tab (the long-standing
 * default, kept everywhere unless a view opts in). 'auto' = the
 * first native mirror in the resolved order (Recommendations,
 * user decision 2026-10-30: BeatConnect first with default
 * settings — the resolved order, never hardcoded).
 */
export type DownloadPrimary = 'official' | 'auto'

export interface PrimaryDownload {
  kind: DownloadPrimary
  /**
   * The native mirror the Auto primary hands off to — order[0]
   * of resolveNativeMirrorOrder(noVideo). 'official' when the
   * primary is official. Never null: the native order always
   * has a first entry.
   */
  mirrorId: string
}

/**
 * Pure decision for the DownloadButton main action, given the
 * view's primary choice and the no-video flag. The order itself
 * is never recomputed here: it comes from resolveNativeMirrorOrder
 * (Mirror Route Priority + no-video rule), so the button follows
 * the user's setting exactly — with default settings
 * (balanced, no-video off) Auto resolves to BeatConnect.
 */
export function resolvePrimaryDownload(
  primary: DownloadPrimary,
  noVideo: boolean,
): PrimaryDownload {
  if (primary === 'official') return { kind: 'official', mirrorId: 'official' }
  return { kind: 'auto', mirrorId: resolveNativeMirrorOrder(noVideo)[0] }
}

/**
 * Display order: osu! official FIRST, then the resolved native
 * order. Drives the DownloadButton menu and the dock Retry
 * cycle. Official is only ever handed off when explicitly
 * requested — via the download queue's new-tab opener (batch
 * 14), never through this manager's iframe handoff. The Auto
 * default in startDownload below stays native-only: the pack
 * loop and bulk downloads rely on Auto staying native-only.
 */
export function resolveDisplayMirrorOrder(noVideo: boolean): readonly string[] {
  return ['official', ...resolveNativeMirrorOrder(noVideo)]
}

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
   *  file (catboy's {id}n form, hinai's ?noVideo=1 — both verified;
   *  official never routes through here; its `?noVideo=1` is
   *  applied to the tab URL by the queue).
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
    const order = resolveNativeMirrorOrder(request.noVideo === true)
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
    const noVideoApplied =
      request.noVideo === true && (mirror.id === 'catboy' || mirror.id === 'hinai')
    startBrowserDownload(mirror.url(request.beatmapsetId, { noVideo: request.noVideo }))
    // Recorded on click: native downloads report no completion.
    void record(request.seenKeyValue, request.beatmapsetId, mirror.id)
    return { status: 'started', mirrorId: mirror.id, noVideoApplied }
  }

  return { startDownload }
}

/** Default manager used by the UI (real hidden iframe + recording). */
export const downloadManager = createDownloadManager()
