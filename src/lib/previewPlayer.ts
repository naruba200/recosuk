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

type Listener = () => void

class PreviewPlayer {
  private audio: HTMLAudioElement | null = null
  private listeners = new Set<Listener>()
  playingId: number | null = null

  private ensureAudio(): HTMLAudioElement | null {
    if (typeof Audio === 'undefined') return null
    if (!this.audio) {
      this.audio = new Audio()
      this.audio.addEventListener('ended', () => {
        this.playingId = null
        this.emit()
      })
      this.audio.addEventListener('pause', () => {
        // Keep state in sync when the element is paused externally.
        if (this.audio && this.audio.paused && this.playingId !== null) {
          this.playingId = null
          this.emit()
        }
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

  toggle(beatmapsetId: number): void {
    const audio = this.ensureAudio()
    if (!audio) return
    if (this.playingId === beatmapsetId) {
      this.stop()
      return
    }
    audio.src = previewUrl(beatmapsetId)
    this.playingId = beatmapsetId
    this.emit()
    void audio.play().catch(() => {
      this.playingId = null
      this.emit()
    })
  }

  stop(): void {
    if (this.audio) {
      this.audio.pause()
      this.audio.removeAttribute('src')
    }
    if (this.playingId !== null) {
      this.playingId = null
      this.emit()
    }
  }

  isPlaying(beatmapsetId: number): boolean {
    return this.playingId === beatmapsetId
  }
}

export const previewPlayer = new PreviewPlayer()

export function stopPreview(): void {
  previewPlayer.stop()
}

/** React binding: re-renders when the playing preview changes. */
export function usePreviewPlayer(): {
  playingId: number | null
  toggle: (beatmapsetId: number) => void
  stop: () => void
  isPlaying: (beatmapsetId: number) => boolean
} {
  const [, force] = useState(0)
  useEffect(() => previewPlayer.subscribe(() => force((n) => n + 1)), [])
  return {
    playingId: previewPlayer.playingId,
    toggle: (id) => previewPlayer.toggle(id),
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
