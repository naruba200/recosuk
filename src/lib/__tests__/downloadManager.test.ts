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

    expect(result).toEqual({ status: 'started', mirrorId: 'beatconnect', noVideoApplied: false })
    expect(startBrowserDownload).toHaveBeenCalledTimes(1)
    expect(startBrowserDownload).toHaveBeenCalledWith('https://beatconnect.io/b/42')
    expect(record).toHaveBeenCalledWith(REQ.seenKeyValue, 42, 'beatconnect')
  })

  it('uses the explicitly picked mirror', () => {
    const startBrowserDownload = vi.fn()
    const manager = createDownloadManager({ startBrowserDownload, record: vi.fn() })

    const result = manager.startDownload({ ...REQ, mirrorId: 'sayobot' })

    expect(result).toEqual({ status: 'started', mirrorId: 'sayobot', noVideoApplied: false })
    expect(startBrowserDownload).toHaveBeenCalledWith(
      'https://txy1.sayobot.cn/beatmaps/download/full/42',
    )
  })

  // No-video (QA batch 2): Auto goes to catboy first and uses its
  // verified `{id}n` form; an explicit non-catboy pick keeps the full
  // file and reports noVideoApplied: false honestly.
  it('with noVideo, Auto uses catboy first with the no-video suffix', () => {
    const startBrowserDownload = vi.fn()
    const manager = createDownloadManager({ startBrowserDownload, record: vi.fn() })

    const result = manager.startDownload({ ...REQ, noVideo: true })

    expect(result).toEqual({ status: 'started', mirrorId: 'catboy', noVideoApplied: true })
    expect(startBrowserDownload).toHaveBeenCalledWith('https://catboy.best/d/42n')
  })

  it('with noVideo, an explicit beatconnect pick serves the full file', () => {
    const startBrowserDownload = vi.fn()
    const manager = createDownloadManager({ startBrowserDownload, record: vi.fn() })

    const result = manager.startDownload({ ...REQ, mirrorId: 'beatconnect', noVideo: true })

    expect(result).toEqual({ status: 'started', mirrorId: 'beatconnect', noVideoApplied: false })
    expect(startBrowserDownload).toHaveBeenCalledWith('https://beatconnect.io/b/42')
  })

  it('with noVideo, an explicit catboy pick uses the no-video suffix', () => {
    const startBrowserDownload = vi.fn()
    const manager = createDownloadManager({ startBrowserDownload, record: vi.fn() })

    const result = manager.startDownload({ ...REQ, mirrorId: 'catboy', noVideo: true })

    expect(result).toEqual({ status: 'started', mirrorId: 'catboy', noVideoApplied: true })
    expect(startBrowserDownload).toHaveBeenCalledWith('https://catboy.best/d/42n')
  })

  // hinai (batch AH): an explicit hinai pick hands off the streaming
  // endpoint in-page, and with noVideo on it uses the verified
  // ?noVideo=1 form and reports noVideoApplied: true honestly.
  it('uses the explicitly picked hinai streaming endpoint', () => {
    const startBrowserDownload = vi.fn()
    const manager = createDownloadManager({ startBrowserDownload, record: vi.fn() })

    const result = manager.startDownload({ ...REQ, mirrorId: 'hinai' })

    expect(result).toEqual({ status: 'started', mirrorId: 'hinai', noVideoApplied: false })
    expect(startBrowserDownload).toHaveBeenCalledWith(
      'https://mirror.hinamizawa.ai/api/v1/hinai/d/42',
    )
  })

  it('with noVideo, an explicit hinai pick uses ?noVideo=1', () => {
    const startBrowserDownload = vi.fn()
    const manager = createDownloadManager({ startBrowserDownload, record: vi.fn() })

    const result = manager.startDownload({ ...REQ, mirrorId: 'hinai', noVideo: true })

    expect(result).toEqual({ status: 'started', mirrorId: 'hinai', noVideoApplied: true })
    expect(startBrowserDownload).toHaveBeenCalledWith(
      'https://mirror.hinamizawa.ai/api/v1/hinai/d/42?noVideo=1',
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

  it('an explicit official pick throws instead of using the iframe handoff (batch 14: tab-only)', () => {
    const startBrowserDownload = vi.fn()
    const manager = createDownloadManager({ startBrowserDownload, record: vi.fn() })

    expect(() => manager.startDownload({ ...REQ, mirrorId: 'official' })).toThrow(
      'must open in a new tab',
    )
    expect(startBrowserDownload).not.toHaveBeenCalled()
  })

  it('an explicit official pick with noVideo also throws (the ?noVideo=1 URL is built by mirrors.ts, opened by the queue)', () => {
    const startBrowserDownload = vi.fn()
    const manager = createDownloadManager({ startBrowserDownload, record: vi.fn() })

    expect(() =>
      manager.startDownload({ ...REQ, mirrorId: 'official', noVideo: true }),
    ).toThrow('must open in a new tab')
    expect(startBrowserDownload).not.toHaveBeenCalled()
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
