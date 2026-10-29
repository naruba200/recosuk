import { useState } from 'react'
import { MIRRORS } from '../lib/mirrors'
import { useDownloadSettings } from '../lib/downloadSettings'
import { useDownloadQueue } from '../lib/downloadQueue'
import { modeLabel, type GameMode } from '../lib/mode'

/**
 * Shared download affordance for BeatmapRow (Recommendations,
 * Welcome Recs, Mirror). Behaviour only — the button/menu styling
 * follows the existing row action suite.
 *
 * Downloads go through the DOWNLOAD REGISTER (batch 6, part 1):
 * the button hands the set to the browser's native downloader via
 * a hidden iframe (batch 2/3) and registers the click in the
 * bottom-right dock window. There is NO in-app fetch, NO chunked
 * fetch, and NO Blob save for the download itself — the browser's
 * downloader is the only mechanism, and it reports no progress to
 * the page, so the dock row shows status text only.
 * The finished state is ICON-ONLY (QA batch 2): the button flips
 * to a redo icon (batch 6, part 5 — clicking it re-triggers the
 * browser download, same as a fresh click) and shows no done-state
 * text at all.
 *
 * Songs-folder auto-copy (opt-in) still runs from the register
 * via its own plain single-stream fetch — that fetch is the copy,
 * not the download (see lib/downloadQueue.ts).
 *
 * - Main button: osu! OFFICIAL first (batch 12, part 9) — the
 *   download goes through the hidden-iframe handoff like the
 *   native mirrors (batch 13: no redirect, no new tab; the
 *   browser's osu! session does the auth) and registers the
 *   attempt in the dock, so Retry cycles on from official to
 *   the native mirrors — except a Retry while the row is still
 *   on official, which opens the official page in a new tab as
 *   the visible fallback for a signed-out user.
 * - Expand menu: official first, then Auto (native order), then
 *   each native mirror. The official entry is a register action,
 *   not a bare link, so its attempt is tracked like any other.
 */

interface DownloadButtonProps {
  beatmapsetId: number
  artist: string
  title: string
  mode: GameMode
  seenKeyValue: string
  downloaded?: boolean
  /**
   * Mirror only: hide the done-state (replay) icon even when the
   * set was downloaded / registered. Recording is untouched —
   * the click still registers and records the download.
   */
  suppressDownloadedState?: boolean
  onDownloaded?: () => void
}

export default function DownloadButton({
  beatmapsetId,
  artist,
  title,
  mode,
  seenKeyValue,
  downloaded = false,
  suppressDownloadedState = false,
  onDownloaded,
}: DownloadButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const noVideo = useDownloadSettings((s) => s.noVideo)
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

  // Primary action (batch 12, part 9; batch 13): osu! official
  // first. The register hands the official URL to the browser
  // via the hidden-iframe handoff (no redirect, no new tab) and
  // tracks the attempt, so the dock Retry cycle starts from
  // official — with the tab fallback on a Retry while the row
  // is still on official.
  const startOfficial = () => start('official')

  const isDone = suppressDownloadedState
    ? false
    : downloaded || latest?.status === 'browser'
  // The one exception to icon-only: a failed Songs-folder copy must
  // stay visible (the dock row says it too, but the dock can be
  // hidden while this row stays on screen).
  const copyFailedNote =
    latest?.copied === 'failed'
      ? 'Browser download started — the Songs-folder copy failed. Check Settings.'
      : null

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5 relative">
        <button
          className={`w-9 h-9 rounded-full ${isDone ? 'bg-surface-container-highest text-tertiary hover:bg-secondary hover:text-on-secondary' : 'bg-surface-container hover:bg-secondary hover:text-on-secondary text-on-surface'} flex items-center justify-center transition-all shadow-sm`}
          aria-label={isDone ? 'Download again' : 'Download .osz'}
          title={isDone ? 'Download again from osu! official' : 'Download .osz from osu! official'}
          type="button"
          onClick={startOfficial}
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
              {noVideo ? 'Auto — catboy first (no video)' : 'Auto — Beatconnect first'}
            </button>
            {MIRRORS.filter((m) => m.id !== 'official').map((mirror) => (
              <button
                key={mirror.id}
                className="px-2 py-1.5 rounded hover:bg-surface-container-highest text-on-surface font-label-md text-label-md text-left"
                type="button"
                onClick={() => start(mirror.id)}
              >
                {mirror.name}
                {noVideo && mirror.id === 'catboy' ? ' (no video)' : ''}
              </button>
            ))}
            <span className="px-2 py-1 font-label-sm text-[10px] text-on-surface-variant">Full .osz set · {modeLabel(mode)} difficulty shown</span>
            {noVideo && (
              <span className="px-2 py-1 font-label-sm text-[10px] text-on-surface-variant">No-video: catboy serves its no-video file and osu! official uses ?noVideo=1; other mirrors serve the full file.</span>
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
