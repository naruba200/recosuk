import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  configureDownloadQueue,
  displayOrderFor,
  nextRetryMirrorId,
  resetDownloadQueue,
  retryTarget,
  useDownloadQueue,
} from '../downloadQueue'
import {
  DISPLAY_MIRROR_ORDER,
  DISPLAY_MIRROR_ORDER_NO_VIDEO,
  NATIVE_MIRROR_ORDER,
  NATIVE_MIRROR_ORDER_NO_VIDEO,
} from '../downloadManager'
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

  it('retry re-hands-off via the NEXT mirror in the order and re-records it (batch 8)', () => {
    const handOff = vi.fn()
    const record = vi.fn()
    configureDownloadQueue({ startBrowserDownload: handOff, record })

    const id = useDownloadQueue.getState().register(REQ)
    useDownloadQueue.getState().retry(id)

    expect(handOff).toHaveBeenCalledTimes(2)
    expect(handOff).toHaveBeenNthCalledWith(2, expect.stringContaining('catboy.best/d/42'))
    expect(record).toHaveBeenCalledTimes(2)
    expect(record).toHaveBeenNthCalledWith(2, 'test', 42, 'catboy')
    expect(useDownloadQueue.getState().items).toHaveLength(1)
    const item = useDownloadQueue.getState().items[0]
    expect(item.mirrorIdUsed).toBe('catboy')
    expect(item.triedMirrorIds).toEqual(['beatconnect', 'catboy'])
  })

  it('successive retries walk the display order, iframe official on wrap-around, tab on the retry while on official, then native again', () => {
    const handOff = vi.fn()
    const openOfficial = vi.fn()
    configureDownloadQueue({ startBrowserDownload: handOff, record: vi.fn(), openOfficial })

    const id = useDownloadQueue.getState().register(REQ)
    const state = () => useDownloadQueue.getState()
    state().retry(id)
    state().retry(id)
    state().retry(id)
    state().retry(id)
    state().retry(id)
    state().retry(id)

    // Four native iframe handoffs, then the official step via the
    // iframe handoff (wrap-around is a fresh official step), then
    // the tab fallback on the Retry while the row is still on
    // official, then native again from the top of the native order.
    expect(handOff).toHaveBeenCalledTimes(6)
    expect(handOff).toHaveBeenNthCalledWith(1, expect.stringContaining('beatconnect.io/b/42'))
    expect(handOff).toHaveBeenNthCalledWith(2, expect.stringContaining('catboy.best/d/42'))
    expect(handOff).toHaveBeenNthCalledWith(3, expect.stringContaining('api.nerinyan.moe/d/42'))
    expect(handOff).toHaveBeenNthCalledWith(4, expect.stringContaining('txy1.sayobot.cn/beatmaps/download/full/42'))
    expect(handOff).toHaveBeenNthCalledWith(5, 'https://osu.ppy.sh/beatmapsets/42/download')
    expect(openOfficial).toHaveBeenCalledTimes(1)
    expect(openOfficial).toHaveBeenCalledWith('https://osu.ppy.sh/beatmapsets/42/download')
    expect(handOff).toHaveBeenNthCalledWith(6, expect.stringContaining('beatconnect.io/b/42'))
    expect(state().items[0].triedMirrorIds).toEqual([
      'beatconnect',
      'catboy',
      'nerinyan',
      'sayobot',
      'official',
      'official',
      'beatconnect',
    ])
    expect(state().items[0].mirrorIdUsed).toBe('beatconnect')
  })

  it('no-video retries walk the no-video order (catboy first, then full-file mirrors)', () => {
    const handOff = vi.fn()
    configureDownloadQueue({ startBrowserDownload: handOff, record: vi.fn() })

    const id = useDownloadQueue.getState().register({ ...REQ, noVideo: true })
    const state = () => useDownloadQueue.getState()
    state().retry(id)
    state().retry(id)

    expect(handOff).toHaveBeenNthCalledWith(1, 'https://catboy.best/d/42n')
    expect(handOff).toHaveBeenNthCalledWith(2, expect.stringContaining('beatconnect.io/b/42'))
    expect(handOff).toHaveBeenNthCalledWith(2, expect.not.stringContaining('42n'))
    expect(handOff).toHaveBeenNthCalledWith(3, expect.stringContaining('api.nerinyan.moe/d/42'))
    expect(state().items[0].triedMirrorIds).toEqual(['catboy', 'beatconnect', 'nerinyan'])
  })

  it('an explicit mirror pick retries to the next mirror after the pick, then official via iframe, then the tab, then native again', () => {
    const handOff = vi.fn()
    const openOfficial = vi.fn()
    configureDownloadQueue({ startBrowserDownload: handOff, record: vi.fn(), openOfficial })

    const id = useDownloadQueue.getState().register({ ...REQ, mirrorId: 'nerinyan' })
    const state = () => useDownloadQueue.getState()
    state().retry(id)
    state().retry(id)
    state().retry(id)
    state().retry(id)

    expect(handOff).toHaveBeenNthCalledWith(1, expect.stringContaining('api.nerinyan.moe/d/42'))
    expect(handOff).toHaveBeenNthCalledWith(2, expect.stringContaining('txy1.sayobot.cn/beatmaps/download/full/42'))
    expect(handOff).toHaveBeenNthCalledWith(3, 'https://osu.ppy.sh/beatmapsets/42/download')
    expect(openOfficial).toHaveBeenCalledTimes(1)
    expect(openOfficial).toHaveBeenCalledWith('https://osu.ppy.sh/beatmapsets/42/download')
    expect(handOff).toHaveBeenNthCalledWith(4, expect.stringContaining('beatconnect.io/b/42'))
    expect(state().items[0].triedMirrorIds).toEqual([
      'nerinyan',
      'sayobot',
      'official',
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
      'official',
    )
    expect(
      nextRetryMirrorId({ ...base, noVideo: true, triedMirrorIds: ['catboy'] }),
    ).toBe('beatconnect')
    expect(
      nextRetryMirrorId({ ...base, noVideo: true, triedMirrorIds: ['official'] }),
    ).toBe('catboy')
    expect(
      nextRetryMirrorId({ ...base, triedMirrorIds: [], mirrorId: 'sayobot' }),
    ).toBe('official')
  })

  it('retryTarget opens the tab when the row is still on an official iframe attempt', () => {
    const base = { noVideo: false, mirrorIdUsed: null, mirrorId: undefined } as const
    expect(retryTarget({ ...base, triedMirrorIds: ['official'] })).toEqual({
      mirrorId: 'official',
      viaTab: true,
    })
    expect(retryTarget({ ...base, triedMirrorIds: ['beatconnect', 'official'] })).toEqual({
      mirrorId: 'official',
      viaTab: true,
    })
    // An explicit official pick with no recorded attempt yet also
    // falls back to the tab: nothing was ever handed off.
    expect(retryTarget({ ...base, triedMirrorIds: [], mirrorId: 'official' })).toEqual({
      mirrorId: 'official',
      viaTab: true,
    })
  })

  it('retryTarget advances to the native mirrors once the tab fallback was used', () => {
    const base = { noVideo: false, mirrorIdUsed: null, mirrorId: undefined } as const
    expect(retryTarget({ ...base, triedMirrorIds: ['official', 'official'] })).toEqual({
      mirrorId: 'beatconnect',
      viaTab: false,
    })
    expect(
      retryTarget({ ...base, noVideo: true, triedMirrorIds: ['official', 'official'] }),
    ).toEqual({ mirrorId: 'catboy', viaTab: false })
  })

  it('retryTarget iframing official on wrap-around (fresh official step, tab still available)', () => {
    const base = { noVideo: false, mirrorIdUsed: null, mirrorId: undefined } as const
    expect(
      retryTarget({ ...base, triedMirrorIds: ['beatconnect', 'catboy', 'nerinyan', 'sayobot'] }),
    ).toEqual({ mirrorId: 'official', viaTab: false })
    expect(retryTarget({ ...base, triedMirrorIds: ['beatconnect'] })).toEqual({
      mirrorId: 'catboy',
      viaTab: false,
    })
  })

  it('display order puts official first; native orders are unchanged', () => {
    expect([...DISPLAY_MIRROR_ORDER]).toEqual([
      'official',
      'beatconnect',
      'catboy',
      'nerinyan',
      'sayobot',
    ])
    expect([...DISPLAY_MIRROR_ORDER_NO_VIDEO]).toEqual([
      'official',
      'catboy',
      'beatconnect',
      'nerinyan',
      'sayobot',
    ])
    expect([...NATIVE_MIRROR_ORDER]).toEqual(['beatconnect', 'catboy', 'nerinyan', 'sayobot'])
    expect([...NATIVE_MIRROR_ORDER_NO_VIDEO]).toEqual([
      'catboy',
      'beatconnect',
      'nerinyan',
      'sayobot',
    ])
    expect(displayOrderFor(false)).toBe(DISPLAY_MIRROR_ORDER)
    expect(displayOrderFor(true)).toBe(DISPLAY_MIRROR_ORDER_NO_VIDEO)
  })

  it("register with mirrorId 'official' hands the official URL to the browser via the iframe handoff, records, and never opens a tab or fetches", () => {
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

    expect(handOff).toHaveBeenCalledTimes(1)
    expect(handOff).toHaveBeenCalledWith('https://osu.ppy.sh/beatmapsets/42/download')
    expect(openOfficial).not.toHaveBeenCalled()
    expect(record).toHaveBeenCalledWith('test', 42, 'official')
    expect(fetchFn).not.toHaveBeenCalled()
    const item = useDownloadQueue.getState().items[0]
    expect(item.mirrorIdUsed).toBe('official')
    expect(item.triedMirrorIds).toEqual(['official'])
    expect(item.copied).toBeNull()
  })

  it("register with mirrorId 'official' and noVideo hands off the ?noVideo=1 URL via the iframe, never a tab", () => {
    const handOff = vi.fn()
    const openOfficial = vi.fn()
    configureDownloadQueue({ startBrowserDownload: handOff, record: vi.fn(), openOfficial })

    useDownloadQueue.getState().register({ ...REQ, mirrorId: 'official', noVideo: true })

    expect(handOff).toHaveBeenCalledTimes(1)
    expect(handOff).toHaveBeenCalledWith(
      'https://osu.ppy.sh/beatmapsets/42/download?noVideo=1',
    )
    expect(openOfficial).not.toHaveBeenCalled()
  })

  it('retry from an official attempt opens the official tab, and the next retry goes to the first native mirror', () => {
    const handOff = vi.fn()
    const openOfficial = vi.fn()
    configureDownloadQueue({ startBrowserDownload: handOff, record: vi.fn(), openOfficial })
    const state = () => useDownloadQueue.getState()

    const id = state().register({ ...REQ, mirrorId: 'official' })
    expect(handOff).toHaveBeenCalledTimes(1)
    expect(handOff).toHaveBeenCalledWith('https://osu.ppy.sh/beatmapsets/42/download')
    state().retry(id)

    // Retry while the row is still on official: the visible tab
    // fallback (the iframe fails silently when signed out of
    // osu!, so the tab is where the user can sign in).
    expect(openOfficial).toHaveBeenCalledTimes(1)
    expect(openOfficial).toHaveBeenCalledWith('https://osu.ppy.sh/beatmapsets/42/download')
    expect(handOff).toHaveBeenCalledTimes(1)
    expect(state().items[0].triedMirrorIds).toEqual(['official', 'official'])

    // The tab fallback is spent: the next Retry advances to natives.
    state().retry(id)
    expect(handOff).toHaveBeenCalledTimes(2)
    expect(handOff).toHaveBeenCalledWith(expect.stringContaining('beatconnect.io/b/42'))
    expect(openOfficial).toHaveBeenCalledTimes(1)
    expect(state().items[0].triedMirrorIds).toEqual(['official', 'official', 'beatconnect'])
  })

  it('retry from an official attempt opens the ?noVideo=1 tab, and the next retry goes catboy-first', () => {
    const handOff = vi.fn()
    const openOfficial = vi.fn()
    configureDownloadQueue({
      startBrowserDownload: handOff,
      record: vi.fn(),
      openOfficial,
    })
    const state = () => useDownloadQueue.getState()

    const id = state().register({
      ...REQ,
      mirrorId: 'official',
      noVideo: true,
    })
    expect(handOff).toHaveBeenCalledWith('https://osu.ppy.sh/beatmapsets/42/download?noVideo=1')
    state().retry(id)

    expect(openOfficial).toHaveBeenCalledTimes(1)
    expect(openOfficial).toHaveBeenCalledWith(
      'https://osu.ppy.sh/beatmapsets/42/download?noVideo=1',
    )
    expect(handOff).toHaveBeenCalledTimes(1)

    state().retry(id)
    expect(handOff).toHaveBeenCalledWith('https://catboy.best/d/42n')
    expect(state().items[0].triedMirrorIds).toEqual(['official', 'official', 'catboy'])
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
