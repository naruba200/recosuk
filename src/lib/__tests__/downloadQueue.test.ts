import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  configureDownloadQueue,
  displayOrderFor,
  nextRetryMirrorId,
  resetDownloadQueue,
  useDownloadQueue,
} from '../downloadQueue'
import {
  NATIVE_MIRROR_ORDER,
  NATIVE_MIRROR_ORDER_NO_VIDEO,
} from '../downloadManager'
import { MIRROR_PRIORITY_DEFAULT, useDownloadSettings } from '../downloadSettings'

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
  useDownloadSettings.setState({
    autoCopy: false,
    noVideo: false,
    mirrorPriority: MIRROR_PRIORITY_DEFAULT,
  })
})

afterEach(() => {
  resetDownloadQueue()
  useDownloadSettings.setState({
    autoCopy: false,
    noVideo: false,
    mirrorPriority: MIRROR_PRIORITY_DEFAULT,
  })
  vi.unstubAllGlobals()
})
/** Minimal valid .osz bytes: PK zip magic + payload. */
const OSZ_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4])

function oszResponse(opts?: {
  status?: number
  contentType?: string
  contentLength?: number | null
  disposition?: string
  body?: Uint8Array<ArrayBuffer>
}): Response {
  const headers = new Headers()
  headers.set('Content-Type', opts?.contentType ?? 'application/octet-stream')
  if (opts?.contentLength !== undefined && opts.contentLength !== null) {
    headers.set('Content-Length', String(opts.contentLength))
  }
  if (opts?.disposition) headers.set('Content-Disposition', opts.disposition)
  return new Response(opts?.body ?? OSZ_BYTES, {
    status: opts?.status ?? 200,
    headers,
  })
}

/** Wait until a row leaves 'downloading' (fetch rows settle async). */
async function waitForTerminal(id: string, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  for (;;) {
    const item = useDownloadQueue.getState().items.find((i) => i.id === id)
    if (item && item.status !== 'downloading') return
    if (Date.now() - start > timeoutMs) {
      throw new Error(`row ${id} never settled (status: ${item?.status})`)
    }
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe('download register (batch 6, part 1)', () => {
  // Auto with beatconnect first: the download hands off via the
  // hidden iframe and the click is still recorded, with no fetch
  // at all. The dock row stays "Downloading" with no observable
  // completion, exactly like every other native mirror.
  it('Auto with beatconnect first hands off the iframe, records the download, with no fetch at all', async () => {
    const handOff = vi.fn()
    const openOfficial = vi.fn()
    const record = vi.fn()
    const fetchFn = vi.fn(async () => {
      throw new Error('the download itself must never fetch')
    })
    configureDownloadQueue({ startBrowserDownload: handOff, record, openOfficial, folderDeps: { fetchFn } })

    const id = useDownloadQueue.getState().register(REQ)
    await waitForCopy(id)

    expect(handOff).toHaveBeenCalledTimes(1)
    expect(handOff).toHaveBeenCalledWith('https://beatconnect.io/b/42')
    expect(openOfficial).not.toHaveBeenCalled()
    expect(record).toHaveBeenCalledWith('test', 42, 'beatconnect')
    expect(fetchFn).not.toHaveBeenCalled()
    const item = useDownloadQueue.getState().items[0]
    expect(item.status).toBe('browser')
    expect(item.mirrorIdUsed).toBe('beatconnect')
    expect(item.noVideo).toBe(false)
    expect(item.copied).toBe('skipped')
    expect(useDownloadQueue.getState().dockOpen).toBe(true)
  })

  it('no-video register fetches catboy first, with the verified {id}n URL', async () => {
    const handOff = vi.fn()
    const record = vi.fn()
    const saveFile = vi.fn()
    const fetchFn = vi.fn(async (_url: string) => oszResponse())
    configureDownloadQueue({
      startBrowserDownload: handOff,
      record,
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile,
    })

    const id = useDownloadQueue.getState().register({ ...REQ, noVideo: true })
    await waitForTerminal(id)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn.mock.calls[0]?.[0]).toBe('https://catboy.best/d/42n')
    expect(handOff).not.toHaveBeenCalled()
    expect(record).toHaveBeenCalledWith('test', 42, 'catboy')
    const item = useDownloadQueue.getState().items[0]
    expect(item.status).toBe('downloaded')
    expect(item.mirrorIdUsed).toBe('catboy')
    expect(item.noVideo).toBe(true)
  })

  it('an explicit mirror pick fetches that mirror only', async () => {
    const handOff = vi.fn()
    const record = vi.fn()
    const saveFile = vi.fn()
    const fetchFn = vi.fn(async (_url: string) => oszResponse())
    configureDownloadQueue({
      startBrowserDownload: handOff,
      record,
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile,
    })

    const id = useDownloadQueue.getState().register({ ...REQ, mirrorId: 'nerinyan' })
    await waitForTerminal(id)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn.mock.calls[0]?.[0]).toBe('https://api.nerinyan.moe/d/42')
    expect(handOff).not.toHaveBeenCalled()
    expect(record).toHaveBeenCalledWith('test', 42, 'nerinyan')
    expect(useDownloadQueue.getState().items[0].status).toBe('downloaded')
    expect(useDownloadQueue.getState().items[0].mirrorIdUsed).toBe('nerinyan')
  })

  it('retry re-hands-off via the NEXT mirror in the order and re-records it (batch 8)', async () => {
    const handOff = vi.fn()
    const openOfficial = vi.fn()
    const record = vi.fn()
    const saveFile = vi.fn()
    const fetchFn = vi.fn(async (_url: string) => oszResponse())
    configureDownloadQueue({
      startBrowserDownload: handOff,
      record,
      openOfficial,
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile,
    })

    const id = useDownloadQueue.getState().register(REQ)
    // The first attempt is BeatConnect via the iframe; the Retry
    // cycles to catboy, which is fetched in-page.
    expect(handOff).toHaveBeenCalledTimes(1)
    expect(handOff).toHaveBeenCalledWith('https://beatconnect.io/b/42')
    expect(openOfficial).not.toHaveBeenCalled()
    useDownloadQueue.getState().retry(id)
    await waitForTerminal(id)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn.mock.calls[0]?.[0]).toBe('https://catboy.best/d/42')
    expect(record).toHaveBeenCalledTimes(2)
    expect(record).toHaveBeenNthCalledWith(1, 'test', 42, 'beatconnect')
    expect(record).toHaveBeenNthCalledWith(2, 'test', 42, 'catboy')
    expect(useDownloadQueue.getState().items).toHaveLength(1)
    const item = useDownloadQueue.getState().items[0]
    expect(item.status).toBe('downloaded')
    expect(item.mirrorIdUsed).toBe('catboy')
    expect(item.triedMirrorIds).toEqual(['beatconnect', 'catboy'])
  })

  it('successive retries walk the display order, tabbing official only, fetching the rest', async () => {
    const handOff = vi.fn()
    const openOfficial = vi.fn()
    const saveFile = vi.fn()
    const fetchFn = vi.fn(async (_url: string) => oszResponse())
    configureDownloadQueue({
      startBrowserDownload: handOff,
      record: vi.fn(),
      openOfficial,
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile,
    })

    const id = useDownloadQueue.getState().register(REQ)
    const state = () => useDownloadQueue.getState()
    for (let i = 0; i < 6; i += 1) {
      state().retry(id)
      await waitForTerminal(id)
    }

    // The first attempt is BeatConnect via the iframe; the
    // retries fetch catboy, nerinyan, sayobot, hinai in-page,
    // then the official step opens the tab, then the cycle
    // wraps to BeatConnect via the iframe again.
    expect(openOfficial).toHaveBeenCalledTimes(1)
    expect(openOfficial).toHaveBeenCalledWith('https://osu.ppy.sh/beatmapsets/42/download')
    expect(handOff).toHaveBeenCalledTimes(2)
    expect(handOff).toHaveBeenNthCalledWith(1, 'https://beatconnect.io/b/42')
    expect(handOff).toHaveBeenNthCalledWith(2, 'https://beatconnect.io/b/42')
    expect(fetchFn).toHaveBeenCalledTimes(4)
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual([
      'https://catboy.best/d/42',
      'https://api.nerinyan.moe/d/42',
      'https://txy1.sayobot.cn/beatmaps/download/full/42',
      'https://mirror.hinamizawa.ai/api/v1/hinai/d/42',
    ])
    expect(state().items[0].triedMirrorIds).toEqual([
      'beatconnect',
      'catboy',
      'nerinyan',
      'sayobot',
      'hinai',
      'official',
      'beatconnect',
    ])
    expect(state().items[0].mirrorIdUsed).toBe('beatconnect')
  })

  it('no-video retries walk the no-video order (catboy first, then beatconnect, then full-file mirrors)', async () => {
    const handOff = vi.fn()
    const openOfficial = vi.fn()
    const saveFile = vi.fn()
    const fetchFn = vi.fn(async (_url: string) => oszResponse())
    configureDownloadQueue({
      startBrowserDownload: handOff,
      record: vi.fn(),
      openOfficial,
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile,
    })

    const id = useDownloadQueue.getState().register({ ...REQ, noVideo: true })
    await waitForTerminal(id)
    const state = () => useDownloadQueue.getState()
    state().retry(id)
    await waitForTerminal(id)
    state().retry(id)
    await waitForTerminal(id)

    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual([
      'https://catboy.best/d/42n',
      'https://api.nerinyan.moe/d/42',
    ])
    // BeatConnect via the iframe: the plain /b/{id} link — no
    // guessed no-video form.
    expect(handOff).toHaveBeenCalledTimes(1)
    expect(handOff).toHaveBeenCalledWith('https://beatconnect.io/b/42')
    expect(openOfficial).not.toHaveBeenCalled()
    expect(state().items[0].triedMirrorIds).toEqual(['catboy', 'beatconnect', 'nerinyan'])
  })

  it('an explicit mirror pick retries to the next mirror after the pick, then hinai, then the official tab, then beatconnect', async () => {
    const handOff = vi.fn()
    const openOfficial = vi.fn()
    const saveFile = vi.fn()
    const fetchFn = vi.fn(async (_url: string) => oszResponse())
    configureDownloadQueue({
      startBrowserDownload: handOff,
      record: vi.fn(),
      openOfficial,
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile,
    })

    const id = useDownloadQueue.getState().register({ ...REQ, mirrorId: 'nerinyan' })
    await waitForTerminal(id)
    const state = () => useDownloadQueue.getState()
    for (let i = 0; i < 4; i += 1) {
      state().retry(id)
      await waitForTerminal(id)
    }

    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual([
      'https://api.nerinyan.moe/d/42',
      'https://txy1.sayobot.cn/beatmaps/download/full/42',
      'https://mirror.hinamizawa.ai/api/v1/hinai/d/42',
    ])
    expect(handOff).toHaveBeenCalledTimes(1)
    expect(handOff).toHaveBeenCalledWith('https://beatconnect.io/b/42')
    expect(openOfficial).toHaveBeenCalledTimes(1)
    expect(openOfficial).toHaveBeenCalledWith('https://osu.ppy.sh/beatmapsets/42/download')
    expect(state().items[0].triedMirrorIds).toEqual([
      'nerinyan',
      'sayobot',
      'hinai',
      'official',
      'beatconnect',
    ])
  })

  it('nextRetryMirrorId names the mirror after the last attempt, wrapping through official', () => {
    const base = { noVideo: false, mirrorIdUsed: null, mirrorId: undefined } as const
    expect(nextRetryMirrorId({ ...base, triedMirrorIds: [] })).toBe('official')
    expect(nextRetryMirrorId({ ...base, triedMirrorIds: ['official'] })).toBe('beatconnect')
    expect(nextRetryMirrorId({ ...base, triedMirrorIds: ['beatconnect'] })).toBe('catboy')
    expect(nextRetryMirrorId({ ...base, triedMirrorIds: ['beatconnect', 'catboy', 'nerinyan', 'sayobot'] })).toBe(
      'hinai',
    )
    expect(
      nextRetryMirrorId({ ...base, triedMirrorIds: ['beatconnect', 'catboy', 'nerinyan', 'sayobot', 'hinai'] }),
    ).toBe('official')
    expect(
      nextRetryMirrorId({ ...base, noVideo: true, triedMirrorIds: ['catboy'] }),
    ).toBe('beatconnect')
    expect(
      nextRetryMirrorId({ ...base, noVideo: true, triedMirrorIds: ['official'] }),
    ).toBe('catboy')
    expect(
      nextRetryMirrorId({ ...base, triedMirrorIds: [], mirrorId: 'sayobot' }),
    ).toBe('hinai')
  })

  it('display order puts official first; native orders are unchanged', () => {
    expect([...displayOrderFor(false)]).toEqual([
      'official',
      'beatconnect',
      'catboy',
      'nerinyan',
      'sayobot',
      'hinai',
    ])
    expect([...displayOrderFor(true)]).toEqual([
      'official',
      'catboy',
      'beatconnect',
      'nerinyan',
      'sayobot',
      'hinai',
    ])
    expect([...NATIVE_MIRROR_ORDER]).toEqual(['beatconnect', 'catboy', 'nerinyan', 'sayobot', 'hinai'])
    expect([...NATIVE_MIRROR_ORDER_NO_VIDEO]).toEqual([
      'catboy',
      'beatconnect',
      'nerinyan',
      'sayobot',
      'hinai',
    ])
  })

  it('display order follows a custom Mirror Route Priority, official still pinned first', () => {
    useDownloadSettings.setState({ mirrorPriority: 'nerinyan' })
    expect([...displayOrderFor(false)]).toEqual([
      'official',
      'nerinyan',
      'beatconnect',
      'catboy',
      'sayobot',
      'hinai',
    ])
    expect(nextRetryMirrorId({
      noVideo: false,
      mirrorIdUsed: null,
      mirrorId: undefined,
      triedMirrorIds: ['official'],
    })).toBe('nerinyan')
  })

  it("register with mirrorId 'official' opens the official URL in a new tab, records, and never iframes or fetches", () => {
    const handOff = vi.fn()
    const openOfficial = vi.fn()
    const record = vi.fn()
    const fetchFn = vi.fn(async () => {
      throw new Error('the official path must never fetch')
    })
    configureDownloadQueue({
      startBrowserDownload: handOff,
      record,
      openOfficial,
      folderDeps: { fetchFn },
    })

    useDownloadQueue.getState().register({ ...REQ, mirrorId: 'official' })

    expect(openOfficial).toHaveBeenCalledTimes(1)
    expect(openOfficial).toHaveBeenCalledWith('https://osu.ppy.sh/beatmapsets/42/download')
    expect(handOff).not.toHaveBeenCalled()
    expect(record).toHaveBeenCalledWith('test', 42, 'official')
    expect(fetchFn).not.toHaveBeenCalled()
    const item = useDownloadQueue.getState().items[0]
    expect(item.mirrorIdUsed).toBe('official')
    expect(item.triedMirrorIds).toEqual(['official'])
    expect(item.copied).toBeNull()
  })

  it("register with mirrorId 'official' and noVideo opens the ?noVideo=1 tab, never the iframe", () => {
    const handOff = vi.fn()
    const openOfficial = vi.fn()
    configureDownloadQueue({ startBrowserDownload: handOff, record: vi.fn(), openOfficial })

    useDownloadQueue.getState().register({ ...REQ, mirrorId: 'official', noVideo: true })

    expect(openOfficial).toHaveBeenCalledTimes(1)
    expect(openOfficial).toHaveBeenCalledWith(
      'https://osu.ppy.sh/beatmapsets/42/download?noVideo=1',
    )
    expect(handOff).not.toHaveBeenCalled()
  })

  it('retry from an official attempt goes to the first native mirror', async () => {
    const handOff = vi.fn()
    const openOfficial = vi.fn()
    const saveFile = vi.fn()
    const fetchFn = vi.fn(async (_url: string) => oszResponse())
    configureDownloadQueue({
      startBrowserDownload: handOff,
      record: vi.fn(),
      openOfficial,
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile,
    })
    const state = () => useDownloadQueue.getState()

    const id = state().register({ ...REQ, mirrorId: 'official' })
    expect(openOfficial).toHaveBeenCalledTimes(1)
    expect(openOfficial).toHaveBeenCalledWith('https://osu.ppy.sh/beatmapsets/42/download')
    expect(handOff).not.toHaveBeenCalled()
    state().retry(id)

    // Retry advances to the next mirror in display order —
    // beatconnect, via the iframe; the official tab is not
    // re-opened.
    expect(openOfficial).toHaveBeenCalledTimes(1)
    expect(handOff).toHaveBeenCalledTimes(1)
    expect(handOff).toHaveBeenCalledWith('https://beatconnect.io/b/42')
    expect(state().items[0].triedMirrorIds).toEqual(['official', 'beatconnect'])

    state().retry(id)
    await waitForTerminal(id)
    // The next mirror is catboy, fetched in-page — not a
    // second iframe handoff.
    expect(handOff).toHaveBeenCalledTimes(1)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn.mock.calls[0]?.[0]).toBe('https://catboy.best/d/42')
    expect(openOfficial).toHaveBeenCalledTimes(1)
    expect(state().items[0].triedMirrorIds).toEqual(['official', 'beatconnect', 'catboy'])
    expect(state().items[0].status).toBe('downloaded')
  })

  // An explicit BeatConnect pick hands off the plain /b/{id}
  // link via the iframe — never a guessed no-video form —
  // records the attempt, and the row stays "Downloading" with
  // no observable completion.
  it("register with mirrorId 'beatconnect' hands off the iframe, records, and never fetches", () => {
    const handOff = vi.fn()
    const openOfficial = vi.fn()
    const record = vi.fn()
    const fetchFn = vi.fn(async () => {
      throw new Error('the download itself must never fetch')
    })
    configureDownloadQueue({
      startBrowserDownload: handOff,
      record,
      openOfficial,
      folderDeps: { fetchFn },
    })

    useDownloadQueue.getState().register({ ...REQ, mirrorId: 'beatconnect' })

    expect(handOff).toHaveBeenCalledTimes(1)
    expect(handOff).toHaveBeenCalledWith('https://beatconnect.io/b/42')
    expect(openOfficial).not.toHaveBeenCalled()
    expect(record).toHaveBeenCalledWith('test', 42, 'beatconnect')
    expect(fetchFn).not.toHaveBeenCalled()
    const item = useDownloadQueue.getState().items[0]
    expect(item.status).toBe('browser')
    expect(item.mirrorIdUsed).toBe('beatconnect')
    expect(item.triedMirrorIds).toEqual(['beatconnect'])
  })

  it("register with mirrorId 'beatconnect' and noVideo hands off the plain iframe URL, never a guessed no-video form", () => {
    const handOff = vi.fn()
    const openOfficial = vi.fn()
    configureDownloadQueue({ startBrowserDownload: handOff, record: vi.fn(), openOfficial })

    useDownloadQueue.getState().register({ ...REQ, mirrorId: 'beatconnect', noVideo: true })

    expect(handOff).toHaveBeenCalledTimes(1)
    expect(handOff).toHaveBeenCalledWith('https://beatconnect.io/b/42')
    expect(openOfficial).not.toHaveBeenCalled()
    expect(useDownloadQueue.getState().items[0].mirrorIdUsed).toBe('beatconnect')
  })

  it("register with mirrorId 'hinai' fetches the streaming endpoint in-page", async () => {
    const handOff = vi.fn()
    const openOfficial = vi.fn()
    const record = vi.fn()
    const saveFile = vi.fn()
    const fetchFn = vi.fn(async (_url: string) => oszResponse())
    configureDownloadQueue({
      startBrowserDownload: handOff,
      record,
      openOfficial,
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile,
    })

    const id = useDownloadQueue.getState().register({ ...REQ, mirrorId: 'hinai' })
    await waitForTerminal(id)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn.mock.calls[0]?.[0]).toBe('https://mirror.hinamizawa.ai/api/v1/hinai/d/42')
    expect(handOff).not.toHaveBeenCalled()
    expect(openOfficial).not.toHaveBeenCalled()
    expect(record).toHaveBeenCalledWith('test', 42, 'hinai')
    expect(useDownloadQueue.getState().items[0].status).toBe('downloaded')
    expect(useDownloadQueue.getState().items[0].mirrorIdUsed).toBe('hinai')
  })

  it('retry from an official no-video attempt goes catboy-first', async () => {
    const handOff = vi.fn()
    const openOfficial = vi.fn()
    const saveFile = vi.fn()
    const fetchFn = vi.fn(async (_url: string) => oszResponse())
    configureDownloadQueue({
      startBrowserDownload: handOff,
      record: vi.fn(),
      openOfficial,
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile,
    })
    const state = () => useDownloadQueue.getState()

    const id = state().register({
      ...REQ,
      mirrorId: 'official',
      noVideo: true,
    })
    expect(openOfficial).toHaveBeenCalledWith(
      'https://osu.ppy.sh/beatmapsets/42/download?noVideo=1',
    )
    state().retry(id)
    await waitForTerminal(id)

    expect(openOfficial).toHaveBeenCalledTimes(1)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn.mock.calls[0]?.[0]).toBe('https://catboy.best/d/42n')
    expect(handOff).not.toHaveBeenCalled()
    expect(state().items[0].triedMirrorIds).toEqual(['official', 'catboy'])
    expect(state().items[0].status).toBe('downloaded')
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

    // An explicit iframe-mirror pick (BeatConnect) reaches the
    // throwing handoff directly, so the row is marked failed.
    const id = useDownloadQueue.getState().register({ ...REQ, mirrorId: 'beatconnect' })
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
  it('a fetch download shows real progress and records only on actual success', async () => {
    const record = vi.fn()
    const saveFile = vi.fn()
    const fetchFn = vi.fn(async () => oszResponse({
      contentLength: OSZ_BYTES.length,
      disposition: 'attachment; filename="42 Test - Song.osz"',
    }))
    configureDownloadQueue({
      startBrowserDownload: vi.fn(),
      record,
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile,
    })

    const id = useDownloadQueue.getState().register({ ...REQ, mirrorId: 'hinai' })
    // While the fetch is in flight the row is mid-download with
    // no claim yet — and nothing is recorded.
    const mid = useDownloadQueue.getState().items.find((i) => i.id === id)
    expect(mid?.status).toBe('downloading')
    expect(record).not.toHaveBeenCalled()
    await waitForTerminal(id)

    const item = useDownloadQueue.getState().items.find((i) => i.id === id)
    expect(item?.status).toBe('downloaded')
    expect(item?.progress).toEqual({ received: OSZ_BYTES.length, total: OSZ_BYTES.length })
    expect(record).toHaveBeenCalledTimes(1)
    expect(record).toHaveBeenCalledWith('test', 42, 'hinai')
    expect(saveFile).toHaveBeenCalledWith(expect.any(Blob), '42 Test - Song.osz')
  })

  it('a failed fetchable mirror falls through automatically to the next mirror', async () => {
    const record = vi.fn()
    const saveFile = vi.fn()
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes('catboy')) return oszResponse({ status: 503 })
      return oszResponse()
    })
    configureDownloadQueue({
      startBrowserDownload: vi.fn(),
      record,
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile,
    })

    const id = useDownloadQueue.getState().register({ ...REQ, mirrorId: 'catboy' })
    await waitForTerminal(id)

    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual([
      'https://catboy.best/d/42',
      'https://api.nerinyan.moe/d/42',
    ])
    const item = useDownloadQueue.getState().items.find((i) => i.id === id)
    expect(item?.status).toBe('downloaded')
    expect(item?.mirrorIdUsed).toBe('nerinyan')
    expect(item?.triedMirrorIds).toEqual(['catboy', 'nerinyan'])
    // Recorded once, for the mirror that actually served it —
    // never for the failed one.
    expect(record).toHaveBeenCalledTimes(1)
    expect(record).toHaveBeenCalledWith('test', 42, 'nerinyan')
  })

  it('all fetchable mirrors failing marks the row Failed and records nothing', async () => {
    const record = vi.fn()
    const saveFile = vi.fn()
    const fetchFn = vi.fn(async () => oszResponse({ status: 503 }))
    configureDownloadQueue({
      startBrowserDownload: vi.fn(),
      record,
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile,
    })

    const id = useDownloadQueue.getState().register({ ...REQ, mirrorId: 'hinai' })
    await waitForTerminal(id)

    const item = useDownloadQueue.getState().items.find((i) => i.id === id)
    expect(item?.status).toBe('failed')
    expect(item?.note).toContain('503')
    expect(item?.triedMirrorIds).toEqual(['hinai', 'catboy', 'nerinyan', 'sayobot'])
    expect(record).not.toHaveBeenCalled()
    expect(saveFile).not.toHaveBeenCalled()
  })

  it('a 200 HTML page falls through as not-a-beatmap-file', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes('catboy')) {
        return oszResponse({
          contentType: 'text/html; charset=UTF-8',
          body: new TextEncoder().encode('<html>limited</html>'),
        })
      }
      return oszResponse()
    })
    configureDownloadQueue({
      startBrowserDownload: vi.fn(),
      record: vi.fn(),
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile: vi.fn(),
    })

    const id = useDownloadQueue.getState().register({ ...REQ, mirrorId: 'catboy' })
    await waitForTerminal(id)

    const item = useDownloadQueue.getState().items.find((i) => i.id === id)
    expect(item?.status).toBe('downloaded')
    expect(item?.mirrorIdUsed).toBe('nerinyan')
  })

  it('progress stays indeterminate (total null) while Content-Length is absent', async () => {
    const saveFile = vi.fn()
    let streamController!: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        streamController = c
      },
    })
    const fetchFn = vi.fn(async () => new Response(stream, {
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/octet-stream' }),
    }))
    configureDownloadQueue({
      startBrowserDownload: vi.fn(),
      record: vi.fn(),
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile,
    })

    const id = useDownloadQueue.getState().register({ ...REQ, mirrorId: 'hinai' })
    // Deliver the first chunk, then let the reader loop run.
    streamController.enqueue(OSZ_BYTES.subarray(0, 4))
    await new Promise((r) => setTimeout(r, 50))
    const mid = useDownloadQueue.getState().items.find((i) => i.id === id)
    expect(mid?.status).toBe('downloading')
    expect(mid?.progress).toEqual({ received: 4, total: null })
    streamController.enqueue(OSZ_BYTES.subarray(4))
    streamController.close()
    await waitForTerminal(id)

    const item = useDownloadQueue.getState().items.find((i) => i.id === id)
    expect(item?.status).toBe('downloaded')
    expect(item?.progress).toEqual({ received: OSZ_BYTES.length, total: OSZ_BYTES.length })
  })

  it('retry aborts an in-flight fetch and the superseded attempt never lands', async () => {
    const openOfficial = vi.fn()
    const saveFile = vi.fn()
    let deferredResolve!: (r: Response) => void
    const signals: (AbortSignal | null | undefined)[] = []
    const fetchFn = vi.fn((_url: string, init?: RequestInit) => {
      signals.push(init?.signal)
      return new Promise<Response>((resolve) => {
        deferredResolve = resolve
      })
    })
    configureDownloadQueue({
      startBrowserDownload: vi.fn(),
      record: vi.fn(),
      openOfficial,
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile,
    })

    const id = useDownloadQueue.getState().register({ ...REQ, mirrorId: 'hinai' })
    expect(useDownloadQueue.getState().items[0].status).toBe('downloading')
    // Retry aborts the fetch; the next mirror after hinai in
    // display order is official (tab).
    useDownloadQueue.getState().retry(id)
    expect(signals[0]?.aborted).toBe(true)
    expect(openOfficial).toHaveBeenCalledTimes(1)
    expect(openOfficial).toHaveBeenCalledWith('https://osu.ppy.sh/beatmapsets/42/download')
    expect(fetchFn).toHaveBeenCalledTimes(1)
    // The aborted fetch resolving late must not clobber the row.
    deferredResolve(oszResponse())
    await new Promise((r) => setTimeout(r, 50))
    const item = useDownloadQueue.getState().items[0]
    expect(item.status).toBe('browser')
    expect(item.mirrorIdUsed).toBe('official')
    expect(item.triedMirrorIds).toEqual(['hinai', 'official'])
  })

  it('a fetch download hands its bytes to the Songs-folder copy — no second fetch', async () => {
    useDownloadSettings.setState({ autoCopy: true })
    vi.stubGlobal('showDirectoryPicker', vi.fn())
    const { handle, written } = mockHandle()
    const downloadFetch = vi.fn(async () => oszResponse({
      contentLength: OSZ_BYTES.length,
      disposition: 'attachment; filename="42 Test - Song.osz"',
    }))
    const copyFetch = vi.fn(async () => {
      throw new Error('the copy must reuse the downloaded bytes, never fetch')
    })
    configureDownloadQueue({
      startBrowserDownload: vi.fn(),
      record: vi.fn(),
      fetchFn: downloadFetch as unknown as typeof fetch,
      saveFile: vi.fn(),
      folderDeps: {
        fetchFn: copyFetch as unknown as typeof fetch,
        loadHandle: async () => handle,
        ensurePermission: async () => true,
      },
    })

    const id = useDownloadQueue.getState().register({ ...REQ, mirrorId: 'hinai' })
    await waitForCopy(id)

    expect(downloadFetch).toHaveBeenCalledTimes(1)
    expect(copyFetch).not.toHaveBeenCalled()
    // The written value is the downloaded Blob itself (the copy
    // writes the same bytes the download saved).
    expect(written).toHaveLength(1)
    const copiedBytes = Buffer.from(await (written[0] as Blob).arrayBuffer())
    expect(copiedBytes.equals(Buffer.from(OSZ_BYTES))).toBe(true)
    const item = useDownloadQueue.getState().items.find((i) => i.id === id)
    expect(item?.status).toBe('downloaded')
    expect(item?.copied).toBe('copied')
    expect(item?.note).toBe('Copied to your Songs folder.')
  })

  it('clearFinished keeps a still-downloading row and removes finished ones', async () => {
    const saveFile = vi.fn()
    let deferredResolve!: (r: Response) => void
    const fetchFn = vi.fn(
      () => new Promise<Response>((resolve) => { deferredResolve = resolve }),
    )
    configureDownloadQueue({
      startBrowserDownload: vi.fn(),
      record: vi.fn(),
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile,
    })

    const finishedId = useDownloadQueue.getState().register({ ...REQ, mirrorId: 'beatconnect' })
    const downloadingId = useDownloadQueue.getState().register({
      ...REQ,
      beatmapsetId: 43,
      mirrorId: 'hinai',
    })
    expect(finishedId).not.toBe(downloadingId)
    expect(useDownloadQueue.getState().items).toHaveLength(2)
    useDownloadQueue.getState().clearFinished()
    const remaining = useDownloadQueue.getState().items
    expect(remaining.map((i) => i.id)).toEqual([downloadingId])
    expect(remaining[0]?.status).toBe('downloading')
    // Let the pending fetch settle so the test leaves nothing hanging.
    deferredResolve(oszResponse())
    await waitForTerminal(downloadingId)
    expect(useDownloadQueue.getState().items[0]?.status).toBe('downloaded')
  })
})
