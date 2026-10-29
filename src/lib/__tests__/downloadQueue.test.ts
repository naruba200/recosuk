import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  configureDownloadQueue,
  resetDownloadQueue,
  useDownloadQueue,
} from '../downloadQueue'
import { useDownloadSettings } from '../downloadSettings'

function chunkResponse(chunks: Uint8Array[], total?: number): Response {
  const headers = {
    get: (name: string) =>
      name.toLowerCase() === 'content-length' && total !== undefined ? String(total) : null,
  }
  const concatBuffer = () => {
    const all = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0))
    let off = 0
    for (const c of chunks) {
      all.set(c, off)
      off += c.byteLength
    }
    return all.buffer
  }
  const makeStream = () =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(c)
        controller.close()
      },
    })
  const response = {
    ok: true,
    status: 200,
    headers,
    body: makeStream(),
    // The clone feeds the Songs-folder write, whose writer pipes the
    // body into a FileSystemWritableFileStream. A real ReadableStream
    // rejects a plain-object destination in pipeTo, so the clone
    // carries a pipeTo-shaped body (the songCopy tests do the same).
    clone: () =>
      ({
        ok: true,
        status: 200,
        headers,
        body: {
          pipeTo: async (writable: { write: (c: unknown) => Promise<void>; close: () => Promise<void> }) => {
            for (const c of chunks) await writable.write(c)
            await writable.close()
          },
        },
        arrayBuffer: async () => concatBuffer(),
      }) as unknown as Response,
    arrayBuffer: async () => concatBuffer(),
  } as unknown as Response
  return response
}

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
  return { handle, written, writable }
}

async function waitForIdle(timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  for (;;) {
    const items = useDownloadQueue.getState().items
    if (!items.some((i) => i.status === 'queued' || i.status === 'downloading')) return
    if (Date.now() - start > timeoutMs) throw new Error('queue did not go idle')
    await new Promise((r) => setTimeout(r, 10))
  }
}

const REQ = { beatmapsetId: 42, artist: 'Camellia', title: 'Exit This Earth', seenKeyValue: 'test' }

beforeEach(() => {
  resetDownloadQueue()
  useDownloadSettings.setState({ autoCopy: false, noVideo: false })
  vi.stubGlobal('Blob', Blob)
})

afterEach(() => {
  resetDownloadQueue()
  useDownloadSettings.setState({ autoCopy: false, noVideo: false })
  vi.unstubAllGlobals()
})

describe('download queue (batch 4, item C)', () => {
  it('fetches in mirror order, reports progress + rate, and saves the blob on completion', async () => {
    const fetchFn = vi.fn(async (_url: string) => chunkResponse([new Uint8Array([1, 2]), new Uint8Array([3])], 3))
    const saveFile = vi.fn()
    configureDownloadQueue({
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile,
      record: () => {},
    })

    useDownloadQueue.getState().enqueue(REQ)
    await waitForIdle()

    const [item] = useDownloadQueue.getState().items
    expect(item.status).toBe('done')
    expect(item.downloadedBytes).toBe(3)
    expect(item.totalBytes).toBe(3)
    expect(item.mirrorIdUsed).toBe('beatconnect')
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn.mock.calls[0][0]).toBe('https://beatconnect.io/b/42')
    expect(saveFile).toHaveBeenCalledTimes(1)
    expect((saveFile.mock.calls[0][0] as Blob).size).toBe(3)
    expect(saveFile.mock.calls[0][1]).toBe('42 Camellia - Exit This Earth.osz')
  })

  it('processes items sequentially, in enqueue order', async () => {
    const order: number[] = []
    const fetchFn = vi.fn(async (url: string) => {
      const id = Number(/\/b\/(\d+)/.exec(url)?.[1] ?? /\/d\/(\d+)/.exec(url)?.[1])
      order.push(id)
      return chunkResponse([new Uint8Array([1])], 1)
    })
    configureDownloadQueue({
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile: () => {},
      record: () => {},
    })

    useDownloadQueue.getState().enqueue({ ...REQ, beatmapsetId: 1 })
    useDownloadQueue.getState().enqueue({ ...REQ, beatmapsetId: 2 })
    useDownloadQueue.getState().enqueue({ ...REQ, beatmapsetId: 3 })
    await waitForIdle()

    expect(order).toEqual([1, 2, 3])
    expect(useDownloadQueue.getState().items.map((i) => i.status)).toEqual(['done', 'done', 'done'])
  })

  it('falls through no-video → full file → next mirror on 425/throws, in the shared order', async () => {
    const seen: string[] = []
    const fetchFn = vi.fn(async (url: string) => {
      seen.push(url)
      if (url.endsWith('/d/42n')) return { ok: false, status: 425 } as unknown as Response
      if (url.includes('sayobot')) return chunkResponse([new Uint8Array([7])], 1)
      throw new Error('CORS blocked')
    })
    configureDownloadQueue({
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile: () => {},
      record: () => {},
    })

    useDownloadQueue.getState().enqueue({ ...REQ, noVideo: true })
    await waitForIdle()

    // catboy no-video, catboy full, then beatconnect/nerinyan/sayobot full files.
    expect(seen).toEqual([
      'https://catboy.best/d/42n',
      'https://catboy.best/d/42',
      'https://beatconnect.io/b/42',
      'https://api.nerinyan.moe/d/42',
      'https://txy1.sayobot.cn/beatmaps/download/full/42',
    ])
    expect(useDownloadQueue.getState().items[0].status).toBe('done')
  })

  it('hands off to the native browser download (and says so) when every fetch fails', async () => {
    const handOff = vi.fn()
    configureDownloadQueue({
      fetchFn: (async () => {
        throw new Error('CORS blocked')
      }) as unknown as typeof fetch,
      startBrowserDownload: handOff,
      saveFile: vi.fn(),
      record: () => {},
    })

    useDownloadQueue.getState().enqueue(REQ)
    await waitForIdle()

    const [item] = useDownloadQueue.getState().items
    expect(item.status).toBe('browser')
    expect(handOff).toHaveBeenCalledTimes(1)
    expect(handOff.mock.calls[0][0]).toBe('https://beatconnect.io/b/42')
  })

  it('cancelling a queued item skips it without fetching', async () => {
    const fetchFn = vi.fn(async (_url: string) => chunkResponse([new Uint8Array([1])], 1))
    configureDownloadQueue({
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile: () => {},
      record: () => {},
    })
    const first = useDownloadQueue.getState().enqueue({ ...REQ, beatmapsetId: 1 })
    const second = useDownloadQueue.getState().enqueue({ ...REQ, beatmapsetId: 2 })
    useDownloadQueue.getState().cancel(second)
    await waitForIdle()

    expect(useDownloadQueue.getState().items.find((i) => i.id === second)?.status).toBe('cancelled')
    expect(useDownloadQueue.getState().items.find((i) => i.id === first)?.status).toBe('done')
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual(['https://beatconnect.io/b/1'])
  })

  it('writes the Songs-folder copy from the SAME fetched bytes (one fetch) when auto-copy is on', async () => {
    const { handle, written } = mockHandle()
    const fetchFn = vi.fn(async () => chunkResponse([new Uint8Array([9, 9])], 2))
    const g = globalThis as unknown as Record<string, unknown>
    g.showDirectoryPicker = () => {}
    useDownloadSettings.setState({ autoCopy: true })
    configureDownloadQueue({
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile: () => {},
      record: () => {},
      folderDeps: {
        loadHandle: async () => handle,
        ensurePermission: async () => true,
      },
    })

    useDownloadQueue.getState().enqueue(REQ)
    await waitForIdle()

    const [item] = useDownloadQueue.getState().items
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(item.status).toBe('done')
    expect(item.copied).toBe('copied')
    expect(written.length).toBeGreaterThan(0)
    delete g.showDirectoryPicker
  })

  it('retry requeues a handed-off item', async () => {
    let attempts = 0
    const fetchFn = vi.fn(async () => {
      attempts += 1
      // The first item tries every mirror (5 attempts) and fails;
      // the retried item succeeds on the first mirror.
      if (attempts <= 5) throw new Error('CORS blocked')
      return chunkResponse([new Uint8Array([1])], 1)
    })
    configureDownloadQueue({
      fetchFn: fetchFn as unknown as typeof fetch,
      startBrowserDownload: () => {},
      saveFile: () => {},
      record: () => {},
    })

    const id = useDownloadQueue.getState().enqueue(REQ)
    await waitForIdle()
    expect(useDownloadQueue.getState().items[0].status).toBe('browser')

    useDownloadQueue.getState().retry(id)
    await waitForIdle()
    expect(useDownloadQueue.getState().items[0].status).toBe('done')
  })
})
