import { MIRRORS, recordDownload, type MirrorSource } from './mirrors'

/**
 * In-app .osz downloads (user request, post-M6): the Mirror page used
 * to only link out to the osu! page, so downloads left RecOsuk. This
 * service fetches the .osz from a community mirror and saves it
 * without leaving the page.
 *
 * Honest limits (do not soften these in UI copy):
 * - The OFFICIAL osu! source is never fetched here: osu! downloads
 *   need an osu! login session in the browser and are not available
 *   via the API, so "osu! official" stays an "open the osu! page"
 *   link (new tab) and still needs the user's osu! login there.
 * - CORS: a mirror that does not send CORS headers cannot be read by
 *   fetch() from a browser page at all — the request fails before any
 *   bytes are readable, even though the file exists. That is why every
 *   fetch failure falls through to the next mirror and, when all of
 *   them fail, to opening the first mirror's URL in a new tab: the
 *   browser's own navigation is not subject to CORS, so the download
 *   still happens, just outside RecOsuk.
 * - Memory: the whole .osz is accumulated in memory as a Blob before
 *   saving (a stream-to-disk API does not exist for plain web pages).
 *   Sets are usually 10–40 MB, which is fine; a multi-hundred-MB set
 *   with a video may strain low-memory devices, and the
 *   external-open fallback is the escape hatch.
 */

export type DownloadStatus = 'downloaded' | 'opened-externally' | 'cancelled'

export interface DownloadResult {
  status: DownloadStatus
  /** The mirror that served (or was opened for) the file. */
  mirrorId: string
}

export interface DownloadProgress {
  received: number
  /** From Content-Length when the mirror sends it; null otherwise. */
  total: number | null
  mirrorId: string
}

export interface DownloadRequest {
  beatmapsetId: number
  artist: string
  title: string
  /** Start from this mirror only (menu pick). Omitted = Auto order. */
  mirrorId?: string
  seenKeyValue: string
  onProgress?: (progress: DownloadProgress) => void
}

export interface DownloadHandle {
  promise: Promise<DownloadResult>
  cancel: () => void
}

/** Mirrors that serve the .osz file directly, in fallback order. */
export const FETCH_MIRROR_ORDER = ['beatconnect', 'catboy', 'nerinyan', 'sayobot'] as const

export type FetchFn = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{
  ok: boolean
  status: number
  headers?: { get: (name: string) => string | null }
  body?: { getReader: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }> } } | null
  arrayBuffer?: () => Promise<ArrayBuffer>
}>

export interface DownloadManagerDeps {
  fetchFn?: FetchFn
  /** Defaults to window.open(url, '_blank'). Injected in tests. */
  openExternal?: (url: string) => void
  /** Defaults to a real <a download> click. Injected in tests. */
  triggerSave?: (objectUrl: string, filename: string) => void
  createObjectUrl?: (blob: Blob) => string
  revokeObjectUrl?: (url: string) => void
  /** Defaults to recordDownload from mirrors.ts (seen set + history). */
  record?: (seenKeyValue: string, beatmapsetId: number, mirrorId: string) => Promise<void> | void
}

function defaultFetch(): FetchFn {
  return (url, init) => globalThis.fetch(url, init) as Promise<never>
}

function defaultTriggerSave(objectUrl: string, filename: string): void {
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

/** Filename-safe: strip characters Windows/macOS reject in file names. */
export function oszFilename(artist: string, title: string): string {
  const base = `${artist} - ${title}`
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/^[- ]+|[- ]+$/g, '')
    .trim()
  return `${base || 'beatmap'}.osz`
}

function mirrorByIdOrThrow(id: string): MirrorSource {
  const found = MIRRORS.find((m) => m.id === id)
  if (!found) throw new Error(`Unknown mirror: ${id}`)
  return found
}

export function createDownloadManager(deps: DownloadManagerDeps = {}) {
  const fetchFn = deps.fetchFn ?? defaultFetch()
  const openExternal =
    deps.openExternal ?? ((url: string) => globalThis.window?.open(url, '_blank'))
  const triggerSave = deps.triggerSave ?? defaultTriggerSave
  const createObjectUrl =
    deps.createObjectUrl ?? ((blob: Blob) => URL.createObjectURL(blob))
  const revokeObjectUrl = deps.revokeObjectUrl ?? ((url: string) => URL.revokeObjectURL(url))
  const record = deps.record ?? recordDownload

  const inflight = new Map<number, DownloadHandle>()

  function download(request: DownloadRequest): DownloadHandle {
    const existing = inflight.get(request.beatmapsetId)
    if (existing) return existing

    const controller = new AbortController()
    let cancelled = false

    const promise = (async (): Promise<DownloadResult> => {
      const ordered: MirrorSource[] = request.mirrorId
        ? [mirrorByIdOrThrow(request.mirrorId)]
        : FETCH_MIRROR_ORDER.map(mirrorByIdOrThrow)

      for (const mirror of ordered) {
        if (cancelled) return { status: 'cancelled', mirrorId: mirror.id }
        try {
          const response = await fetchFn(mirror.url(request.beatmapsetId), {
            signal: controller.signal,
          })
          if (!response.ok) continue
          const totalRaw = response.headers?.get('content-length')
          const total = totalRaw ? Number(totalRaw) : null

          const chunks: Uint8Array[] = []
          let received = 0
          if (response.body?.getReader) {
            const reader = response.body.getReader()
            for (;;) {
              const { done, value } = await reader.read()
              if (done) break
              if (value) {
                chunks.push(value)
                received += value.byteLength
                request.onProgress?.({ received, total, mirrorId: mirror.id })
              }
            }
          } else if (response.arrayBuffer) {
            const buffer = await response.arrayBuffer()
            chunks.push(new Uint8Array(buffer))
            received = buffer.byteLength
            request.onProgress?.({ received, total, mirrorId: mirror.id })
          } else {
            continue
          }

          const blob = new Blob(chunks as BlobPart[], {
            type: 'application/octet-stream',
          })
          const objectUrl = createObjectUrl(blob)
          try {
            triggerSave(objectUrl, oszFilename(request.artist, request.title))
          } finally {
            // Give the browser a beat to pick the URL up before revoking.
            setTimeout(() => revokeObjectUrl(objectUrl), 4000)
          }
          await record(request.seenKeyValue, request.beatmapsetId, mirror.id)
          return { status: 'downloaded', mirrorId: mirror.id }
        } catch (error) {
          if (cancelled || controller.signal.aborted) {
            return { status: 'cancelled', mirrorId: mirror.id }
          }
          // CORS / network / non-OK: fall through to the next mirror.
          void error
        }
      }

      if (cancelled) return { status: 'cancelled', mirrorId: ordered[0].id }
      // No mirror could be read in-page (usually CORS). Open the first
      // mirror's URL in a new tab — browser navigation is not CORS-bound,
      // so the download still happens, honestly labelled as external.
      const first = ordered[0]
      openExternal(first.url(request.beatmapsetId))
      await record(request.seenKeyValue, request.beatmapsetId, first.id)
      return { status: 'opened-externally', mirrorId: first.id }
    })()

    const handle: DownloadHandle = {
      promise: promise.finally(() => {
        if (inflight.get(request.beatmapsetId) === handle) {
          inflight.delete(request.beatmapsetId)
        }
      }),
      cancel: () => {
        cancelled = true
        controller.abort()
      },
    }
    inflight.set(request.beatmapsetId, handle)
    return handle
  }

  function cancel(beatmapsetId: number): void {
    inflight.get(beatmapsetId)?.cancel()
  }

  return { download, cancel }
}

/** Default manager used by the UI (real fetch / real browser save). */
export const downloadManager = createDownloadManager()
