import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  configureDownloadQueue,
  resetDownloadQueue,
  useDownloadQueue,
} from '../downloadQueue'
import { useDownloadSettings } from '../downloadSettings'

/**
 * Regression tests for batch 6, part 1: downloads are native
 * browser downloads again — the register hands the URL to the
 * browser (hidden iframe) and records the click, with NO in-app
 * fetch, NO chunked fetch, and NO Blob save for the download
 * itself. The dock row is status text only. The opt-in Songs-folder
 * copy still fetches (plain single-stream) because that fetch IS
 * the copy, and its outcome lands on the row.
 */

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

/** A 200 response whose body pipes one chunk into the writer. */
function fakeSetResponse(bytes: Uint8Array): Response {
  return {
    ok: true,
    status: 200,
    body: {
      pipeTo: async (writable: { write: (c: unknown) => Promise<void>; close: () => Promise<void> }) => {
        await writable.write(bytes)
        await writable.close()
      },
    },
  } as unknown as Response
}

async function waitForCopy(id: string, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  for (;;) {
    const item = useDownloadQueue.getState().items.find((i) => i.id === id)
    if (item && item.copied !== null) return
    if (Date.now() - start > timeoutMs) throw new Error('copy outcome never landed on the row')
    await new Promise((r) => setTimeout(r, 10))
  }
}

const REQ = { beatmapsetId: 42, artist: 'Camellia', title: 'Exit This Earth', seenKeyValue: 'test' }

beforeEach(() => {
  resetDownloadQueue()
  useDownloadSettings.setState({ autoCopy: false, noVideo: false })
})

afterEach(() => {
  resetDownloadQueue()
  useDownloadSettings.setState({ autoCopy: false, noVideo: false })
  vi.unstubAllGlobals()
})

describe('download register (batch 6, part 1)', () => {
  it('hands the first mirror URL to the browser and records the download, with no fetch at all', async () => {
    const handOff = vi.fn()
    const record = vi.fn()
    const fetchFn = vi.fn(async () => {
      throw new Error('the download itself must never fetch')
    })
    configureDownloadQueue({ startBrowserDownload: handOff, record, folderDeps: { fetchFn } })

    const id = useDownloadQueue.getState().register(REQ)
    await waitForCopy(id)

    expect(handOff).toHaveBeenCalledTimes(1)
    expect(handOff).toHaveBeenCalledWith(expect.stringContaining('beatconnect.io/b/42'))
    expect(record).toHaveBeenCalledWith('test', 42, 'beatconnect')
    expect(fetchFn).not.toHaveBeenCalled()
    const item = useDownloadQueue.getState().items[0]
    expect(item.status).toBe('browser')
    expect(item.mirrorIdUsed).toBe('beatconnect')
    expect(item.noVideo).toBe(false)
    expect(item.copied).toBe('skipped')
    expect(useDownloadQueue.getState().dockOpen).toBe(true)
  })

  it('no-video register hands off catboy first, with the verified {id}n URL', () => {
    const handOff = vi.fn()
    configureDownloadQueue({ startBrowserDownload: handOff, record: vi.fn() })

    useDownloadQueue.getState().register({ ...REQ, noVideo: true })

    expect(handOff).toHaveBeenCalledTimes(1)
    expect(handOff).toHaveBeenCalledWith('https://catboy.best/d/42n')
    expect(useDownloadQueue.getState().items[0].mirrorIdUsed).toBe('catboy')
    expect(useDownloadQueue.getState().items[0].noVideo).toBe(true)
  })

  it('an explicit mirror pick hands off that mirror only', () => {
    const handOff = vi.fn()
    configureDownloadQueue({ startBrowserDownload: handOff, record: vi.fn() })

    useDownloadQueue.getState().register({ ...REQ, mirrorId: 'nerinyan' })

    expect(handOff).toHaveBeenCalledWith('https://api.nerinyan.moe/d/42')
    expect(useDownloadQueue.getState().items[0].mirrorIdUsed).toBe('nerinyan')
  })

  it('retry re-hands-off the same set and re-records it', () => {
    const handOff = vi.fn()
    const record = vi.fn()
    configureDownloadQueue({ startBrowserDownload: handOff, record })

    const id = useDownloadQueue.getState().register(REQ)
    useDownloadQueue.getState().retry(id)

    expect(handOff).toHaveBeenCalledTimes(2)
    expect(handOff).toHaveBeenNthCalledWith(2, expect.stringContaining('beatconnect.io/b/42'))
    expect(record).toHaveBeenCalledTimes(2)
    expect(useDownloadQueue.getState().items).toHaveLength(1)
  })

  it('clearFinished removes every row', () => {
    configureDownloadQueue({ startBrowserDownload: vi.fn(), record: vi.fn() })
    useDownloadQueue.getState().register(REQ)
    useDownloadQueue.getState().register({ ...REQ, beatmapsetId: 43 })
    expect(useDownloadQueue.getState().items).toHaveLength(2)
    useDownloadQueue.getState().clearFinished()
    expect(useDownloadQueue.getState().items).toEqual([])
  })

  it('a throwing handoff marks the row failed and never attempts the copy', async () => {
    const fetchFn = vi.fn(async () => fakeSetResponse(new Uint8Array([1])))
    configureDownloadQueue({
      startBrowserDownload: () => {
        throw new Error('iframe blocked')
      },
      record: vi.fn(),
      folderDeps: { fetchFn },
    })

    const id = useDownloadQueue.getState().register(REQ)
    // No copy runs on a failed handoff, so no copy outcome ever
    // lands — poll the row directly instead of waitForCopy.
    await new Promise((r) => setTimeout(r, 50))
    const item = useDownloadQueue.getState().items.find((i) => i.id === id)
    expect(item?.status).toBe('failed')
    expect(item?.note).toBe('iframe blocked')
    expect(item?.copied).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('the Songs-folder copy fetches plain single-stream (no HEAD, no Range) and patches the row copied', async () => {
    useDownloadSettings.setState({ autoCopy: true })
    vi.stubGlobal('showDirectoryPicker', vi.fn())
    const { handle, written } = mockHandle()
    const fetchFn = vi.fn(
      async (_url: URL | RequestInfo, _init?: RequestInit): Promise<Response> =>
        fakeSetResponse(new Uint8Array([7, 8, 9])),
    )
    configureDownloadQueue({
      startBrowserDownload: vi.fn(),
      record: vi.fn(),
      folderDeps: {
        fetchFn,
        loadHandle: async () => handle,
        ensurePermission: async () => true,
      },
    })

    const id = useDownloadQueue.getState().register(REQ)
    await waitForCopy(id)

    // Exactly one plain GET: no HEAD probe, no Range headers, no
    // second fetch for the copy — the copy's fetch is the only one.
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0] as unknown as [URL | RequestInfo, RequestInit | undefined]
    expect(String(url)).toContain('beatconnect.io/b/42')
    expect(init?.method ?? 'GET').toBe('GET')
    expect((init?.headers as Record<string, string> | undefined)?.['Range']).toBeUndefined()
    expect(written).toHaveLength(1)
    const item = useDownloadQueue.getState().items.find((i) => i.id === id)
    expect(item?.copied).toBe('copied')
    expect(item?.note).toBe('Copied to your Songs folder.')
  })

  it('a failed copy patches the row failed while the download row stays browser', async () => {
    useDownloadSettings.setState({ autoCopy: true })
    vi.stubGlobal('showDirectoryPicker', vi.fn())
    const { handle } = mockHandle()
    const fetchFn = vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response)
    configureDownloadQueue({
      startBrowserDownload: vi.fn(),
      record: vi.fn(),
      folderDeps: {
        fetchFn,
        loadHandle: async () => handle,
        ensurePermission: async () => true,
      },
    })

    const id = useDownloadQueue.getState().register(REQ)
    await waitForCopy(id)

    const item = useDownloadQueue.getState().items.find((i) => i.id === id)
    expect(item?.status).toBe('browser')
    expect(item?.copied).toBe('failed')
    expect(item?.note).toContain('Songs-folder copy failed')
  })
})
