import type { RegisterRequest } from './downloadQueue'

/**
 * "Download all" for list-detail views (batch 11, part 7; real
 * queue batch AI): hand every set to the download register so
 * every item appears in the dock window with the same mirror
 * order + no-video behaviour as a per-song DownloadButton click.
 *
 * REAL QUEUE (batch AI): items register through the pump below,
 * at most BULK_DOWNLOAD_CONCURRENCY (3) in flight at once, with
 * at least BULK_DOWNLOAD_STAGGER_MS (250ms) between registrations
 * — the old courtesy gap stays, so the browser is never asked
 * for 50 handoffs in one tick. A slot frees when the item's
 * register settles (RegisterRequest.onSettled: the fetch
 * actually finished/failed, or the iframe handoff landed), and
 * the pump registers the next pending item. Each item carries a
 * REAL state in the dock (progress / Downloaded / Failed /
 * "Downloading (unverified)" for iframe rows) instead of a
 * permanent "Downloading".
 *
 * The first set still registers synchronously, in the click
 * handler itself. `cancel()` stops the pending registrations;
 * already-registered items stay registered (their downloads
 * are already handed off or in flight and cannot be recalled).
 * `onSettled` fires exactly once when the last item REGISTERS
 * or the chain is cancelled — the pre-AI semantics, preserved:
 * callers re-enable their button once every set is handed to
 * the queue, not once every download finishes.
 *
 * Sets are deduped by beatmapset_id (first occurrence wins) —
 * a list must never hand the same file to the browser twice.
 * An empty list registers nothing and calls onSettled
 * immediately (synchronously) with no timers.
 *
 * DELIBERATE EXCEPTION (batch 12, part 9): bulk downloads stay
 * NATIVE-ONLY — they never use the official-first default order.
 * Opening one official tab per set would flood the browser with
 * tabs, and the authed osu! origin cannot be iframed or fetched.
 * Each set registers with no explicit mirror, so the register's
 * native Auto order applies exactly as for a single Auto click.
 */

/** Gap between staggered handoffs: 250ms, inside the 200–300ms spec. */
export const BULK_DOWNLOAD_STAGGER_MS = 250

/**
 * Max downloads in flight at once. 3 is enough to use the
 * connection without holding many whole files in memory at
 * once — each in-flight fetch is buffered as a Blob before
 * saving, so the cap is also a memory bound.
 */
export const BULK_DOWNLOAD_CONCURRENCY = 3

export interface BulkDownloadItem {
  beatmapsetId: number
  artist: string
  title: string
}

export interface BulkDownloadOptions {
  /** The dock register (useDownloadQueue.register in the UI). */
  register: (req: RegisterRequest) => string
  seenKeyValue: string
  /** Explicit no-video flag, read from download settings at click
   * time — the same value DownloadButton passes. Omitted = the
   * register's own default (the settings store). */
  noVideo?: boolean
  /** Gap between handoffs; tests inject a smaller value or rely
   * on fake timers with the default. */
  staggerMs?: number
  /** Max downloads in flight; tests may lower it. */
  concurrency?: number
  /** Fires once when the chain finishes or is cancelled. */
  onSettled?: () => void
}

/** Cancel the pending staggered handoffs. Already-registered items stay. */
export type BulkDownloadCancel = () => void

export function scheduleBulkDownload(
  items: BulkDownloadItem[],
  opts: BulkDownloadOptions,
): BulkDownloadCancel {
  const staggerMs = opts.staggerMs ?? BULK_DOWNLOAD_STAGGER_MS
  const concurrency = opts.concurrency ?? BULK_DOWNLOAD_CONCURRENCY
  const deduped: BulkDownloadItem[] = []
  const seen = new Set<number>()
  for (const item of items) {
    if (seen.has(item.beatmapsetId)) continue
    seen.add(item.beatmapsetId)
    deduped.push(item)
  }

  let settled = false
  const settle = () => {
    if (settled) return
    settled = true
    opts.onSettled?.()
  }
  if (deduped.length === 0) {
    settle()
    return () => {}
  }

  let index = 0
  let inFlight = 0
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastRegisterAt = 0

  const schedulePump = (ms: number) => {
    if (timer !== null) return
    timer = setTimeout(() => {
      timer = null
      pump()
    }, ms)
  }

  const pump = () => {
    if (cancelled || settled) return
    if (index >= deduped.length) {
      settle()
      return
    }
    if (inFlight >= concurrency) return
    if (index > 0) {
      // Minimum gap between registrations (the old stagger
      // courtesy): never burst handoffs in one tick.
      const gap = staggerMs - (Date.now() - lastRegisterAt)
      if (gap > 0) {
        schedulePump(gap)
        return
      }
    }
    const item = deduped[index]
    index += 1
    inFlight += 1
    lastRegisterAt = Date.now()
    opts.register({
      beatmapsetId: item.beatmapsetId,
      artist: item.artist,
      title: item.title,
      seenKeyValue: opts.seenKeyValue,
      noVideo: opts.noVideo,
      // A freed slot registers the next pending item.
      onSettled: () => {
        inFlight -= 1
        pump()
      },
    })
    if (index >= deduped.length) {
      settle()
      return
    }
    schedulePump(staggerMs)
  }

  // First handoff synchronously, in the click handler; the rest
  // follow through the pump (timer-paced, slot-gated).
  pump()

  return () => {
    if (cancelled) return
    cancelled = true
    if (timer !== null) clearTimeout(timer)
    settle()
  }
}
