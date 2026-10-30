/**
 * In-page .osz downloads (batch AI, 2026-10-30): fetch the file
 * from a CORS-open mirror and save it via a Blob, so the page can
 * OBSERVE the download — real progress, real success/failure —
 * instead of pointing a hidden iframe at the URL and hoping.
 *
 * Which mirrors this works for is a property of the mirror, not
 * of this module: see FETCHABLE_MIRROR_IDS in mirrors.ts (probed
 * 2026-10-30 — catboy, nerinyan, sayobot and hinai all send
 * `Access-Control-Allow-Origin: *`, final redirect hops verified;
 * BeatConnect allows ONLY https://collections.osustuff.ri.mk, so
 * fetch is blocked there and the iframe handoff stays).
 *
 * Honest limits, baked in:
 * - The whole file is buffered as a Blob before saving (the
 *   browser needs the bytes to trigger the save). A large video
 *   map can briefly hold ~100 MB in memory; the file is freed
 *   once the object URL is revoked. No chunking is attempted
 *   (only sayobot answers Range requests with 206, and the gain
 *   would not cover the complexity — see the 2026-10-30 probe).
 * - Progress is counted from real bytes off the wire. When the
 *   response carries no Content-Length the total is null and the
 *   UI must show an honest indeterminate state — NEVER a faked
 *   percentage. Progress events are throttled (default 150ms)
 *   so a fast download does not re-render the dock per chunk.
 * - A response is only a beatmap file when it is 2xx AND its
 *   first bytes are the PK zip magic. A mirror answering with
 *   an HTML page or JSON error (rate-limit / missing set served
 *   with a 200) is rejected as "not a beatmap file" — the
 *   caller (downloadQueue) then falls through to the next
 *   mirror. Content-Type is checked first as a fast reject for
 *   text/html and application/json; the PK magic is the ground
 *   truth.
 * - The save itself is a plain anchor click on an object URL,
 *   so the file lands in the Downloads folder like the old
 *   iframe path — no save prompt. The filename comes from
 *   Content-Disposition when the browser exposes it, else
 *   `{beatmapsetId}.osz`. The object URL is revoked after 10s;
 *   the Blob itself is returned to the caller (the Songs-folder
 *   copy reuses the same bytes instead of fetching twice).
 */

export class FetchDownloadError extends Error {
  /** The mirror that failed (or was being tried when saving failed). */
  mirrorId: string
  /** HTTP status when the mirror answered one. */
  status?: number
  /**
   * True when the failure is local (the save itself failed), not
   * the mirror's: the caller must NOT try the next mirror, the
   * save would fail there too.
   */
  fatal?: boolean

  constructor(mirrorId: string, message: string, opts?: { status?: number; fatal?: boolean }) {
    super(message)
    this.name = 'FetchDownloadError'
    this.mirrorId = mirrorId
    this.status = opts?.status
    this.fatal = opts?.fatal
  }
}

export interface FetchDownloadProgress {
  /** Bytes counted off the wire so far. */
  received: number
  /** Total bytes from Content-Length, or null when unknown. */
  total: number | null
}

export interface FetchDownloadResult {
  /** The downloaded bytes (also the source of the save). */
  blob: Blob
  /** Filename used for the save. */
  filename: string
  /** Total bytes downloaded. */
  bytes: number
  mirrorId: string
}

export interface FetchDownloadDeps {
  /** Defaults to globalThis.fetch. Injected in tests. */
  fetchFn?: typeof fetch
  /**
   * Save a Blob to the Downloads folder. Defaults to the
   * anchor-click saver. Injected in tests (the node test
   * environment has no document).
   */
  saveFile?: (blob: Blob, filename: string) => void
  /** Receives real byte counts; throttled (see progressIntervalMs). */
  onProgress?: (progress: FetchDownloadProgress) => void
  /** Abort the fetch (Retry aborts a superseded attempt). */
  signal?: AbortSignal
  /**
   * Minimum ms between progress events; 0 disables the
   * throttle (tests). Default 150.
   */
  progressIntervalMs?: number
}

/** The first four bytes of every .osz (it is a zip archive). */
const PK_ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]

/** Strip control characters (a regex for them trips the linter). */
function stripControlChars(name: string): string {
  let out = ''
  for (const ch of name) {
    const code = ch.charCodeAt(0)
    if (code >= 0x20 && code !== 0x7f) out += ch
  }
  return out
}

function sanitizeFilename(name: string): string {
  // Separators go (no path traversal), control chars go, and
  // leading dots go too — a name like "....evil.osz" is just a
  // separator-stripped traversal attempt, not a real filename.
  return stripControlChars(name.replace(/[\\/]/g, '')).trim().replace(/^\.+/, '')
}

/**
 * Filename from a Content-Disposition header: `filename*=UTF-8''...`
 * wins, then `filename="..."` / `filename=...`. Path separators
 * and control characters are stripped so the name can never
 * escape the Downloads folder. Returns null when nothing usable
 * is present.
 */
export function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null
  const extended = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header)
  if (extended?.[1]) {
    try {
      const name = sanitizeFilename(decodeURIComponent(extended[1].trim()))
      if (name) return name
    } catch {
      /* malformed encoding falls through to the plain form */
    }
  }
  const plain = /filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i.exec(header)
  const raw = plain?.[1] ?? plain?.[2]
  if (!raw) return null
  const name = sanitizeFilename(raw.trim())
  return name || null
}

function parseTotal(headers: Headers): number | null {
  const raw = headers.get('Content-Length')
  if (!raw) return null
  const total = Number.parseInt(raw, 10)
  return Number.isFinite(total) && total >= 0 ? total : null
}

/**
 * Default save: object URL + anchor click. The link is added to
 * the document (Firefox requires it to be in the DOM) and removed
 * after the click; the URL is revoked after 10s so the Blob can
 * be freed. Throws when there is no document (never in a real
 * browser; tests inject saveFile instead).
 */
export function saveBlobToDownloads(blob: Blob, filename: string): void {
  if (typeof globalThis.document === 'undefined') {
    throw new Error('cannot save a file without a document')
  }
  const url = URL.createObjectURL(blob)
  const anchor = globalThis.document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  globalThis.document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}

/**
 * Fetch one .osz from one mirror and save it. Returns the Blob
 * (for the Songs-folder copy) plus the filename and byte count.
 * Throws FetchDownloadError on any failure; an AbortError passes
 * through unwrapped so the caller can tell a superseded attempt
 * apart from a failed mirror.
 */
export async function downloadSetViaFetch(
  request: { mirrorId: string; beatmapsetId: number; url: string },
  deps: FetchDownloadDeps = {},
): Promise<FetchDownloadResult> {
  const fetchFn = deps.fetchFn ?? globalThis.fetch
  const saveFile = deps.saveFile ?? saveBlobToDownloads
  const progressIntervalMs = deps.progressIntervalMs ?? 150
  let response: Response
  try {
    response = await fetchFn(request.url, { signal: deps.signal })
  } catch (err) {
    if (isAbortError(err)) throw err
    throw new FetchDownloadError(
      request.mirrorId,
      err instanceof Error ? err.message : String(err),
    )
  }
  if (!response.ok) {
    throw new FetchDownloadError(
      request.mirrorId,
      `${request.mirrorId} answered ${response.status}`,
      { status: response.status },
    )
  }
  // Fast reject: an HTML page or JSON error served with a 200 is
  // never a beatmap file (rate-limit / missing-set pages).
  const contentType = response.headers.get('Content-Type') ?? ''
  if (/^text\/html/i.test(contentType) || /^application\/json/i.test(contentType)) {
    throw new FetchDownloadError(request.mirrorId, `${request.mirrorId} answered with ${contentType}`)
  }
  const total = parseTotal(response.headers)
  const filename =
    parseContentDispositionFilename(response.headers.get('Content-Disposition')) ??
    `${request.beatmapsetId}.osz`

  let received = 0
  let lastEmit = 0
  const emit = (force: boolean) => {
    if (!deps.onProgress) return
    const now = Date.now()
    if (!force && progressIntervalMs > 0 && now - lastEmit < progressIntervalMs) return
    lastEmit = now
    deps.onProgress({ received, total })
  }

  const chunks: Uint8Array<ArrayBuffer>[] = []
  const checkMagic = (head: Uint8Array): void => {
    for (let i = 0; i < PK_ZIP_MAGIC.length; i += 1) {
      if (head[i] !== PK_ZIP_MAGIC[i]) {
        throw new FetchDownloadError(
          request.mirrorId,
          `${request.mirrorId} did not return a beatmap file`,
        )
      }
    }
  }

  if (!response.body) {
    // Non-streaming body (some runtimes / mocked responses):
    // buffer it whole, then validate the same way.
    const buffer = new Uint8Array(await response.arrayBuffer())
    if (buffer.length < PK_ZIP_MAGIC.length) {
      throw new FetchDownloadError(request.mirrorId, `${request.mirrorId} returned an empty file`)
    }
    checkMagic(buffer.subarray(0, PK_ZIP_MAGIC.length))
    received = buffer.length
    emit(true)
    const blob = new Blob([buffer], { type: contentType || 'application/octet-stream' })
    try {
      saveFile(blob, filename)
    } catch (err) {
      throw new FetchDownloadError(
        request.mirrorId,
        err instanceof Error ? err.message : String(err),
        { fatal: true },
      )
    }
    return { blob, filename, bytes: received, mirrorId: request.mirrorId }
  }

  const reader = response.body.getReader()
  let magicChecked = false
  let head = new Uint8Array(0)
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        // Fetch chunk buffers are real ArrayBuffers in practice;
        // the cast is what BlobPart requires.
        chunks.push(value as Uint8Array<ArrayBuffer>)
        received += value.length
        if (!magicChecked) {
          const combined = new Uint8Array(head.length + value.length)
          combined.set(head)
          combined.set(value, head.length)
          head = combined
          if (head.length >= PK_ZIP_MAGIC.length) {
            checkMagic(head.subarray(0, PK_ZIP_MAGIC.length))
            magicChecked = true
          }
        }
        emit(false)
      }
    }
  } catch (err) {
    if (isAbortError(err)) throw err
    if (err instanceof FetchDownloadError) throw err
    throw new FetchDownloadError(
      request.mirrorId,
      err instanceof Error ? err.message : String(err),
    )
  } finally {
    try {
      reader.releaseLock()
    } catch {
      /* release is best-effort */
    }
  }
  if (!magicChecked) {
    // Stream ended before 4 bytes arrived (or was empty).
    if (head.length > 0) checkMagic(head)
    throw new FetchDownloadError(request.mirrorId, `${request.mirrorId} returned an empty file`)
  }
  emit(true)
  const blob = new Blob(chunks, { type: contentType || 'application/octet-stream' })
  try {
    saveFile(blob, filename)
  } catch (err) {
    throw new FetchDownloadError(
      request.mirrorId,
      err instanceof Error ? err.message : String(err),
      { fatal: true },
    )
  }
  return { blob, filename, bytes: received, mirrorId: request.mirrorId }
}
