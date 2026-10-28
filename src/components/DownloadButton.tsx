import { useEffect, useRef, useState } from 'react'
import { downloadManager } from '../lib/downloadManager'
import { MIRRORS, mirrorById, recordDownload } from '../lib/mirrors'
import { modeLabel, type GameMode } from '../lib/mode'

/**
 * Shared download affordance for BeatmapRow (Recommendations,
 * Welcome Recs, Mirror). Behaviour only — the button/menu styling
 * follows the existing row action suite.
 *
 * Downloads are NATIVE browser downloads (QA fix): the button hands
 * the mirror URL to a hidden iframe and the browser's download
 * manager fetches the .osz at full speed. No fetch(), no Blob
 * buffering, and no progress bar — native downloads report no
 * progress to the page, so the UI honestly says "Downloading via
 * your browser…" and then "Check your browser downloads". Nothing
 * here fakes a percentage.
 *
 * - Main button: Auto (Beatconnect first). The download is recorded
 *   on click (success cannot be observed from the page).
 * - Expand menu: pick one mirror, or the official osu! page. The
 *   official option is a plain new-tab link: osu! downloads need an
 *   osu! login session and are not available via the API, so RecOsuk
 *   cannot fetch that file itself.
 */

type ButtonState = { kind: 'idle' } | { kind: 'downloading'; mirrorId: string } | { kind: 'done'; mirrorId: string }

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
  mode,
  seenKeyValue,
  downloaded = false,
  onDownloaded,
}: DownloadButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [state, setState] = useState<ButtonState>({ kind: 'idle' })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  const start = (mirrorId?: string) => {
    setMenuOpen(false)
    if (timerRef.current) clearTimeout(timerRef.current)
    const result = downloadManager.startDownload({ beatmapsetId, mirrorId, seenKeyValue })
    setState({ kind: 'downloading', mirrorId: result.mirrorId })
    onDownloaded?.()
    // Native downloads give the page no completion signal; resolve to
    // "done" shortly after the handoff instead of faking progress.
    timerRef.current = setTimeout(() => {
      setState({ kind: 'done', mirrorId: result.mirrorId })
    }, 2500)
  }

  const openOfficial = () => {
    void recordDownload(seenKeyValue, beatmapsetId, 'official')
    setMenuOpen(false)
    onDownloaded?.()
  }

  const statusNote =
    state.kind === 'downloading'
      ? `Downloading via your browser (${mirrorById(state.mirrorId).name}) — check your downloads`
      : state.kind === 'done'
        ? `.osz requested via ${mirrorById(state.mirrorId).name} — check your browser downloads`
        : null

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5 relative">
        <button
          className={`w-9 h-9 rounded-full ${downloaded || state.kind === 'done' ? 'bg-surface-container-highest text-tertiary' : state.kind === 'downloading' ? 'bg-primary text-on-primary' : 'bg-surface-container hover:bg-secondary hover:text-on-secondary text-on-surface'} flex items-center justify-center transition-all shadow-sm`}
          title={
            state.kind === 'downloading'
              ? 'Download handed to your browser'
              : state.kind === 'done'
                ? 'Downloaded — open the mirror menu to download again'
                : downloaded
                  ? 'Downloaded — click to download again'
                  : 'Download .osz in RecOsuk'
          }
          type="button"
          onClick={() => start()}
        >
          <span className="material-symbols-outlined text-[18px]">
            {downloaded || state.kind === 'done'
              ? 'check_circle'
              : state.kind === 'downloading'
                ? 'downloading'
                : 'download'}
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
              Auto — Beatconnect first
            </button>
            {MIRRORS.filter((m) => m.id !== 'official').map((mirror) => (
              <button
                key={mirror.id}
                className="px-2 py-1.5 rounded hover:bg-surface-container-highest text-on-surface font-label-md text-label-md text-left"
                type="button"
                onClick={() => start(mirror.id)}
              >
                {mirror.name}
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
          </div>
        )}
      </div>
      {statusNote && (
        <span className="font-label-sm text-[10px] text-on-surface-variant text-right max-w-48">{statusNote}</span>
      )}
    </div>
  )
}
