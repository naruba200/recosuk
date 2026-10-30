import { describe, expect, it, vi } from 'vitest'
import {
  downloadSetViaFetch,
  FetchDownloadError,
  parseContentDispositionFilename,
} from '../fetchDownload'

/** Minimal valid .osz bytes: PK zip magic + payload. */
const OSZ = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4])
const GARBAGE = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3, 4])

function oszResponse(opts?: {
  status?: number
  contentType?: string
  contentLength?: number | null
  disposition?: string
  body?: Uint8Array<ArrayBuffer>
}): Response {
  const headers = new Headers()
  if (opts?.contentType !== undefined) headers.set('Content-Type', opts.contentType)
  else headers.set('Content-Type', 'application/octet-stream')
  if (opts?.contentLength !== undefined && opts.contentLength !== null) {
    headers.set('Content-Length', String(opts.contentLength))
  }
  if (opts?.disposition) headers.set('Content-Disposition', opts.disposition)
  return new Response(opts?.body ?? OSZ, {
    status: opts?.status ?? 200,
    headers,
  })
}

const REQ = { mirrorId: 'hinai', beatmapsetId: 42, url: 'https://mirror.hinamizawa.ai/api/v1/hinai/d/42' }

describe('parseContentDispositionFilename', () => {
  it('parses a quoted filename', () => {
    expect(
      parseContentDispositionFilename('attachment; filename="1 Kenji Ninuma - DISCO PRINCE.osz"'),
    ).toBe('1 Kenji Ninuma - DISCO PRINCE.osz')
  })

  it('prefers the UTF-8 extended form and decodes it', () => {
    expect(
      parseContentDispositionFilename(
        "attachment; filename=\"1%20Kenji.osz\"; filename*=utf-8''1%20Kenji%20Ninuma%20%2D%20DISCO%20PRINCE.osz",
      ),
    ).toBe('1 Kenji Ninuma - DISCO PRINCE.osz')
  })

  it('strips path separators so the name can never escape the folder', () => {
    expect(parseContentDispositionFilename('attachment; filename="../../evil.osz"')).toBe('evil.osz')
  })

  it('returns null when there is no filename', () => {
    expect(parseContentDispositionFilename(null)).toBeNull()
    expect(parseContentDispositionFilename('attachment')).toBeNull()
  })
})

describe('downloadSetViaFetch', () => {
  it('saves a valid .osz, reports real bytes + filename, and emits progress with a total', async () => {
    const saveFile = vi.fn()
    const progress: { received: number; total: number | null }[] = []
    const fetchFn = vi.fn(async () => oszResponse({
      contentLength: OSZ.length,
      disposition: 'attachment; filename="1 Kenji Ninuma - DISCO PRINCE.osz"',
    }))

    const result = await downloadSetViaFetch(REQ, {
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile,
      onProgress: (p) => progress.push(p),
      progressIntervalMs: 0,
    })

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn).toHaveBeenCalledWith(REQ.url, expect.objectContaining({ signal: undefined }))
    expect(result.mirrorId).toBe('hinai')
    expect(result.filename).toBe('1 Kenji Ninuma - DISCO PRINCE.osz')
    expect(result.bytes).toBe(OSZ.length)
    expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(OSZ)
    expect(saveFile).toHaveBeenCalledTimes(1)
    const [savedBlob, savedName] = saveFile.mock.calls[0] as unknown as [Blob, string]
    expect(savedName).toBe('1 Kenji Ninuma - DISCO PRINCE.osz')
    expect(new Uint8Array(await savedBlob.arrayBuffer())).toEqual(OSZ)
    expect(progress.length).toBeGreaterThan(0)
    expect(progress[progress.length - 1]).toEqual({ received: OSZ.length, total: OSZ.length })
  })

  it('falls back to {id}.osz when the response carries no filename', async () => {
    const saveFile = vi.fn()
    const fetchFn = vi.fn(async () => oszResponse({ contentLength: OSZ.length }))

    const result = await downloadSetViaFetch(REQ, {
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile,
    })

    expect(result.filename).toBe('42.osz')
    expect(saveFile).toHaveBeenCalledWith(expect.any(Blob), '42.osz')
  })

  it('reports an indeterminate total when Content-Length is absent — never a faked percentage', async () => {
    const progress: { received: number; total: number | null }[] = []
    const fetchFn = vi.fn(async () => oszResponse({ contentLength: null }))

    const result = await downloadSetViaFetch(REQ, {
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile: vi.fn(),
      onProgress: (p) => progress.push(p),
      progressIntervalMs: 0,
    })

    expect(result.bytes).toBe(OSZ.length)
    expect(progress.length).toBeGreaterThan(0)
    for (const p of progress) expect(p.total).toBeNull()
    expect(progress[progress.length - 1]?.received).toBe(OSZ.length)
  })

  it('throws with the HTTP status on a non-2xx response and never saves', async () => {
    const saveFile = vi.fn()
    const fetchFn = vi.fn(async () => oszResponse({ status: 503 }))

    await expect(
      downloadSetViaFetch(REQ, { fetchFn: fetchFn as unknown as typeof fetch, saveFile }),
    ).rejects.toMatchObject({ name: 'FetchDownloadError', status: 503 })
    expect(saveFile).not.toHaveBeenCalled()
  })

  it('rejects a 200 HTML page as not-a-beatmap-file', async () => {
    const saveFile = vi.fn()
    const fetchFn = vi.fn(async () =>
      oszResponse({ contentType: 'text/html; charset=UTF-8', body: new TextEncoder().encode('<html>rate limited</html>') }),
    )

    await expect(
      downloadSetViaFetch(REQ, { fetchFn: fetchFn as unknown as typeof fetch, saveFile }),
    ).rejects.toThrow('answered with text/html')
    expect(saveFile).not.toHaveBeenCalled()
  })

  it('rejects a 200 octet-stream whose bytes are not a zip', async () => {
    const saveFile = vi.fn()
    const fetchFn = vi.fn(async () => oszResponse({ body: GARBAGE }))

    await expect(
      downloadSetViaFetch(REQ, { fetchFn: fetchFn as unknown as typeof fetch, saveFile }),
    ).rejects.toThrow('did not return a beatmap file')
    expect(saveFile).not.toHaveBeenCalled()
  })

  it('rejects an empty response', async () => {
    const saveFile = vi.fn()
    const fetchFn = vi.fn(async () => oszResponse({ body: new Uint8Array(0), contentLength: 0 }))

    await expect(
      downloadSetViaFetch(REQ, { fetchFn: fetchFn as unknown as typeof fetch, saveFile }),
    ).rejects.toThrow('empty file')
    expect(saveFile).not.toHaveBeenCalled()
  })

  it('a save failure is a fatal FetchDownloadError (no next-mirror retry)', async () => {
    const fetchFn = vi.fn(async () => oszResponse({ contentLength: OSZ.length }))
    const saveFile = vi.fn(() => {
      throw new Error('no document')
    })

    const err = await downloadSetViaFetch(REQ, {
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile,
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(FetchDownloadError)
    expect((err as FetchDownloadError).fatal).toBe(true)
  })

  it('an abort passes through as AbortError (the caller tells superseded apart from failed)', async () => {
    const controller = new AbortController()
    const fetchFn = vi.fn((_url: string, init?: RequestInit) => {
      // A fetch that only settles when aborted.
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('aborted')
          err.name = 'AbortError'
          reject(err)
        })
      })
    })
    const promise = downloadSetViaFetch(REQ, {
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile: vi.fn(),
      signal: controller.signal,
    })
    controller.abort()
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('validates a non-streaming body via arrayBuffer', async () => {
    const saveFile = vi.fn()
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      body: null,
      headers: new Headers({ 'Content-Type': 'application/octet-stream' }),
      arrayBuffer: async () => OSZ.buffer,
    }) as unknown as Response)

    const result = await downloadSetViaFetch(REQ, {
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile,
    })
    expect(result.bytes).toBe(OSZ.length)
    expect(saveFile).toHaveBeenCalledTimes(1)
  })

  it('counts real bytes across streamed chunks', async () => {
    const progress: { received: number; total: number | null }[] = []
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(OSZ.subarray(0, 4))
        c.enqueue(OSZ.subarray(4))
        c.close()
      },
    })
    const fetchFn = vi.fn(async () => new Response(stream, {
      status: 200,
      headers: new Headers({
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(OSZ.length),
      }),
    }))

    const result = await downloadSetViaFetch(REQ, {
      fetchFn: fetchFn as unknown as typeof fetch,
      saveFile: vi.fn(),
      onProgress: (p) => progress.push(p),
      progressIntervalMs: 0,
    })
    expect(result.bytes).toBe(OSZ.length)
    expect(progress[progress.length - 1]).toEqual({ received: OSZ.length, total: OSZ.length })
    // Every chunk was counted (no throttle with interval 0).
    expect(progress.map((p) => p.received)).toContain(4)
  })
})
