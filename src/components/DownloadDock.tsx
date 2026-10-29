import { useDownloadQueue, queueHasActiveItems, mirrorNameFor, type DownloadQueueItem } from '../lib/downloadQueue'
import { usePreviewPlayer } from '../lib/previewPlayer'

/**
 * Bottom-right dock (batch 4, item C): the download queue window and
 * the song player window share one fixed column. The download window
 * is bottom-most; the player window sits directly above it, so when
 * the download window appears it pushes the player window upward.
 * When only one window exists it sits at the bottom-right corner.
 * Closing a window hides it without stopping its work: downloads
 * keep processing, and the player keeps playing until closed (its
 * close stops playback).
 */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatRate(bps: number): string {
  if (bps <= 0) return ''
  return `${formatBytes(Math.round(bps))}/s`
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function QueueRow({ item }: { item: DownloadQueueItem }) {
  const cancel = useDownloadQueue((s) => s.cancel)
  const retry = useDownloadQueue((s) => s.retry)
  const pct =
    item.totalBytes && item.totalBytes > 0
      ? Math.min(100, Math.round((item.downloadedBytes / item.totalBytes) * 100))
      : null
  const statusLine =
    item.status === 'downloading'
      ? `${pct !== null ? `${pct}% · ` : ''}${formatBytes(item.downloadedBytes)}${item.totalBytes ? ` of ${formatBytes(item.totalBytes)}` : ''}${formatRate(item.rateBps) ? ` · ${formatRate(item.rateBps)}` : ''}${item.mirrorIdUsed ? ` · ${mirrorNameFor(item.mirrorIdUsed)}` : ''}`
      : item.status === 'done'
        ? `Done · ${formatBytes(item.downloadedBytes)}${item.copied === 'copied' ? ' · copied to Songs folder' : item.copied === 'failed' ? ' · Songs-folder copy failed' : ''}`
        : item.status === 'browser'
          ? `Handed to your browser${item.mirrorIdUsed ? ` via ${mirrorNameFor(item.mirrorIdUsed)}` : ''}`
          : item.status === 'failed'
            ? (item.note ?? 'Download failed.')
            : item.status === 'cancelled'
              ? 'Cancelled.'
              : 'Queued — waiting for the download ahead of it.'
  return (
    <div className="flex flex-col gap-1 px-3 py-2 rounded-lg bg-surface-container">
      <div className="flex items-center gap-2 min-w-0">
        <span className="material-symbols-outlined text-[16px] flex-shrink-0 text-on-surface-variant">
          {item.status === 'done' ? 'check_circle' : item.status === 'browser' ? 'open_in_new' : item.status === 'failed' ? 'error' : item.status === 'cancelled' ? 'cancel' : 'downloading'}
        </span>
        <span className="font-label-md text-label-md text-on-surface truncate flex-1 min-w-0">{item.title}</span>
        <span className="font-label-sm text-label-sm text-on-surface-variant truncate flex-shrink-0">{item.artist}</span>
        {(item.status === 'queued' || item.status === 'downloading') && (
          <button
            className="w-6 h-6 rounded-full hover:bg-surface-container-high text-on-surface-variant flex items-center justify-center flex-shrink-0"
            type="button"
            aria-label={`Cancel download of ${item.title}`}
            title="Cancel download"
            onClick={() => cancel(item.id)}
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        )}
        {(item.status === 'failed' || item.status === 'browser' || item.status === 'cancelled') && (
          <button
            className="px-2 py-0.5 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm flex-shrink-0"
            type="button"
            onClick={() => retry(item.id)}
          >
            Retry
          </button>
        )}
      </div>
      {item.status === 'downloading' && (
        <div className="h-1 rounded-full bg-surface-container-highest overflow-hidden" aria-hidden="true">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: pct !== null ? `${pct}%` : '100%', opacity: pct !== null ? 1 : 0.5 }}
          />
        </div>
      )}
      <p className="font-label-sm text-label-sm text-on-surface-variant truncate">{statusLine}</p>
      {item.status === 'browser' && item.note && (
        <p className="font-label-sm text-label-sm text-on-surface-variant">{item.note}</p>
      )}
      {item.status === 'failed' && item.note && (
        <p className="font-label-sm text-label-sm text-error">{item.note}</p>
      )}
    </div>
  )
}

function DownloadWindow() {
  const items = useDownloadQueue((s) => s.items)
  const setDockOpen = useDownloadQueue((s) => s.setDockOpen)
  const clearFinished = useDownloadQueue((s) => s.clearFinished)
  const active = items.filter((i) => i.status === 'queued' || i.status === 'downloading').length
  return (
    <section
      className="w-[340px] max-w-[calc(100vw-2rem)] rounded-xl bg-surface-container-low shadow-xl border border-surface-container-high flex flex-col overflow-hidden"
      aria-label="Download queue"
    >
      <header className="flex items-center gap-2 px-3 py-2.5">
        <span className="material-symbols-outlined text-primary text-[20px]">download</span>
        <h2 className="font-headline-sm text-headline-sm text-on-surface flex-1">Downloads</h2>
        {active > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm">
            {active} active
          </span>
        )}
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
          title="Hide — downloads keep running"
          onClick={() => setDockOpen(false)}
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </header>
      <div className="flex flex-col gap-1.5 px-2 pb-2 max-h-[40vh] overflow-y-auto">
        {items.length === 0 && (
          <p className="px-1 py-2 font-body-sm text-body-sm text-on-surface-variant">Nothing queued yet.</p>
        )}
        {items.map((item) => (
          <QueueRow key={item.id} item={item} />
        ))}
      </div>
    </section>
  )
}

function PlayerWindow() {
  const preview = usePreviewPlayer()
  const track = preview.track
  if (!track) return null
  const progress = preview.duration > 0 ? (preview.currentTime / preview.duration) * 100 : 0
  return (
    <section
      className="w-[340px] max-w-[calc(100vw-2rem)] rounded-xl bg-surface-container-low shadow-xl border border-surface-container-high flex flex-col overflow-hidden"
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
          aria-label="Close player"
          title="Close player"
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
      <div className="h-1 bg-surface-container-highest overflow-hidden" aria-hidden="true">
        <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
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
  const hasActive = queueHasActiveItems(items)
  const showDownloadWindow = dockOpen && items.length > 0
  const showReopen = !dockOpen && hasActive

  if (!showDownloadWindow && !hasPlayer && !showReopen) return null
  return (
    <>
      {/* Column order = visual order: the player window sits above
          the download window, so the download window (bottom-most)
          pushes the player upward when it appears. */}
      <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
        {hasPlayer && <PlayerWindow />}
        {showDownloadWindow && <DownloadWindow />}
      </div>
      {showReopen && (
        <button
          className="fixed bottom-4 right-4 z-40 w-11 h-11 rounded-full bg-primary text-on-primary shadow-xl flex items-center justify-center"
          type="button"
          aria-label="Show download queue"
          title="Show downloads"
          onClick={() => setDockOpen(true)}
        >
          <span className="material-symbols-outlined text-[20px]">download</span>
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-error text-on-error font-label-sm text-[10px] flex items-center justify-center">
            {items.filter((i) => i.status === 'queued' || i.status === 'downloading').length}
          </span>
        </button>
      )}
    </>
  )
}
