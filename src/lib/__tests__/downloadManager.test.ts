import { describe, expect, it, vi } from 'vitest'
import {
  createDownloadManager,
  oszFilename,
  type DownloadProgress,
  type FetchFn,
} from '../downloadManager'

function streamingResponse(chunks: string[], total: number | null) {
  const buffers = chunks.map((c) => new TextEncoder().encode(c))
  let i = 0
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-length' && total !== null ? String(total) : null,
    },
    body: {
      getReader: () => ({
        read: async () => {
          if (i >= buffers.length) return { done: true as const, value: undefined }
          return { done: false as const, value: buffers[i++] }
        },
      }),
    },
  }
}

function failingResponse(status = 500) {
  return { ok: false, status, headers: { get: () => null } }
}

const REQ = {
  beatmapsetId: 42,
  artist: 'Camellia',
  title: 'Exit This Earth',
  seenKeyValue: 'recosuk-seen:guest:tester',
}

describe('downloadManager', () => {
  it('streams progress and triggers an anchor save with an .osz filename', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => streamingResponse(['ab', 'cde'], 5))
    const triggerSave = vi.fn()
    const record = vi.fn()
    const progress: DownloadProgress[] = []
    const manager = createDownloadManager({
      fetchFn,
      triggerSave,
      record,
      createObjectUrl: () => 'blob:fake',
      revokeObjectUrl: () => {},
    })

    const result = await manager
      .download({ ...REQ, onProgress: (p) => progress.push(p) })
      .promise

    expect(result).toEqual({ status: 'downloaded', mirrorId: 'beatconnect' })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn.mock.calls[0][0]).toBe('https://beatconnect.io/b/42')
    expect(progress).toEqual([
      { received: 2, total: 5, mirrorId: 'beatconnect' },
      { received: 5, total: 5, mirrorId: 'beatconnect' },
    ])
    expect(triggerSave).toHaveBeenCalledWith('blob:fake', 'Camellia - Exit This Earth.osz')
    expect(record).toHaveBeenCalledWith(REQ.seenKeyValue, 42, 'beatconnect')
  })

  it('falls through to the second mirror when the first fails', async () => {
    const fetchFn = vi.fn<FetchFn>(async (url) =>
      url.includes('beatconnect.io')
        ? failingResponse(500)
        : streamingResponse(['xyz'], 3),
    )
    const manager = createDownloadManager({
      fetchFn,
      triggerSave: vi.fn(),
      record: vi.fn(),
      createObjectUrl: () => 'blob:fake',
      revokeObjectUrl: () => {},
    })

    const result = await manager.download(REQ).promise

    expect(result).toEqual({ status: 'downloaded', mirrorId: 'catboy' })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('opens the first mirror externally when every mirror fails', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => {
      throw new TypeError('Failed to fetch')
    })
    const openExternal = vi.fn()
    const record = vi.fn()
    const manager = createDownloadManager({
      fetchFn,
      openExternal,
      triggerSave: vi.fn(),
      record,
      createObjectUrl: () => 'blob:fake',
      revokeObjectUrl: () => {},
    })

    const result = await manager.download(REQ).promise

    expect(result).toEqual({ status: 'opened-externally', mirrorId: 'beatconnect' })
    expect(fetchFn).toHaveBeenCalledTimes(4)
    expect(openExternal).toHaveBeenCalledWith('https://beatconnect.io/b/42')
    expect(record).toHaveBeenCalledWith(REQ.seenKeyValue, 42, 'beatconnect')
  })

  it('cancel aborts the fetch and reports cancelled without recording', async () => {
    const fetchFn = vi.fn<FetchFn>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          )
        }),
    )
    const record = vi.fn()
    const openExternal = vi.fn()
    const manager = createDownloadManager({ fetchFn, record, openExternal })

    const handle = manager.download(REQ)
    handle.cancel()
    const result = await handle.promise

    expect(result.status).toBe('cancelled')
    expect(record).not.toHaveBeenCalled()
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('duplicate calls for the same set share one fetch', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => streamingResponse(['ok'], 2))
    const manager = createDownloadManager({
      fetchFn,
      triggerSave: vi.fn(),
      record: vi.fn(),
      createObjectUrl: () => 'blob:fake',
      revokeObjectUrl: () => {},
    })

    const first = manager.download(REQ)
    const second = manager.download(REQ)
    expect(second).toBe(first)
    const [a, b] = await Promise.all([first.promise, second.promise])
    expect(a).toEqual(b)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('sanitizes filenames', () => {
    expect(oszFilename('A/B', 'T: "X"')).toBe('AB - T X.osz')
    expect(oszFilename('', '')).toBe('beatmap.osz')
  })
})
