import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BULK_DOWNLOAD_CONCURRENCY,
  BULK_DOWNLOAD_STAGGER_MS,
  scheduleBulkDownload,
  type BulkDownloadItem,
} from '../bulkDownload'
import {
  configureDownloadQueue,
  resetDownloadQueue,
  useDownloadQueue,
  type RegisterRequest,
} from '../downloadQueue'
import { useDownloadSettings } from '../downloadSettings'

/**
 * Download All (batch 11, part 7; batch AI: real queue): every set
 * registers through the dock register, in order — the stagger is
 * the minimum gap between registrations, and at most
 * BULK_DOWNLOAD_CONCURRENCY downloads run at once. Fake timers
 * drive the stagger so the timing is asserted exactly.
 */

const ITEMS: BulkDownloadItem[] = [
  { beatmapsetId: 10, artist: 'A', title: 'One' },
  { beatmapsetId: 20, artist: 'B', title: 'Two' },
  { beatmapsetId: 30, artist: 'C', title: 'Three' },
]

beforeEach(() => {
  vi.useFakeTimers()
  useDownloadSettings.setState({ mirrorPriority: 'balanced', noVideo: false, autoCopy: false })
})

afterEach(() => {
  vi.useRealTimers()
  resetDownloadQueue()
  useDownloadSettings.setState({ mirrorPriority: 'balanced', noVideo: false, autoCopy: false })
  vi.restoreAllMocks()
})

describe('scheduleBulkDownload (staggered dock register)', () => {
  it('registers the first set immediately, then one per stagger gap, in order', () => {
    expect(BULK_DOWNLOAD_STAGGER_MS).toBeGreaterThanOrEqual(200)
    expect(BULK_DOWNLOAD_STAGGER_MS).toBeLessThanOrEqual(300)
    const register = vi.fn((_req: RegisterRequest) => 'id')
    const onSettled = vi.fn()

    scheduleBulkDownload(ITEMS, { register, seenKeyValue: 'key', onSettled })

    expect(register).toHaveBeenCalledTimes(1)
    // Bulk passes an onSettled callback per item (the
    // concurrency cap frees a slot when a row settles), so the
    // call is asserted by fields, not exact equality.
    expect(register.mock.calls[0]?.[0]).toMatchObject({
      beatmapsetId: 10,
      artist: 'A',
      title: 'One',
      seenKeyValue: 'key',
      noVideo: undefined,
    })
    expect(typeof register.mock.calls[0]?.[0]?.onSettled).toBe('function')
    expect(onSettled).not.toHaveBeenCalled()

    vi.advanceTimersByTime(BULK_DOWNLOAD_STAGGER_MS - 1)
    expect(register).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(register).toHaveBeenCalledTimes(2)
    expect(register).toHaveBeenNthCalledWith(2, expect.objectContaining({ beatmapsetId: 20 }))
    vi.advanceTimersByTime(BULK_DOWNLOAD_STAGGER_MS)
    expect(register).toHaveBeenCalledTimes(3)
    expect(register).toHaveBeenNthCalledWith(3, expect.objectContaining({ beatmapsetId: 30 }))
    expect(onSettled).toHaveBeenCalledTimes(1)
    // No further timers: advancing again registers nothing.
    vi.advanceTimersByTime(10_000)
    expect(register).toHaveBeenCalledTimes(3)
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it('passes seenKeyValue and the explicit no-video flag to every register call', () => {
    const register = vi.fn((_req: RegisterRequest) => 'id')
    scheduleBulkDownload(ITEMS.slice(0, 2), {
      register,
      seenKeyValue: 'lists-key',
      noVideo: true,
    })
    vi.advanceTimersByTime(BULK_DOWNLOAD_STAGGER_MS)
    expect(register).toHaveBeenCalledTimes(2)
    for (const call of register.mock.calls) {
      expect(call[0]).toMatchObject({ seenKeyValue: 'lists-key', noVideo: true })
    }
  })

  it('cancel stops the pending handoffs and settles exactly once', () => {
    const register = vi.fn((_req: RegisterRequest) => 'id')
    const onSettled = vi.fn()
    const cancel = scheduleBulkDownload(ITEMS, { register, seenKeyValue: 'key', onSettled })

    expect(register).toHaveBeenCalledTimes(1)
    cancel()
    vi.advanceTimersByTime(10_000)
    expect(register).toHaveBeenCalledTimes(1)
    expect(onSettled).toHaveBeenCalledTimes(1)
    // Cancelling again is a no-op: no second settle.
    cancel()
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it('dedupes by beatmapset_id, first occurrence wins', () => {
    const register = vi.fn((_req: RegisterRequest) => 'id')
    scheduleBulkDownload(
      [
        { beatmapsetId: 10, artist: 'A', title: 'One' },
        { beatmapsetId: 10, artist: 'A', title: 'One again' },
        { beatmapsetId: 20, artist: 'B', title: 'Two' },
      ],
      { register, seenKeyValue: 'key' },
    )
    vi.advanceTimersByTime(BULK_DOWNLOAD_STAGGER_MS)
    expect(register).toHaveBeenCalledTimes(2)
    expect(register.mock.calls.map((c) => c[0]?.beatmapsetId)).toEqual([10, 20])
    expect(register.mock.calls[0]?.[0]?.title).toBe('One')
  })

  it('an empty list registers nothing and settles immediately with no timers', () => {
    const register = vi.fn((_req: RegisterRequest) => 'id')
    const onSettled = vi.fn()
    const cancel = scheduleBulkDownload([], { register, seenKeyValue: 'key', onSettled })
    expect(register).not.toHaveBeenCalled()
    expect(onSettled).toHaveBeenCalledTimes(1)
    cancel()
    vi.advanceTimersByTime(10_000)
    expect(register).not.toHaveBeenCalled()
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it('registers one dock item per set, in order, through the real download register', () => {
    const handOff = vi.fn()
    const openOfficial = vi.fn()
    configureDownloadQueue({ startBrowserDownload: handOff, record: vi.fn(), openOfficial })
    const register = useDownloadQueue.getState().register
    const onSettled = vi.fn()

    scheduleBulkDownload(ITEMS, { register, seenKeyValue: 'key', noVideo: false, onSettled })

    expect(useDownloadQueue.getState().items.map((i) => i.beatmapsetId)).toEqual([10])
    vi.advanceTimersByTime(BULK_DOWNLOAD_STAGGER_MS)
    expect(useDownloadQueue.getState().items.map((i) => i.beatmapsetId)).toEqual([10, 20])
    vi.advanceTimersByTime(BULK_DOWNLOAD_STAGGER_MS)
    expect(useDownloadQueue.getState().items.map((i) => i.beatmapsetId)).toEqual([10, 20, 30])
    expect(useDownloadQueue.getState().dockOpen).toBe(true)
    // Bulk routes through the same handoff as single downloads:
    // Auto with beatconnect first hands off via the iframe,
    // one per set.
    expect(handOff).toHaveBeenCalledTimes(3)
    expect(handOff).toHaveBeenNthCalledWith(1, 'https://beatconnect.io/b/10')
    expect(handOff).toHaveBeenNthCalledWith(2, 'https://beatconnect.io/b/20')
    expect(handOff).toHaveBeenNthCalledWith(3, 'https://beatconnect.io/b/30')
    expect(openOfficial).not.toHaveBeenCalled()
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it('registers at most BULK_DOWNLOAD_CONCURRENCY items before a settle frees a slot', () => {
    expect(BULK_DOWNLOAD_CONCURRENCY).toBe(3)
    const settles: (() => void)[] = []
    const register = vi.fn((req: RegisterRequest) => {
      if (req.onSettled) settles.push(req.onSettled)
      return 'id'
    })
    const onSettled = vi.fn()
    const five = [
      ...ITEMS,
      { beatmapsetId: 40, artist: 'D', title: 'Four' },
      { beatmapsetId: 50, artist: 'E', title: 'Five' },
    ]
    scheduleBulkDownload(five, { register, seenKeyValue: 'key', onSettled })

    // The first registers synchronously; the pump adds one per
    // stagger gap until the cap is reached — then it waits for
    // a settle instead of registering more.
    expect(register).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(BULK_DOWNLOAD_STAGGER_MS)
    expect(register).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(BULK_DOWNLOAD_STAGGER_MS)
    expect(register).toHaveBeenCalledTimes(3)
    vi.advanceTimersByTime(10_000)
    expect(register).toHaveBeenCalledTimes(3)
    expect(onSettled).not.toHaveBeenCalled()

    // One settle frees a slot; the pump registers the next set.
    settles[0]?.()
    vi.advanceTimersByTime(BULK_DOWNLOAD_STAGGER_MS)
    expect(register).toHaveBeenCalledTimes(4)
    settles[1]?.()
    vi.advanceTimersByTime(BULK_DOWNLOAD_STAGGER_MS)
    expect(register).toHaveBeenCalledTimes(5)
    // Bulk settles when the last item REGISTERS — even though
    // items 3, 4 and 5 are still downloading.
    expect(onSettled).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(10_000)
    expect(register).toHaveBeenCalledTimes(5)
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it('through the real queue, at most 3 fetches run at once; resolving one starts the next', async () => {
    const OSZ_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4])
    const oszResponse = () =>
      new Response(OSZ_BYTES, {
        status: 200,
        headers: new Headers({
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(OSZ_BYTES.length),
        }),
      })
    useDownloadSettings.setState({ mirrorPriority: 'hinai' })
    const pending: ((r: Response) => void)[] = []
    const fetchFn = vi.fn(
      () => new Promise<Response>((resolve) => { pending.push(resolve) }),
    )
    const saveFile = vi.fn()
    configureDownloadQueue({
      startBrowserDownload: vi.fn(),
      record: vi.fn(),
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile,
    })
    const register = useDownloadQueue.getState().register
    const onSettled = vi.fn()
    const five = [
      ...ITEMS,
      { beatmapsetId: 40, artist: 'D', title: 'Four' },
      { beatmapsetId: 50, artist: 'E', title: 'Five' },
    ]

    scheduleBulkDownload(five, { register, seenKeyValue: 'key', onSettled })
    await vi.advanceTimersByTimeAsync(BULK_DOWNLOAD_STAGGER_MS)
    await vi.advanceTimersByTimeAsync(BULK_DOWNLOAD_STAGGER_MS)
    await vi.advanceTimersByTimeAsync(10_000)
    // Three fetches in flight, the cap — the 4th and 5th sets
    // are not even registered yet.
    expect(fetchFn).toHaveBeenCalledTimes(3)
    expect(useDownloadQueue.getState().items).toHaveLength(3)
    expect(onSettled).not.toHaveBeenCalled()

    // Resolving one fetch frees a slot; the pump registers the
    // next set, which starts its fetch.
    pending[0]?.(oszResponse())
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(BULK_DOWNLOAD_STAGGER_MS)
    expect(fetchFn).toHaveBeenCalledTimes(4)
    expect(useDownloadQueue.getState().items).toHaveLength(4)

    pending[1]?.(oszResponse())
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(BULK_DOWNLOAD_STAGGER_MS)
    expect(fetchFn).toHaveBeenCalledTimes(5)
    expect(useDownloadQueue.getState().items).toHaveLength(5)
    // The last item registered, so the bulk settles — even
    // though fetches 3, 4 and 5 are still in flight.
    expect(onSettled).toHaveBeenCalledTimes(1)

    // Drain the rest so the test leaves nothing in flight.
    for (const resolve of pending.splice(2)) resolve(oszResponse())
    await vi.advanceTimersByTimeAsync(0)
    expect(
      useDownloadQueue.getState().items.filter((i) => i.status === 'downloaded'),
    ).toHaveLength(5)
  })
})
