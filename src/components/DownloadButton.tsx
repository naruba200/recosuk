import { useState } from 'react'
import { mirrorById } from '../lib/mirrors'
import { resolvePrimaryDownload, type DownloadPrimary } from '../lib/downloadManager'
import { useDownloadSettings } from '../lib/downloadSettings'
import { displayOrderFor, mirrorNameFor, useDownloadQueue } from '../lib/downloadQueue'
import { modeLabel, type GameMode } from '../lib/mode'

/**
 * Shared download affordance for BeatmapRow (Recommendations,
 * Welcome Recs, Mirror). Behaviour only — the button/menu styling
 * follows the existing row action suite.
 *
 * Downloads go through the DOWNLOAD REGISTER (batch 6, part 1):
 * CORS-open mirrors are fetched in-page (batch AI) so the dock
 * row shows real progress and a real Downloaded/Failed state;
 * BeatConnect hands off via a hidden iframe and official opens
 * in a new tab, and their rows honestly say the download was
 * handed off but cannot be verified. The finished state is
 * ICON-ONLY (QA batch 2): the button flips to a redo icon
 * (batch 6, part 5 — clicking it re-triggers the download, same
 * as a fresh click) and shows no done-state text at all.
 *
 * Songs-folder auto-copy (opt-in) runs from the register: for a
 * fetch download it reuses the SAME bytes just downloaded (no
 * second fetch); for an iframe handoff it fetches its own copy
 * (see lib/downloadQueue.ts).
 *
 * - Main button: osu! OFFICIAL first by default (batch 12,
 *   part 9) — the official download opens in a NEW TAB
 *   (batch 14, reverting batch 13: the hidden-iframe handoff
 *   cannot carry the osu! session — X-Frame-Options +
 *   SameSite, live-verified failure 2026-10-29 — while a
 *   top-level tab navigation sends the cookie) and registers
 *   the attempt in the dock, so Retry cycles on from official
 *   to the native mirrors. A view may opt into `primary="auto"`
 *   instead (Recommendations, user decision 2026-10-30): the
 *   main button then uses the native Auto path — the resolved
 *   order[0] (BeatConnect first with default settings), never
 *   hardcoded. Under Auto, the resolved order[0] hands off
 *   in-page via the hidden iframe. Official stays available in
 *   the expand menu.
 * - Expand menu: official first, then Auto (native order), then
 *   each native mirror — except under `primary="auto"`, where
 *   Auto comes first and official second. The official entry is
 *   a register action, not a bare link, so its attempt is
 *   tracked like any other.
 */

interface DownloadButtonProps {
  beatmapsetId: number
  artist: string
  title: string
  mode: GameMode
  seenKeyValue: string
  downloaded?: boolean
  onDownloaded?: () => void
  /**
   * Which source the main button uses first. Default
   * 'official' — every existing caller keeps official-first
   * unless it opts in. 'auto' (Recommendations only) hands
   * off in-page via the first native mirror in the resolved
   * order; official stays available in the expand menu.
   */
  primary?: DownloadPrimary
}

export default function DownloadButton({
  beatmapsetId,
  artist,
  title,
  mode,
  seenKeyValue,
  downloaded = false,
  onDownloaded,
  primary = 'official',
}: DownloadButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const noVideo = useDownloadSettings((s) => s.noVideo)
  // Subscribing to the stored priority re-renders the menu when
  // the user changes it in Settings — the order below is read
  // fresh from the store on every render.
  useDownloadSettings((s) => s.mirrorPriority)
  const register = useDownloadQueue((s) => s.register)
  // Latest register entry for THIS set drives the button icon; the
  // dock window owns the detailed mirror/copy reporting.
  const latest = useDownloadQueue((s) => {
    const mine = s.items.filter((i) => i.beatmapsetId === beatmapsetId)
    return mine[mine.length - 1]
  })

  const start = (mirrorId?: string, opts: { noVideo?: boolean } = {}) => {
    setMenuOpen(false)
    register({
      beatmapsetId,
      artist,
      title,
      seenKeyValue,
      mirrorId,
      noVideo: opts.noVideo ?? noVideo,
    })
    onDownloaded?.()
  }

  // Primary action (batch 12, part 9; batch 14): osu! official
  // first by default. The register opens the official URL in a
  // new tab (the iframe handoff cannot carry the osu! session)
  // and tracks the attempt, so the dock Retry cycle starts from
  // official. Under primary="auto" (Recommendations) the main
  // button instead uses the native Auto path — start() with no
  // mirror id, which downloads in-page via the resolved
  // order[0] (BeatConnect first with default settings — the
  // hidden-iframe handoff, honestly "Downloading (unverified)";
  // a fetchable mirror first downloads via fetch instead).
  const primaryDownload = resolvePrimaryDownload(primary, noVideo)
  const startOfficial = () => start('official')
  const startPrimary = () =>
    primaryDownload.kind === 'auto' ? start() : startOfficial()
  const primaryName =
    primaryDownload.kind === 'auto'
      ? mirrorNameFor(primaryDownload.mirrorId)
      : 'osu! official'

  // Picker order: official pinned first by default (the entry
  // above), then the native mirrors in the resolved order — the
  // Mirror Route Priority from Settings, or the built-in default.
  // Under primary="auto" the Auto entry comes first and official
  // second; the native list itself never changes.
  const nativeOrder = displayOrderFor(noVideo).filter((id) => id !== 'official')
  const autoFirstName = mirrorNameFor(nativeOrder[0] ?? null)

  // Done state: the `downloaded` prop (seen store) or the latest
  // register entry. Every screen shows it the same way — the
  // Mirror-only suppression (batch 11, part 3) was removed in
  // §AE: it was the reason the Mirror icon never flipped after
  // a download.
  const isDone = downloaded || latest?.status === 'browser' || latest?.status === 'downloaded'
  // The one exception to icon-only: a failed Songs-folder copy must
  // stay visible (the dock row says it too, but the dock can be
  // hidden while this row stays on screen). The wording names
  // what actually happened: a fetch download DID finish, an
  // iframe handoff only started.
  const copyFailedNote =
    latest?.copied === 'failed'
      ? latest.status === 'downloaded'
        ? 'Downloaded — the Songs-folder copy failed. Check Settings.'
        : 'Browser download started — the Songs-folder copy failed. Check Settings.'
      : null

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5 relative">
        <button
          className={`w-9 h-9 rounded-full ${isDone ? 'bg-surface-container-highest text-tertiary hover:bg-secondary hover:text-on-secondary' : 'bg-surface-container hover:bg-secondary hover:text-on-secondary text-on-surface'} flex items-center justify-center transition-all shadow-sm`}
          aria-label={isDone ? 'Download again' : 'Download .osz'}
          title={isDone ? `Download again from ${primaryName}` : `Download .osz from ${primaryName}`}
          type="button"
          onClick={startPrimary}
        >
          <span className="material-symbols-outlined text-[18px]">
            {isDone ? 'replay' : 'download'}
          </span>
        </button>
        <button
          className="w-9 h-9 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface-variant flex items-center justify-center transition-all shadow-sm"
          title="Download mirrors"
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="material-symbols-outlined text-[18px]">expand_more</span>
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-11 z-30 w-56 rounded-DEFAULT bg-surface-container-high shadow-xl p-1.5 flex flex-col">
            <span className="px-2 py-1 font-label-sm text-[10px] uppercase tracking-wider text-on-surface-variant">Download via</span>
            {primaryDownload.kind === 'auto' ? (
              <>
                <button
                  className="px-2 py-1.5 rounded hover:bg-surface-container-highest text-on-surface font-label-md text-label-md text-left"
                  type="button"
                  onClick={() => start()}
                >
                  {`Auto — ${autoFirstName} first${noVideo ? ' (no video)' : ''}`}
                </button>
                <button
                  className="px-2 py-1.5 rounded hover:bg-surface-container-highest text-on-surface font-label-md text-label-md text-left"
                  type="button"
                  onClick={startOfficial}
                >
                  osu! official
                  {noVideo ? ' (no video)' : ''}
                </button>
              </>
            ) : (
              <>
                <button
                  className="px-2 py-1.5 rounded hover:bg-surface-container-highest text-on-surface font-label-md text-label-md text-left"
                  type="button"
                  onClick={startOfficial}
                >
                  osu! official
                  {noVideo ? ' (no video)' : ''}
                </button>
                <button
                  className="px-2 py-1.5 rounded hover:bg-surface-container-highest text-on-surface font-label-md text-label-md text-left"
                  type="button"
                  onClick={() => start()}
                >
                  {`Auto — ${autoFirstName} first${noVideo ? ' (no video)' : ''}`}
                </button>
              </>
            )}
            {nativeOrder.map((mirrorId) => {
              const mirror = mirrorById(mirrorId)
              return (
                <button
                  key={mirror.id}
                  className="px-2 py-1.5 rounded hover:bg-surface-container-highest text-on-surface font-label-md text-label-md text-left"
                  type="button"
                  onClick={() => start(mirror.id)}
                >
                  {mirror.name}
                  {noVideo && (mirror.id === 'catboy' || mirror.id === 'hinai') ? ' (no video)' : ''}
                </button>
              )
            })}
            <span className="px-2 py-1 font-label-sm text-[10px] text-on-surface-variant">Full .osz set · {modeLabel(mode)} difficulty shown</span>
            {noVideo && (
              <span className="px-2 py-1 font-label-sm text-[10px] text-on-surface-variant">No-video: catboy and hinai serve their no-video files and osu! official uses ?noVideo=1; other mirrors serve the full file.</span>
            )}
          </div>
        )}
      </div>
      {copyFailedNote && (
        <span className="font-label-sm text-[10px] text-on-surface-variant text-right max-w-48">{copyFailedNote}</span>
      )}
    </div>
  )
}
