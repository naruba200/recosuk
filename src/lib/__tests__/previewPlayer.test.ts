import { describe, expect, it, vi } from 'vitest'
import { createPreviewPlayerForTest, type PreviewAudioFactory } from '../previewPlayer'

/** Fake audio element: records calls, lets tests fire events. */
function fakeAudio() {
  const listeners = new Map<string, (() => void)[]>()
  const audio = {
    src: '',
    currentTime: 0,
    duration: 30,
    paused: true,
    play: vi.fn(async () => {
      audio.paused = false
    }),
    pause: vi.fn(() => {
      audio.paused = true
      audio.fire('pause')
    }),
    removeAttribute: vi.fn((name: string) => {
      if (name === 'src') audio.src = ''
    }),
    addEventListener: vi.fn((event: string, fn: () => void) => {
      const list = listeners.get(event) ?? []
      list.push(fn)
      listeners.set(event, list)
    }),
    fire: (event: string) => {
      for (const fn of listeners.get(event) ?? []) fn()
    },
    setDuration: (d: number) => {
      audio.duration = d
      audio.fire('loadedmetadata')
    },
  }
  return audio
}

function makePlayer() {
  const audio = fakeAudio()
  const factory = (() => audio) as unknown as PreviewAudioFactory
  const player = createPreviewPlayerForTest(factory)
  return { audio, player }
}

describe('preview player (batch 4, item C)', () => {
  it('plays a track with metadata and reports it as playing', () => {
    const { audio, player } = makePlayer()
    player.toggle(42, { title: 'Exit This Earth', artist: 'Camellia', cover: 'cover.jpg' })
    expect(audio.src).toBe('https://b.ppy.sh/preview/42.mp3')
    expect(player.playingId).toBe(42)
    expect(player.track).toEqual({
      beatmapsetId: 42,
      title: 'Exit This Earth',
      artist: 'Camellia',
      cover: 'cover.jpg',
    })
    expect(player.isPlaying(42)).toBe(true)
    expect(audio.play).toHaveBeenCalledTimes(1)
  })

  it('toggling the same track pauses, and toggling again resumes', () => {
    const { audio, player } = makePlayer()
    player.toggle(42, { title: 'T', artist: 'A' })
    player.toggle(42, { title: 'T', artist: 'A' })
    expect(player.paused).toBe(true)
    expect(player.isPlaying(42)).toBe(false)
    expect(player.track?.beatmapsetId).toBe(42)

    player.toggle(42, { title: 'T', artist: 'A' })
    expect(player.paused).toBe(false)
    expect(player.isPlaying(42)).toBe(true)
    expect(audio.play).toHaveBeenCalledTimes(2)
  })

  it('switching tracks stops the old one and plays the new one', () => {
    const { audio, player } = makePlayer()
    player.toggle(1, { title: 'One', artist: 'A' })
    player.toggle(2, { title: 'Two', artist: 'B' })
    expect(audio.src).toBe('https://b.ppy.sh/preview/2.mp3')
    expect(player.track?.title).toBe('Two')
    expect(player.isPlaying(2)).toBe(true)
  })

  it('seek clamps to the duration and updates currentTime', () => {
    const { audio, player } = makePlayer()
    player.toggle(42, { title: 'T', artist: 'A' })
    audio.setDuration(30)
    expect(player.duration).toBe(30)
    player.seekTo(12.5)
    expect(audio.currentTime).toBe(12.5)
    expect(player.currentTime).toBe(12.5)
    player.seekTo(999)
    expect(audio.currentTime).toBe(30)
  })

  it('tracks timeupdate events', () => {
    const { audio, player } = makePlayer()
    player.toggle(42, { title: 'T', artist: 'A' })
    audio.currentTime = 7
    audio.fire('timeupdate')
    expect(player.currentTime).toBe(7)
  })

  it('ended clears the track; stop clears everything', () => {
    const { audio, player } = makePlayer()
    player.toggle(42, { title: 'T', artist: 'A' })
    audio.fire('ended')
    expect(player.playingId).toBeNull()
    expect(player.track).toBeNull()

    player.toggle(42, { title: 'T', artist: 'A' })
    player.stop()
    expect(player.playingId).toBeNull()
    expect(player.track).toBeNull()
    expect(player.paused).toBe(false)
    expect(audio.src).toBe('')
  })

  it('a failed play clears the track instead of claiming playback', async () => {
    const { audio, player } = makePlayer()
    audio.play.mockRejectedValueOnce(new Error('nope'))
    player.toggle(42, { title: 'T', artist: 'A' })
    await new Promise((r) => setTimeout(r, 0))
    expect(player.playingId).toBeNull()
    expect(player.track).toBeNull()
  })
})

describe('preview player stop/close lifecycle (batch 6, part 6)', () => {
  it('pause keeps the track when the pause event arrives asynchronously (real browsers)', () => {
    const { audio, player } = makePlayer()
    player.toggle(42, { title: 'T', artist: 'A' })
    // Real browsers fire `pause` asynchronously, after pause()
    // returns — simulate that by deferring the event. The intent
    // flag must survive until the event, or the handler drops
    // the track (the bug the synchronous reset caused).
    audio.pause = vi.fn(() => {
      audio.paused = true
    })
    player.pause()
    expect(player.paused).toBe(true)
    expect(player.track?.beatmapsetId).toBe(42)
    audio.fire('pause')
    expect(player.paused).toBe(true)
    expect(player.track?.beatmapsetId).toBe(42)
    expect(player.isPlaying(42)).toBe(false)
  })

  it('a stale pause event arriving after a replay does not clear the new track (no orphaned audio)', () => {
    const { audio, player } = makePlayer()
    player.toggle(1, { title: 'One', artist: 'A' })
    player.stop()
    player.toggle(2, { title: 'Two', artist: 'B' })
    // The pause event queued by stop()'s audio.pause() arrives
    // late, while the new track is playing: it belongs to the
    // previous track and must be ignored.
    expect(audio.paused).toBe(false)
    audio.fire('pause')
    expect(player.track?.beatmapsetId).toBe(2)
    expect(player.isPlaying(2)).toBe(true)
    expect(audio.src).toBe('https://b.ppy.sh/preview/2.mp3')
  })

  it('stop pauses the element, unloads the source, and clears the track (close dismisses + silences)', () => {
    const { audio, player } = makePlayer()
    player.toggle(42, { title: 'T', artist: 'A' })
    player.stop()
    expect(audio.pause).toHaveBeenCalled()
    expect(audio.src).toBe('')
    expect(player.playingId).toBeNull()
    expect(player.track).toBeNull()
    expect(player.paused).toBe(false)
    // No late event can resurrect state: the queued pause event
    // arrives after the clear and must stay a no-op.
    audio.fire('pause')
    expect(player.track).toBeNull()
    expect(player.paused).toBe(false)
  })
})
