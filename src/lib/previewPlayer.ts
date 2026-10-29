import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Preview audio (PLAN-v2 §0/§8): one shared <audio> element for the
 * whole app, playing https://b.ppy.sh/preview/{beatmapset_id}.mp3.
 * Only one preview can play at a time; navigating away stops it.
 */

export function previewUrl(beatmapsetId: number): string {
  return `https://b.ppy.sh/preview/${beatmapsetId}.mp3`
}

export interface PreviewTrack {
  beatmapsetId: number
  title: string
  artist: string
  /** Cover art URL (the row's cover) when the caller has one. */
  cover?: string
}

type Listener = () => void

/** Minimal audio-element surface the player drives (injectable in tests). */
export interface PreviewAudioFactory {
  (): Pick<
    HTMLAudioElement,
    'play' | 'pause' | 'addEventListener' | 'removeAttribute' | 'currentTime' | 'duration' | 'paused' | 'src'
  >
}

class PreviewPlayer {
  private audio: ReturnType<PreviewAudioFactory> | null = null
  private listeners = new Set<Listener>()
  private intentionalPause = false
  private audioFactory: PreviewAudioFactory
  playingId: number | null = null
  paused = false
  track: PreviewTrack | null = null
  currentTime = 0
  duration = 0

  constructor(audioFactory: PreviewAudioFactory = () => new Audio()) {
    this.audioFactory = audioFactory
  }

  private ensureAudio(): ReturnType<PreviewAudioFactory> | null {
    if (!this.audio) {
      try {
        this.audio = this.audioFactory()
      } catch {
        return null
      }
      this.audio.addEventListener('ended', () => {
        this.playingId = null
        this.paused = false
        this.track = null
        this.currentTime = 0
        this.emit()
      })
      this.audio.addEventListener('pause', () => {
        if (!this.audio) return
        // Stale-event guard (batch 6, part 6): a `pause` event
        // queued before a rapid close/replay belongs to the
        // previous track — the element is playing again, so this
        // event must not touch the new track. Without this, the
        // queued event cleared the fresh track while its audio
        // kept playing: orphaned audio with no visible player.
        if (!this.audio.paused) return
        // Only an intentional pause updates state, and the flag is
        // consumed HERE, not reset synchronously in pause():
        // real browsers fire `pause` asynchronously, and the old
        // synchronous reset made this handler read a stale false
        // and drop the track on every pause. An unexpected pause
        // leaves the track loaded (resumable) — clearing here is
        // what raced queued events; `ended`, play failure, and
        // stop() are the paths that clear the track.
        if (this.intentionalPause) {
          this.paused = true
          this.intentionalPause = false
          this.emit()
        }
      })
      this.audio.addEventListener('timeupdate', () => {
        if (!this.audio) return
        this.currentTime = this.audio.currentTime
        this.emit()
      })
      this.audio.addEventListener('loadedmetadata', () => {
        if (!this.audio) return
        this.duration = Number.isFinite(this.audio.duration) ? this.audio.duration : 0
        this.emit()
      })
    }
    return this.audio
  }

  private emit() {
    for (const fn of this.listeners) fn()
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  toggle(beatmapsetId: number, meta?: Omit<PreviewTrack, 'beatmapsetId'>): void {
    const audio = this.ensureAudio()
    if (!audio) return
    if (this.playingId === beatmapsetId) {
      if (this.paused) this.resume()
      else this.pause()
      return
    }
    this.intentionalPause = false
    audio.src = previewUrl(beatmapsetId)
    this.playingId = beatmapsetId
    this.paused = false
    this.track = { beatmapsetId, title: meta?.title ?? '', artist: meta?.artist ?? '', cover: meta?.cover }
    this.currentTime = 0
    this.duration = 0
    this.emit()
    void audio.play().catch(() => {
      this.playingId = null
      this.paused = false
      this.track = null
      this.emit()
    })
  }

  pause(): void {
    if (!this.audio || this.playingId === null) return
    this.intentionalPause = true
    this.audio.pause()
    this.paused = true
    this.emit()
    // NOTE: intentionalPause is consumed by the `pause` event
    // handler, NOT reset here — real browsers fire `pause`
    // asynchronously, and resetting here made the handler read a
    // stale false and drop the track (part 6).
  }

  resume(): void {
    const audio = this.ensureAudio()
    if (!audio || this.playingId === null) return
    this.intentionalPause = false
    this.paused = false
    this.emit()
    void audio.play().catch(() => {
      this.playingId = null
      this.paused = false
      this.track = null
      this.emit()
    })
  }

  seekTo(seconds: number): void {
    if (!this.audio || this.playingId === null) return
    const clamped = Math.max(0, Math.min(seconds, this.duration || seconds))
    this.audio.currentTime = clamped
    this.currentTime = clamped
    this.emit()
  }

  stop(): void {
    // Stop is terminal for the current track: it pauses the
    // element, unloads the source, and clears the track, so the
    // player dismisses and no audio can outlive it (part 6). A
    // `pause` event queued before this call must not resurrect
    // paused state on the cleared track, so the intent flag goes
    // too.
    this.intentionalPause = false
    if (this.audio) {
      this.audio.pause()
      this.audio.removeAttribute('src')
    }
    if (this.playingId !== null || this.track !== null) {
      this.playingId = null
      this.paused = false
      this.track = null
      this.currentTime = 0
      this.duration = 0
      this.emit()
    }
  }

  isPlaying(beatmapsetId: number): boolean {
    return this.playingId === beatmapsetId && !this.paused
  }
}

export const previewPlayer = new PreviewPlayer()

/** Test-only: build a player around a fake audio element. */
export function createPreviewPlayerForTest(factory: PreviewAudioFactory): PreviewPlayer {
  return new PreviewPlayer(factory)
}

export function stopPreview(): void {
  previewPlayer.stop()
}

/** React binding: re-renders when the playing preview changes. */
export function usePreviewPlayer(): {
  playingId: number | null
  paused: boolean
  track: PreviewTrack | null
  currentTime: number
  duration: number
  toggle: (beatmapsetId: number, meta?: Omit<PreviewTrack, 'beatmapsetId'>) => void
  pause: () => void
  resume: () => void
  seekTo: (seconds: number) => void
  stop: () => void
  isPlaying: (beatmapsetId: number) => boolean
} {
  const [, force] = useState(0)
  useEffect(() => previewPlayer.subscribe(() => force((n) => n + 1)), [])
  return {
    playingId: previewPlayer.playingId,
    paused: previewPlayer.paused,
    track: previewPlayer.track,
    currentTime: previewPlayer.currentTime,
    duration: previewPlayer.duration,
    toggle: (id, meta) => previewPlayer.toggle(id, meta),
    pause: () => previewPlayer.pause(),
    resume: () => previewPlayer.resume(),
    seekTo: (s) => previewPlayer.seekTo(s),
    stop: () => previewPlayer.stop(),
    isPlaying: (id) => previewPlayer.isPlaying(id),
  }
}

/** Render inside the router: stops any preview on route change. */
export function PreviewRouteStop() {
  const location = useLocation()
  useEffect(() => {
    previewPlayer.stop()
  }, [location.pathname])
  return null
}
