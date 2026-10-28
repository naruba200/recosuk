import { useEffect, useRef, useState } from 'react'
import { downloadManager, type DownloadProgress, type DownloadStatus } from '../lib/downloadManager'
import { MIRRORS, mirrorById, recordDownload } from '../lib/mirrors'
import { modeLabel, type GameMode } from '../lib/mode'

/**
 * Shared download affordance for BeatmapRow (Recommendations,
 * Welcome Recs, Mirror). Behaviour only — the button/menu styling
 * follows the existing row action suite.
 *
 * - Main button: Auto download (mirrors in order, in-page when the
 *   mirror allows CORS; otherwise the browser takes over in a new tab).
 * - Expand menu: pick one mirror, or the official osu! page. The
 *   official option is a plain new-tab link: osu! downloads need an
 *   osu! login session and are not available via the API, so RecOsuk
 *   cannot fetch that file itself.
 * - While downloading: progress + Cancel. Done / external-open /
 *   error states are labelled honestly; nothing pretends a file saved
 *   when the browser took over.
 */

type ButtonState =
  | { kind: 'idle' }
  | { kind: 'downloading'; progress: DownloadProgress | null }
  | { kind: 'done'; mirrorId: string }
  | { kind: 'opened-externally'; mirrorId: string }
  | { kind: 'error' }

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
  const [state, setState] = useState<ButtonState>({ kind: 'idle' })
  const handleRef = useRef<ReturnType<typeof downloadManager.download> | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const start = (mirrorId?: string) => {
    setMenuOpen(false)
    const handle = downloadManager.download({
      beatmapsetId,
      artist,
      title,
      mirrorId,
      seenKeyValue,
      onProgress: (progress) => {
        if (mountedRef.current) {
          setState({ kind: 'downloading', progress })
        }
      },
    })
    handleRef.current = handle
    setState({ kind: 'downloading', progress: null })
    void handle.promise.then((result: { status: DownloadStatus; mirrorId: string }) => {
      if (!mountedRef.current) return
      if (result.status === 'downloaded') {
        setState({ kind: 'done', mirrorId: result.mirrorId })
        onDownloaded?.()
      } else if (result.status === 'opened-externally') {
        setState({ kind: 'opened-externally', mirrorId: result.mirrorId })
        onDownloaded?.()
      } else {
        setState({ kind: 'idle' })
      }
    })
  }

  const cancel = () => {
    handleRef.current?.cancel()
    setState({ kind: 'idle' })
  }

  const openOfficial = () => {
    void recordDownload(seenKeyValue, beatmapsetId, 'official')
    setMenuOpen(false)
    onDownloaded?.()
  }

  const progress =
    state.kind === 'downloading' ? state.progress : null
  const pct =
    progress && progress.total ? Math.min(100, Math.round((progress.received / progress.total) * 100)) : null
  const receivedMb = progress ? (progress.received / 1_048_576).toFixed(1) : null
  const totalMb =
    progress?.total != null ? (progress.total / 1_048_576).toFixed(1) : null

  const statusNote =
    state.kind === 'downloading'
      ? `Downloading… ${pct !== null ? `${pct}% · ` : ''}${receivedMb} MB${totalMb ? ` / ${totalMb} MB` : ''}`
      : state.kind === 'done'
        ? `.osz saved via ${mirrorById(state.mirrorId).name}`
        : state.kind === 'opened-externally'
          ? `Your browser is handling the download (${mirrorById(state.mirrorId).name})`
          : state.kind === 'error'
            ? 'Download failed — tap to retry'
            : null

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5 relative">
        {state.kind === 'downloading' ? (
          <button
            className="w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center transition-all shadow-sm"
            title="Cancel download"
            type="button"
            onClick={cancel}
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        ) : (
          <button
            className={`w-9 h-9 rounded-full ${downloaded || state.kind === 'done' ? 'bg-surface-container-highest text-tertiary' : 'bg-surface-container hover:bg-secondary hover:text-on-secondary text-on-surface'} flex items-center justify-center transition-all shadow-sm`}
            title={
              state.kind === 'done'
                ? 'Downloaded — open the mirror menu to download again'
                : state.kind === 'opened-externally'
                  ? 'Download opened in your browser — open the mirror menu to try again in RecOsuk'
                  : state.kind === 'error'
                    ? 'Retry download'
                    : downloaded
                      ? 'Downloaded — click to download again'
                      : 'Download .osz in RecOsuk'
            }
            type="button"
            onClick={() => start()}
          >
            <span className="material-symbols-outlined text-[18px]">
              {downloaded || state.kind === 'done' ? 'check_circle' : state.kind === 'error' ? 'refresh' : 'download'}
            </span>
          </button>
        )}
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
              Auto — fastest mirror that works
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
      {state.kind === 'downloading' && (
        <div className="w-full min-w-36 h-1 rounded-full bg-surface-container-highest overflow-hidden" role="progressbar" aria-valuenow={pct ?? undefined} aria-valuemin={0} aria-valuemax={100}>
          <div
            className="h-full bg-primary transition-all"
            style={{ width: pct !== null ? `${pct}%` : '30%' }}
          ></div>
        </div>
      )}
      {statusNote && (
        <span className="font-label-sm text-[10px] text-on-surface-variant text-right max-w-48">{statusNote}</span>
      )}
    </div>
  )
}
