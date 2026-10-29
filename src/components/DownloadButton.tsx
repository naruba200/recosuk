import { useState } from 'react'
import { mirrorById } from '../lib/mirrors'
import { useDownloadSettings } from '../lib/downloadSettings'
import { displayOrderFor, mirrorNameFor, useDownloadQueue } from '../lib/downloadQueue'
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
 *   official download opens in a NEW TAB (batch 14, reverting
 *   batch 13: the hidden-iframe handoff cannot carry the osu!
 *   session — X-Frame-Options + SameSite, live-verified failure
 *   2026-10-29 — while a top-level tab navigation sends the
 *   cookie) and registers the attempt in the dock, so Retry
 *   cycles on from official to the native mirrors.
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
  onDownloaded?: () => void
}

export default function DownloadButton({
  beatmapsetId,
  artist,
  title,
  mode,
  seenKeyValue,
  downloaded = false,
  onDownloaded,
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
  // first. The register opens the official URL in a new tab
  // (the iframe handoff cannot carry the osu! session) and
  // tracks the attempt, so the dock Retry cycle starts from
  // official.
  const startOfficial = () => start('official')

  // Picker order: official pinned first (the entry above),
  // then the native mirrors in the resolved order — the user's
  // Mirror Route Priority from Settings, or the built-in default.
  const nativeOrder = displayOrderFor(noVideo).filter((id) => id !== 'official')
  const autoFirstName = mirrorNameFor(nativeOrder[0] ?? null)

  // Done state: the `downloaded` prop (seen store) or the latest
  // register entry. Every screen shows it the same way — the
  // Mirror-only suppression (batch 11, part 3) was removed in
  // §AE: it was the reason the Mirror icon never flipped after
  // a download.
  const isDone = downloaded || latest?.status === 'browser'
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
              {`Auto — ${autoFirstName} first${noVideo ? ' (no video)' : ''}`}
            </button>
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
                  {noVideo && mirror.id === 'catboy' ? ' (no video)' : ''}
                </button>
              )
            })}
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
