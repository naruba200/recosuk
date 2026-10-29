import type { RegisterRequest } from './downloadQueue'

/**
 * "Download all" for list-detail views (batch 11, part 7): hand
 * every set to the browser downloader through the EXISTING dock
 * register (`useDownloadQueue.register`), so every item appears
 * in the dock window with the same mirror order + no-video
 * behaviour as a per-song DownloadButton click. There is NO
 * fetch, NO progress reporting (native downloads report none),
 * and NO fake progress — the dock rows say "Downloading" exactly
 * as single downloads do.
 *
 * STAGGER MECHANISM: the first set registers synchronously, in
 * the click handler itself (the browser handoff stays in the
 * user-gesture call stack); each following set registers from a
 * chained `setTimeout` exactly BULK_DOWNLOAD_STAGGER_MS later.
 * The chain is O(1) per step and yields to the event loop
 * between handoffs, so a 50-set list never blocks the UI and the
 * browser is never asked for 50 hidden iframes in one tick.
 * `cancel()` stops the chain; already-registered items stay
 * registered (their browser downloads are already handed off
 * and cannot be recalled). `onSettled` fires exactly once when
 * the last item registers or the chain is cancelled, so the
 * caller can re-enable its button.
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
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const registerNext = () => {
    if (cancelled) {
      settle()
      return
    }
    const item = deduped[index]
    index += 1
    opts.register({
      beatmapsetId: item.beatmapsetId,
      artist: item.artist,
      title: item.title,
      seenKeyValue: opts.seenKeyValue,
      noVideo: opts.noVideo,
    })
    if (index >= deduped.length) {
      settle()
      return
    }
    timer = setTimeout(registerNext, staggerMs)
  }

  // First handoff synchronously, in the click handler; the rest
  // follow on the chained timer.
  registerNext()

  return () => {
    if (cancelled) return
    cancelled = true
    if (timer !== null) clearTimeout(timer)
    settle()
  }
}
