import { useEffect, useRef, useState } from 'react'
import { downloadManager } from '../lib/downloadManager'
import { MIRRORS, mirrorById, recordDownload } from '../lib/mirrors'
import { useDownloadSettings } from '../lib/downloadSettings'
import { attemptSongsCopy } from '../lib/songCopy'
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
 * your browser…" while the handoff is fresh. The finished state is
 * ICON-ONLY (QA batch 2): the button flips to a checkmark and shows
 * no done-state text at all — the mirror name survives only in the
 * accessible label/title, never as visible copy.
 *
 * Songs-folder auto-copy (item 8, opt-in): when the setting is on,
 * the button ALSO fetches the file and writes it into the user's
 * picked Songs folder (see lib/songCopy.ts). That copy is
 * best-effort and never blocks the browser download; a failed copy
 * is reported honestly in the transient note, and a successful one
 * is never claimed before the stream actually closes.
 *
 * - Main button: Auto (Beatconnect first; catboy first when
 *   no-video is on). The download is recorded on click (success
 *   cannot be observed from the page).
 * - Expand menu: pick one mirror, or the official osu! page. The
 *   official option is a plain new-tab link: osu! downloads need an
 *   osu! login session and are not available via the API, so RecOsuk
 *   cannot fetch that file itself.
 */

type CopyState = 'idle' | 'copying' | 'copied' | 'failed'

type ButtonState =
  | { kind: 'idle' }
  | { kind: 'downloading'; mirrorId: string; noVideoApplied: boolean; copy: CopyState }
  | { kind: 'done'; mirrorId: string; noVideoApplied: boolean; copy: CopyState }

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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copyRunRef = useRef(0)
  const noVideo = useDownloadSettings((s) => s.noVideo)
  const autoCopy = useDownloadSettings((s) => s.autoCopy)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  const start = (mirrorId?: string) => {
    setMenuOpen(false)
    if (timerRef.current) clearTimeout(timerRef.current)
    const result = downloadManager.startDownload({
      beatmapsetId,
      mirrorId,
      seenKeyValue,
      noVideo,
    })
    const copyRun = ++copyRunRef.current
    setState({
      kind: 'downloading',
      mirrorId: result.mirrorId,
      noVideoApplied: result.noVideoApplied,
      copy: autoCopy ? 'copying' : 'idle',
    })
    onDownloaded?.()
    // Songs-folder auto-copy (item 8): best-effort, in addition to
    // the browser download above. A stale resolution (user clicked
    // another download meanwhile) must not rewrite the new state.
    if (autoCopy) {
      void attemptSongsCopy({ beatmapsetId, artist, title, noVideo }).then((outcome) => {
        if (copyRunRef.current !== copyRun) return
        const copy: CopyState = outcome.status === 'copied' ? 'copied' : outcome.status === 'failed' ? 'failed' : 'idle'
        setState((prev) =>
          prev.kind === 'idle' ? prev : { ...prev, copy },
        )
      })
    }
    // Native downloads give the page no completion signal; resolve to
    // "done" shortly after the handoff instead of faking progress.
    timerRef.current = setTimeout(() => {
      setState((prev) =>
        prev.kind === 'downloading'
          ? { kind: 'done', mirrorId: prev.mirrorId, noVideoApplied: prev.noVideoApplied, copy: prev.copy }
          : prev,
      )
    }, 2500)
  }

  const openOfficial = () => {
    void recordDownload(seenKeyValue, beatmapsetId, 'official')
    setMenuOpen(false)
    onDownloaded?.()
  }

  // Transient handoff text only. The finished state renders NO
  // visible text (icon-only, QA batch 2) — the mirror name is kept
  // in the button's title/aria-label, not in on-screen copy. The one
  // exception is an honest copy FAILURE note: a failed Songs-folder
  // copy must be visible, never silently swallowed.
  const statusNote =
    state.kind === 'downloading'
      ? `Downloading via your browser (${mirrorById(state.mirrorId).name}${state.noVideoApplied ? ' · no video' : ''}) — check your downloads${state.copy === 'copying' ? ' · copying to Songs folder…' : state.copy === 'copied' ? ' · copied to Songs folder' : state.copy === 'failed' ? ' · Songs-folder copy failed' : ''}`
      : state.kind === 'done' && state.copy === 'failed'
        ? 'Browser download started — the Songs-folder copy failed. Check Settings.'
        : null

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5 relative">
        <button
          className={`w-9 h-9 rounded-full ${downloaded || state.kind === 'done' ? 'bg-surface-container-highest text-tertiary' : state.kind === 'downloading' ? 'bg-primary text-on-primary' : 'bg-surface-container hover:bg-secondary hover:text-on-secondary text-on-surface'} flex items-center justify-center transition-all shadow-sm`}
          aria-label={
            state.kind === 'downloading'
              ? `Download handed to your browser via ${mirrorById(state.mirrorId).name}`
              : state.kind === 'done'
                ? `Download requested via ${mirrorById(state.mirrorId).name} — check your browser downloads`
                : downloaded
                  ? 'Downloaded — click to download again'
                  : 'Download .osz'
          }
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
      {statusNote && (
        <span className="font-label-sm text-[10px] text-on-surface-variant text-right max-w-48">{statusNote}</span>
      )}
    </div>
  )
}
