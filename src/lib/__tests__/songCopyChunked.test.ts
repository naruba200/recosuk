import { describe, expect, it, vi } from 'vitest'

/**
 * Batch 5, item D: chunked multi-connection download in
 * fetchSetResponseChunked — one HEAD/range probe, then up to 4
 * concurrent Range requests reassembled in order, ONLY when the
 * mirror is CORS-readable and advertises range support. Every other
 * case falls back to the plain single-stream fetch of the same URL
 * (then the next mirror), never a partial file, never fake progress.
 */

import {
  CHUNK_CONNECTIONS,
  CHUNKED_MIN_BYTES,
  fetchSetResponseChunked,
  type SongCopyRequest,
} from '../songCopy'

const REQUEST: SongCopyRequest = { beatmapsetId: 42, artist: 'Artist', title: 'Title' }

/** Deterministic virtual file: byte i = i % 251, so assembly ORDER
 * is proven, not just the multiset of bytes. */
function virtualFile(total: number): Uint8Array {
  const buf = new Uint8Array(total)
  for (let i = 0; i < total; i++) buf[i] = i % 251
  return buf
}

/** Order-sensitive rolling hash: any transposition changes it. */
function hashBytes(buf: Uint8Array): number {
  let h = 0
  for (let i = 0; i < buf.byteLength; i++) h = (h * 31 + buf[i]) >>> 0
  return h
}

interface RangeFetchOpts {
  acceptRanges?: boolean
  contentLength?: boolean
  headThrows?: boolean
  /** Part index (0-based, in Range order) whose GET answers 500. */
  failPart?: number
  /** Status the Range GETs answer with (200 = ignores Range). */
  rangeStatus?: number
}

function makeFetch(file: Uint8Array, opts: RangeFetchOpts = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const partSize = Math.ceil(file.byteLength / CHUNK_CONNECTIONS)
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const method = (init?.method ?? 'GET').toUpperCase()
    if (method === 'HEAD') {
      if (opts.headThrows) throw new Error('HEAD blocked')
      const headers = new Headers()
      if (opts.acceptRanges !== false) headers.set('accept-ranges', 'bytes')
      if (opts.contentLength !== false) headers.set('content-length', String(file.byteLength))
      return new Response(null, { status: 200, headers })
    }
    const headers = new Headers(init?.headers as HeadersInit | undefined)
    const range = headers.get('Range')
    const match = range ? /bytes=(\d+)-(\d+)/.exec(range) : null
    if (match) {
      const start = Number(match[1])
      const end = Number(match[2])
      const partIndex = Math.floor(start / partSize)
      if (opts.failPart === partIndex) {
        return new Response(null, { status: 500 })
      }
      const status = opts.rangeStatus ?? 206
      if (status !== 206) {
        // A mirror that ignores Range answers 200 with the whole file.
        return new Response(file as unknown as BodyInit, { status })
      }
      const slice = file.slice(start, end + 1)
      return new Response(slice as unknown as BodyInit, {
        status: 206,
        headers: { 'content-range': `bytes ${start}-${end}/${file.byteLength}` },
      })
    }
    return new Response(file as unknown as BodyInit, { status: 200 })
  })
  const rangeCalls = () =>
    calls.filter((c) => new Headers(c.init?.headers as HeadersInit | undefined).get('Range'))
  const plainGets = () =>
    calls.filter(
      (c) =>
        (c.init?.method ?? 'GET').toUpperCase() === 'GET' &&
        !new Headers(c.init?.headers as HeadersInit | undefined).get('Range'),
    )
  return { fetchFn, calls, rangeCalls, plainGets }
}

describe('fetchSetResponseChunked (batch 5, item D)', () => {
  it('assembles 4 concurrent Range parts in order with real progress', async () => {
    const total = CHUNKED_MIN_BYTES
    const file = virtualFile(total)
    const { fetchFn, rangeCalls, plainGets } = makeFetch(file)
    const progress: number[] = []
    const totals: Array<number | null> = []

    const { fetched } = await fetchSetResponseChunked(REQUEST, {
      fetchFn: fetchFn as unknown as typeof fetch,
      onProgress: (received, totalBytes) => {
        progress.push(received)
        totals.push(totalBytes)
      },
    })

    expect(fetched?.chunked).toBe(true)
    expect(fetched?.mirrorId).toBe('beatconnect')
    const buf = new Uint8Array(await fetched!.response.arrayBuffer())
    expect(buf).toEqual(file)
    // Exactly the 4 Range requests, no plain GET.
    expect(rangeCalls()).toHaveLength(CHUNK_CONNECTIONS)
    expect(plainGets()).toHaveLength(0)
    // Range headers cover the whole file exactly once, in order.
    const spans = rangeCalls().map((c) => {
      const m = /bytes=(\d+)-(\d+)/.exec(
        new Headers(c.init?.headers as HeadersInit | undefined).get('Range') ?? '',
      )!
      return [Number(m[1]), Number(m[2])]
    })
    expect(spans[0]![0]).toBe(0)
    expect(spans[spans.length - 1]![1]).toBe(total - 1)
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i]![0]).toBe(spans[i - 1]![1] + 1)
    }
    // Progress is real bytes: monotonic, capped at total, ends at total.
    expect(progress.length).toBeGreaterThan(0)
    expect(progress[progress.length - 1]).toBe(total)
    expect(progress.every((p) => p <= total)).toBe(true)
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1])
    }
    expect(totals.every((t) => t === total)).toBe(true)
  })

  it('falls back to single-stream when ranges are not advertised', async () => {
    const file = virtualFile(CHUNKED_MIN_BYTES)
    const { fetchFn, rangeCalls, plainGets } = makeFetch(file, { acceptRanges: false })

    const { fetched } = await fetchSetResponseChunked(REQUEST, {
      fetchFn: fetchFn as unknown as typeof fetch,
    })

    expect(fetched?.chunked).toBe(false)
    expect(rangeCalls()).toHaveLength(0)
    expect(plainGets()).toHaveLength(1)
    expect(hashBytes(new Uint8Array(await fetched!.response.arrayBuffer()))).toBe(hashBytes(file))
  })

  it('falls back to single-stream when the HEAD probe is blocked (CORS)', async () => {
    const file = virtualFile(CHUNKED_MIN_BYTES)
    const { fetchFn, rangeCalls, plainGets } = makeFetch(file, { headThrows: true })

    const { fetched } = await fetchSetResponseChunked(REQUEST, {
      fetchFn: fetchFn as unknown as typeof fetch,
    })

    expect(fetched?.chunked).toBe(false)
    expect(rangeCalls()).toHaveLength(0)
    expect(plainGets()).toHaveLength(1)
    expect(hashBytes(new Uint8Array(await fetched!.response.arrayBuffer()))).toBe(hashBytes(file))
  })

  it('falls back to single-stream when a Range part fails', async () => {
    const file = virtualFile(CHUNKED_MIN_BYTES)
    const { fetchFn, rangeCalls, plainGets } = makeFetch(file, { failPart: 1 })

    const { fetched } = await fetchSetResponseChunked(REQUEST, {
      fetchFn: fetchFn as unknown as typeof fetch,
    })

    expect(fetched?.chunked).toBe(false)
    // The failed part's Range request happened, then a plain GET saved it.
    expect(rangeCalls().length).toBeGreaterThan(0)
    expect(plainGets()).toHaveLength(1)
    expect(hashBytes(new Uint8Array(await fetched!.response.arrayBuffer()))).toBe(hashBytes(file))
  })

  it('falls back to single-stream when the mirror ignores Range (200)', async () => {
    const file = virtualFile(CHUNKED_MIN_BYTES)
    const { fetchFn, plainGets } = makeFetch(file, { rangeStatus: 200 })

    const { fetched } = await fetchSetResponseChunked(REQUEST, {
      fetchFn: fetchFn as unknown as typeof fetch,
    })

    expect(fetched?.chunked).toBe(false)
    expect(plainGets()).toHaveLength(1)
    expect(hashBytes(new Uint8Array(await fetched!.response.arrayBuffer()))).toBe(hashBytes(file))
  })

  it('falls back to single-stream for files below the chunking floor', async () => {
    const file = virtualFile(1024)
    const { fetchFn, rangeCalls, plainGets } = makeFetch(file)

    const { fetched } = await fetchSetResponseChunked(REQUEST, {
      fetchFn: fetchFn as unknown as typeof fetch,
    })

    expect(fetched?.chunked).toBe(false)
    expect(rangeCalls()).toHaveLength(0)
    expect(plainGets()).toHaveLength(1)
    expect(hashBytes(new Uint8Array(await fetched!.response.arrayBuffer()))).toBe(hashBytes(file))
  })

  it('falls back to single-stream when no content-length is advertised', async () => {
    const file = virtualFile(CHUNKED_MIN_BYTES)
    const { fetchFn, rangeCalls, plainGets } = makeFetch(file, { contentLength: false })

    const { fetched } = await fetchSetResponseChunked(REQUEST, {
      fetchFn: fetchFn as unknown as typeof fetch,
    })

    expect(fetched?.chunked).toBe(false)
    expect(rangeCalls()).toHaveLength(0)
    expect(plainGets()).toHaveLength(1)
  })
})
