import { useState } from 'react'
import { MIRRORS, recordDownload } from '../lib/mirrors'
import { useDownloadSettings } from '../lib/downloadSettings'
import { useDownloadQueue } from '../lib/downloadQueue'
import { modeLabel, type GameMode } from '../lib/mode'

/**
 * Shared download affordance for BeatmapRow (Recommendations,
 * Welcome Recs, Mirror). Behaviour only — the button/menu styling
 * follows the existing row action suite.
 *
 * Downloads go through the DOWNLOAD QUEUE (batch 4, item C): the
 * button enqueues the set and the bottom-right dock window shows
 * real progress + rate, one file at a time. When the in-app fetch
 * completes, the file is saved to the machine immediately; when
 * fetch is blocked (CORS — most mirrors), the queue hands the URL
 * to the browser's native downloader and marks the row honestly.
 * The finished state is ICON-ONLY (QA batch 2): the button flips
 * to a checkmark and shows no done-state text at all.
 *
 * Songs-folder auto-copy (opt-in) is handled by the queue worker
 * from the SAME fetched bytes — never a second fetch (see
 * lib/downloadQueue.ts).
 *
 * - Main button: Auto (Beatconnect first; catboy first when
 *   no-video is on). Enqueued + recorded on click.
 * - Expand menu: pick one mirror, or the official osu! page. The
 *   official option is a plain new-tab link: osu! downloads need an
 *   osu! login session and are not available via the API, so RecOsuk
 *   cannot fetch that file itself.
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
  const enqueue = useDownloadQueue((s) => s.enqueue)
  // Latest queue item for THIS set drives the button icon; the
  // dock window owns the detailed progress/copy reporting.
  const latest = useDownloadQueue((s) => {
    const mine = s.items.filter((i) => i.beatmapsetId === beatmapsetId)
    return mine[mine.length - 1]
  })

  const start = (mirrorId?: string, opts: { noVideo?: boolean } = {}) => {
    setMenuOpen(false)
    enqueue({
      beatmapsetId,
      artist,
      title,
      seenKeyValue,
      mirrorId,
      noVideo: opts.noVideo ?? noVideo,
    })
    onDownloaded?.()
  }

  // Full-file retry for a no-video attempt handed to the browser
  // (batch 3, item D): normal mirror order, no-video off. One click
  // from working when the no-video endpoint refuses the request.
  const showFullFileRetry =
    !!latest && latest.status === 'browser' && latest.noVideo
  const retryFullFile = () => start(undefined, { noVideo: false })

  const openOfficial = () => {
    void recordDownload(seenKeyValue, beatmapsetId, 'official')
    setMenuOpen(false)
    onDownloaded?.()
  }

  const inFlight = latest?.status === 'queued' || latest?.status === 'downloading'
  const isDone = downloaded || latest?.status === 'done' || latest?.status === 'browser'
  // The one exception to icon-only: a failed Songs-folder copy must
  // stay visible (the dock row says it too, but the dock can be
  // hidden while this row stays on screen).
  const copyFailedNote =
    latest?.status === 'done' && latest.copied === 'failed'
      ? 'Browser download started — the Songs-folder copy failed. Check Settings.'
      : null

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5 relative">
        <button
          className={`w-9 h-9 rounded-full ${isDone ? 'bg-surface-container-highest text-tertiary' : inFlight ? 'bg-primary text-on-primary' : 'bg-surface-container hover:bg-secondary hover:text-on-secondary text-on-surface'} flex items-center justify-center transition-all shadow-sm`}
          aria-label={
            inFlight
              ? 'Download queued — see the download window for progress'
              : isDone
                ? 'Download requested — check your browser downloads'
                : downloaded
                  ? 'Downloaded — click to download again'
                  : 'Download .osz'
          }
          title={
            inFlight
              ? 'Downloading — progress is in the download window'
              : isDone
                ? 'Downloaded — open the mirror menu to download again'
                : downloaded
                  ? 'Downloaded — click to download again'
                  : 'Download .osz in RecOsuk'
          }
          type="button"
          onClick={() => start()}
        >
          <span className="material-symbols-outlined text-[18px]">
            {isDone ? 'check_circle' : inFlight ? 'downloading' : 'download'}
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
            <a
              className="px-2 py-1.5 rounded hover:bg-surface-container-highest text-on-surface font-label-md text-label-md"
              href={MIRRORS[0].url(beatmapsetId)}
              target="_blank"
              rel="noreferrer"
              onClick={openOfficial}
            >
              osu! official — opens osu! page (needs your osu! login)
            </a>
            <span className="px-2 py-1 font-label-sm text-[10px] text-on-surface-variant">Full .osz set · {modeLabel(mode)} difficulty shown</span>
            {noVideo && (
              <span className="px-2 py-1 font-label-sm text-[10px] text-on-surface-variant">No-video downloads use catboy&apos;s no-video file; other mirrors serve the full file.</span>
            )}
          </div>
        )}
      </div>
      {copyFailedNote && (
        <span className="font-label-sm text-[10px] text-on-surface-variant text-right max-w-48">{copyFailedNote}</span>
      )}
      {showFullFileRetry && (
        <button
          className="font-label-sm text-[11px] text-primary hover:underline text-right"
          type="button"
          title="The no-video file may have been refused by the mirror — download the full file instead"
          onClick={retryFullFile}
        >
          No video not downloading? Get the full file
        </button>
      )}
    </div>
  )
}
