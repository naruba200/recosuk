import { useDownloadQueue, mirrorNameFor, type DownloadQueueItem } from '../lib/downloadQueue'
import { usePreviewPlayer } from '../lib/previewPlayer'

/**
 * Bottom-right dock + bottom player footer (batch 4, item C;
 * batch 6, parts 1 and 6).
 *
 * The download window is a fixed bottom-right card showing around
 * 3 rows, its list scrolling internally (part 6, item 3) — the
 * window never grows with the queue. The song player is a fixed
 * bottom FOOTER bar (part 6, item 4): it appears only while a
 * preview track is loaded and disappears on stop/close, and the
 * dock window sits above the footer while the footer is visible
 * (no overlap). When no preview is active the footer is fully
 * gone and the dock returns to its normal bottom-right position.
 *
 * Lifecycle invariant (part 6, item 2): the footer renders if and
 * only if the player holds a track, and stop() always pauses the
 * element and unloads the source — so there is no state with
 * audio playing but no player, and no visible player with
 * nothing playing. Closing the footer calls stop().
 *
 * Download rows show STATUS TEXT ONLY (batch 6, part 1): browser
 * downloads expose no progress to the page, so there is no
 * percentage, no byte count, and no rate — never faked. Each row
 * records what was handed off, via which mirror, no-video on/off,
 * and when, plus the Songs-folder copy outcome.
 */

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function QueueRow({ item }: { item: DownloadQueueItem }) {
  const retry = useDownloadQueue((s) => s.retry)
  const time = new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const statusLine =
    item.status === 'browser'
      ? `Downloading via your browser…${item.mirrorIdUsed ? ` · via ${mirrorNameFor(item.mirrorIdUsed)}` : ''}${item.noVideo ? ' · no video' : ''} · ${time}`
      : (item.note ?? 'Download failed.')
  return (
    <div className="flex flex-col gap-1 px-3 py-2 rounded-lg bg-surface-container">
      <div className="flex items-center gap-2 min-w-0">
        <span className="material-symbols-outlined text-[16px] flex-shrink-0 text-on-surface-variant">
          {item.status === 'browser' ? 'open_in_new' : 'error'}
        </span>
        <span className="font-label-md text-label-md text-on-surface truncate flex-1 min-w-0">{item.title}</span>
        <span className="font-label-sm text-label-sm text-on-surface-variant truncate flex-shrink-0">{item.artist}</span>
        <button
          className="px-2 py-0.5 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm flex-shrink-0"
          type="button"
          onClick={() => retry(item.id)}
        >
          Retry
        </button>
      </div>
      <p className="font-label-sm text-label-sm text-on-surface-variant truncate">{statusLine}</p>
      {item.status === 'browser' && item.copied === 'copied' && (
        <p className="font-label-sm text-label-sm text-on-surface-variant">Copied to your Songs folder.</p>
      )}
      {item.status === 'browser' && item.copied === 'failed' && item.note && (
        <p className="font-label-sm text-label-sm text-error">{item.note}</p>
      )}
    </div>
  )
}

function DownloadWindow() {
  const items = useDownloadQueue((s) => s.items)
  const setDockOpen = useDownloadQueue((s) => s.setDockOpen)
  const clearFinished = useDownloadQueue((s) => s.clearFinished)
  return (
    <section
      className="w-[340px] max-w-[calc(100vw-2rem)] rounded-xl bg-surface-container-low shadow-xl border border-surface-container-high flex flex-col overflow-hidden"
      aria-label="Downloads"
    >
      <header className="flex items-center gap-2 px-3 py-2.5">
        <span className="material-symbols-outlined text-primary text-[20px]">download</span>
        <h2 className="font-headline-sm text-headline-sm text-on-surface flex-1">Downloads</h2>
        <button
          className="px-2 py-1 rounded-full text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm"
          type="button"
          onClick={clearFinished}
        >
          Clear finished
        </button>
        <button
          className="w-8 h-8 rounded-full hover:bg-surface-container-high text-on-surface flex items-center justify-center"
          type="button"
          aria-label="Hide download window"
          title="Hide download window"
          onClick={() => setDockOpen(false)}
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </header>
      {/* Around 3 rows visible; the rest scrolls inside the
          window instead of growing it (part 6, item 3). */}
      <div className="flex flex-col gap-1.5 px-2 pb-2 max-h-[210px] overflow-y-auto">
        {items.length === 0 && (
          <p className="px-1 py-2 font-body-sm text-body-sm text-on-surface-variant">Nothing downloaded yet.</p>
        )}
        {items.map((item) => (
          <QueueRow key={item.id} item={item} />
        ))}
      </div>
    </section>
  )
}

/**
 * Bottom footer bar (part 6, item 4): same controls and styling as
 * the old floating player window, only the placement/container
 * changed. Exactly ONE progress/seek control (part 6, item 1):
 * the range slider with its time display — the thin progress bar
 * that used to sit below it duplicated the slider and is gone.
 * Seeking still works from the slider; there is no buffered-state
 * display (none existed). The close button stops playback AND
 * dismisses the footer (part 6, item 2): stop() pauses, unloads
 * the source, and clears the track, so the footer unmounts.
 */
function PlayerFooter() {
  const preview = usePreviewPlayer()
  const track = preview.track
  if (!track) return null
  return (
    <section
      className="fixed inset-x-0 bottom-0 z-40 border-t border-surface-container-high bg-surface-container-low"
      aria-label="Song player"
    >
      <div className="flex items-center gap-3 px-3 py-2.5 min-w-0">
        <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 bg-surface-container-highest">
          {track.cover ? (
            <img className="w-full h-full object-cover" alt="" src={track.cover} />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="material-symbols-outlined text-on-surface-variant">music_note</span>
            </div>
          )}
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="font-label-md text-label-md text-on-surface truncate">{track.title || 'Preview'}</span>
          <span className="font-label-sm text-label-sm text-on-surface-variant truncate">{track.artist}</span>
        </div>
        <button
          className="w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center flex-shrink-0"
          type="button"
          aria-label={preview.paused ? 'Resume preview' : 'Pause preview'}
          title={preview.paused ? 'Resume' : 'Pause'}
          onClick={() => (preview.paused ? preview.resume() : preview.pause())}
        >
          <span className="material-symbols-outlined text-[20px]">{preview.paused ? 'play_arrow' : 'pause'}</span>
        </button>
        <button
          className="w-8 h-8 rounded-full hover:bg-surface-container-high text-on-surface flex items-center justify-center flex-shrink-0"
          type="button"
          aria-label="Stop preview and close player"
          title="Stop preview and close the player"
          onClick={() => preview.stop()}
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
      <div className="flex items-center gap-2 px-3 pb-3">
        <span className="font-label-sm text-label-sm text-on-surface-variant tabular-nums">{formatTime(preview.currentTime)}</span>
        <input
          className="flex-1 accent-primary cursor-pointer"
          type="range"
          min={0}
          max={preview.duration > 0 ? preview.duration : 0}
          step={0.1}
          value={preview.currentTime}
          aria-label="Seek preview"
          onChange={(e) => preview.seekTo(Number(e.target.value))}
        />
        <span className="font-label-sm text-label-sm text-on-surface-variant tabular-nums">{formatTime(preview.duration)}</span>
      </div>
    </section>
  )
}

export default function DownloadDock() {
  const items = useDownloadQueue((s) => s.items)
  const dockOpen = useDownloadQueue((s) => s.dockOpen)
  const setDockOpen = useDownloadQueue((s) => s.setDockOpen)
  const preview = usePreviewPlayer()
  const hasPlayer = preview.track !== null
  const showDownloadWindow = dockOpen && items.length > 0
  // No in-progress state exists for browser downloads, so the
  // reopen button shows whenever recorded downloads exist.
  const showReopen = !dockOpen && items.length > 0

  if (!showDownloadWindow && !hasPlayer && !showReopen) return null
  // Footer clearance (part 6, item 4): the footer is ~96px tall
  // (44px cover row + seek row + padding), so while it is visible
  // the dock column and the reopen button sit 112px up — footer
  // height plus a 1rem gap — instead of overlapping it. When no
  // preview is active the footer is gone and both return to the
  // normal bottom-right position.
  const dockBottom = hasPlayer ? 'bottom-[112px]' : 'bottom-4'
  return (
    <>
      {hasPlayer && <PlayerFooter />}
      {showDownloadWindow && (
        <div className={`fixed right-4 z-40 flex flex-col items-end gap-2 ${dockBottom}`}>
          <DownloadWindow />
        </div>
      )}
      {showReopen && (
        <button
          className={`fixed right-4 z-40 w-11 h-11 rounded-full bg-primary text-on-primary shadow-xl flex items-center justify-center ${dockBottom}`}
          type="button"
          aria-label="Show downloads"
          title="Show downloads"
          onClick={() => setDockOpen(true)}
        >
          <span className="material-symbols-outlined text-[20px]">download</span>
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-error text-on-error font-label-sm text-[10px] flex items-center justify-center">
            {items.length}
          </span>
        </button>
      )}
    </>
  )
}
