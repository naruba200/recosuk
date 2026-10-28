import { describe, expect, it, vi } from 'vitest'
import { createDownloadManager } from '../downloadManager'

const REQ = {
  beatmapsetId: 42,
  seenKeyValue: 'recosuk-seen:guest:tester',
}

/**
 * Deliberate design reversal (QA batch, 2026-10-28): the previous
 * fetch+stream+Blob implementation was abysmally slow, so the download
 * path now hands the mirror URL to the browser's native downloader via
 * a hidden iframe. These tests pin the NEW behaviour — in particular,
 * the download path must never call fetch().
 */
describe('downloadManager (native browser downloads)', () => {
  it('hands the first mirror URL to the browser and records the download', () => {
    const startBrowserDownload = vi.fn()
    const record = vi.fn()
    const manager = createDownloadManager({ startBrowserDownload, record })

    const result = manager.startDownload(REQ)

    expect(result).toEqual({ status: 'started', mirrorId: 'beatconnect' })
    expect(startBrowserDownload).toHaveBeenCalledTimes(1)
    expect(startBrowserDownload).toHaveBeenCalledWith('https://beatconnect.io/b/42')
    expect(record).toHaveBeenCalledWith(REQ.seenKeyValue, 42, 'beatconnect')
  })

  it('uses the explicitly picked mirror', () => {
    const startBrowserDownload = vi.fn()
    const manager = createDownloadManager({ startBrowserDownload, record: vi.fn() })

    const result = manager.startDownload({ ...REQ, mirrorId: 'sayobot' })

    expect(result).toEqual({ status: 'started', mirrorId: 'sayobot' })
    expect(startBrowserDownload).toHaveBeenCalledWith(
      'https://txy1.sayobot.cn/beatmaps/download/full/42',
    )
  })

  it('never calls fetch — the browser downloader does the fetching', () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('fetch must not be called from the download path')
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    try {
      const manager = createDownloadManager({
        startBrowserDownload: vi.fn(),
        record: vi.fn(),
      })
      const result = manager.startDownload(REQ)
      expect(result.status).toBe('started')
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('throws for an unknown mirror id instead of downloading the wrong file', () => {
    const manager = createDownloadManager({
      startBrowserDownload: vi.fn(),
      record: vi.fn(),
    })
    expect(() => manager.startDownload({ ...REQ, mirrorId: 'nope' })).toThrow(
      'Unknown mirror: nope',
    )
  })
})
