import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  attemptSongsCopy,
  copySetToSongsFolder,
  resetSongsCopySessionFlags,
  songsFolderFilename,
} from '../songCopy'
import { useDownloadSettings } from '../downloadSettings'

/** Mocked directory/file handles: records what was written, and where. */
function mockHandle() {
  const written: unknown[] = []
  const writable = {
    write: vi.fn(async (data: unknown) => {
      written.push(data)
    }),
    close: vi.fn(async () => {}),
    abort: vi.fn(async () => {}),
  }
  const fileHandle = { createWritable: vi.fn(async () => writable) }
  const handle = {
    name: 'Songs',
    getFileHandle: vi.fn(async () => fileHandle),
    queryPermission: vi.fn(async () => 'granted'),
    requestPermission: vi.fn(async () => 'granted'),
  } as unknown as FileSystemDirectoryHandle
  return { handle, written, writable, fileHandle }
}

function okResponse(bytes: ArrayBuffer): Response {
  return {
    ok: true,
    status: 200,
    body: null,
    arrayBuffer: async () => bytes,
  } as unknown as Response
}

const BYTES = new Uint8Array([1, 2, 3]).buffer

describe('songsFolderFilename', () => {
  it('builds an osu!-style name and strips path-unsafe characters', () => {
    expect(
      songsFolderFilename({ beatmapsetId: 42, artist: 'A/B:C', title: 'X*Y?Z' }),
    ).toBe('42 ABC - XYZ.osz')
    expect(
      songsFolderFilename({ beatmapsetId: 7, artist: '  spaced   artist ', title: '' }),
    ).toBe('7 spaced artist - Unknown Title.osz')
  })
})

describe('copySetToSongsFolder (mocked fetch + handle)', () => {
  it('fetches from the first mirror and writes the bytes with the right filename', async () => {
    const { handle, written, writable } = mockHandle()
    const fetchFn = vi.fn(async () => okResponse(BYTES))

    const outcome = await copySetToSongsFolder(
      { beatmapsetId: 42, artist: 'Camellia', title: 'Exit This Earth' },
      handle,
      { fetchFn: fetchFn as unknown as typeof fetch },
    )

    expect(outcome).toEqual({
      status: 'copied',
      mirrorId: 'beatconnect',
      filename: '42 Camellia - Exit This Earth.osz',
    })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn).toHaveBeenCalledWith('https://beatconnect.io/b/42')
    expect(handle.getFileHandle).toHaveBeenCalledWith(
      '42 Camellia - Exit This Earth.osz',
      { create: true },
    )
    expect(written).toEqual([BYTES])
    expect(writable.close).toHaveBeenCalledTimes(1)
  })

  it('with noVideo, tries catboy first with the no-video suffix', async () => {
    const { handle } = mockHandle()
    const fetchFn = vi.fn(async () => okResponse(BYTES))
    const outcome = await copySetToSongsFolder(
      { beatmapsetId: 42, artist: 'A', title: 'T', noVideo: true },
      handle,
      { fetchFn: fetchFn as unknown as typeof fetch },
    )
    expect(outcome.status).toBe('copied')
    expect(fetchFn).toHaveBeenCalledWith('https://catboy.best/d/42n')
  })

  it('falls through mirrors on HTTP errors and CORS-style throws, then reports failure honestly', async () => {
    const { handle, writable } = mockHandle()
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes('beatconnect')) return { ok: false, status: 429 } as Response
      if (url.includes('catboy')) throw new TypeError('Failed to fetch')
      if (url.includes('nerinyan')) return { ok: false, status: 404 } as Response
      return { ok: false, status: 500 } as Response
    })
    const outcome = await copySetToSongsFolder(
      { beatmapsetId: 42, artist: 'A', title: 'T' },
      handle,
      { fetchFn: fetchFn as unknown as typeof fetch },
    )
    expect(outcome.status).toBe('failed')
    expect(fetchFn).toHaveBeenCalledTimes(4)
    expect(writable.write).not.toHaveBeenCalled()
  })

  it('streams the response body when one is present', async () => {
    const { handle, writable } = mockHandle()
    const pipeTo = vi.fn(async () => {})
    const stream = { pipeTo } as unknown as ReadableStream
    const fetchFn = vi.fn(async () =>
      ({ ok: true, status: 200, body: stream }) as unknown as Response,
    )
    const outcome = await copySetToSongsFolder(
      { beatmapsetId: 1, artist: 'A', title: 'T' },
      handle,
      { fetchFn: fetchFn as unknown as typeof fetch },
    )
    expect(outcome.status).toBe('copied')
    expect(pipeTo).toHaveBeenCalledWith(writable)
    expect(writable.write).not.toHaveBeenCalled()
  })
})

describe('attemptSongsCopy orchestration', () => {
  beforeEach(() => {
    resetSongsCopySessionFlags()
    useDownloadSettings.getState().setAutoCopy(false)
  })

  afterEach(() => {
    useDownloadSettings.getState().setAutoCopy(false)
    const w = globalThis as { window?: unknown }
    delete w.window
  })

  it('skips entirely when auto-copy is off, without touching fetch or the picker', async () => {
    const fetchFn = vi.fn()
    const outcome = await attemptSongsCopy(
      { beatmapsetId: 1, artist: 'A', title: 'T' },
      { fetchFn: fetchFn as unknown as typeof fetch, loadHandle: vi.fn() },
    )
    expect(outcome).toEqual({ status: 'skipped', reason: 'auto-copy is off' })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('skips when the browser has no folder picker (Firefox/Safari/mobile)', async () => {
    useDownloadSettings.getState().setAutoCopy(true)
    const outcome = await attemptSongsCopy(
      { beatmapsetId: 1, artist: 'A', title: 'T' },
      { loadHandle: vi.fn(async () => null) },
    )
    expect(outcome).toEqual({ status: 'skipped', reason: 'this browser cannot pick folders' })
  })

  it('copies through a stored handle without prompting', async () => {
    useDownloadSettings.getState().setAutoCopy(true)
    const { handle } = mockHandle()
    // Pretend the picker API exists so the flow reaches the handle.
    ;(globalThis as { window?: unknown }).window = { showDirectoryPicker: vi.fn() }
    const pickFolder = vi.fn()
    const fetchFn = vi.fn(async () => okResponse(BYTES))
    const outcome = await attemptSongsCopy(
      { beatmapsetId: 1, artist: 'A', title: 'T' },
      {
        fetchFn: fetchFn as unknown as typeof fetch,
        loadHandle: async () => handle,
        pickFolder,
      },
    )
    expect(outcome.status).toBe('copied')
    expect(pickFolder).not.toHaveBeenCalled()
  })

  it('prompts once when no folder is set, then never nags again in the session', async () => {
    useDownloadSettings.getState().setAutoCopy(true)
    ;(globalThis as { window?: unknown }).window = { showDirectoryPicker: vi.fn() }
    const pickFolder = vi.fn(async () => null)
    const first = await attemptSongsCopy(
      { beatmapsetId: 1, artist: 'A', title: 'T' },
      { loadHandle: async () => null, pickFolder },
    )
    expect(first).toEqual({ status: 'skipped', reason: 'no Songs folder chosen' })
    expect(pickFolder).toHaveBeenCalledTimes(1)
    const second = await attemptSongsCopy(
      { beatmapsetId: 2, artist: 'A', title: 'T' },
      { loadHandle: async () => null, pickFolder },
    )
    expect(second.status).toBe('skipped')
    expect(pickFolder).toHaveBeenCalledTimes(1)
  })

  it('reports permission denial as failure without fetching', async () => {
    useDownloadSettings.getState().setAutoCopy(true)
    ;(globalThis as { window?: unknown }).window = { showDirectoryPicker: vi.fn() }
    const { handle } = mockHandle()
    const fetchFn = vi.fn()
    const outcome = await attemptSongsCopy(
      { beatmapsetId: 1, artist: 'A', title: 'T' },
      {
        fetchFn: fetchFn as unknown as typeof fetch,
        loadHandle: async () => handle,
        ensurePermission: async () => false,
      },
    )
    expect(outcome).toEqual({
      status: 'failed',
      reason: 'Songs folder permission was not granted',
    })
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
