import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
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

/**
 * Download All (batch 11, part 7): every set registers through the
 * dock register, in order, staggered — never 50 handoffs in one
 * tick, never a fetch, never fake progress. Fake timers drive the
 * stagger so the timing is asserted exactly.
 */

const ITEMS: BulkDownloadItem[] = [
  { beatmapsetId: 10, artist: 'A', title: 'One' },
  { beatmapsetId: 20, artist: 'B', title: 'Two' },
  { beatmapsetId: 30, artist: 'C', title: 'Three' },
]

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  resetDownloadQueue()
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
    expect(register.mock.calls[0]?.[0]).toEqual({
      beatmapsetId: 10,
      artist: 'A',
      title: 'One',
      seenKeyValue: 'key',
      noVideo: undefined,
    })
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
})
