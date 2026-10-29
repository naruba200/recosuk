import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  createDownloadManager,
  resolveDisplayMirrorOrder,
  resolveNativeMirrorOrder,
  NATIVE_MIRROR_ORDER,
  NATIVE_MIRROR_ORDER_NO_VIDEO,
} from '../downloadManager'
import { displayOrderFor, nextRetryMirrorId } from '../downloadQueue'
import { mirrorAttemptUrls } from '../songCopy'
import {
  MIRROR_PRIORITY_DEFAULT,
  useDownloadSettings,
} from '../downloadSettings'

/**
 * Mirror Route Priority wiring: the Settings control persists one
 * choice (localStorage, via the download settings store) and the
 * resolved order drives Auto downloads, the picker, the dock
 * Retry cycle, and the Songs-folder copy fetch order. Official
 * stays pinned first in display and never enters the native
 * order.
 */

function setPriority(priority: string): void {
  useDownloadSettings.setState({ mirrorPriority: priority })
}

beforeEach(() => {
  setPriority(MIRROR_PRIORITY_DEFAULT)
})

afterEach(() => {
  setPriority(MIRROR_PRIORITY_DEFAULT)
})

describe('resolveNativeMirrorOrder defaults', () => {
  it('returns the built-in native order when nothing is set', () => {
    expect([...resolveNativeMirrorOrder(false)]).toEqual([...NATIVE_MIRROR_ORDER])
  })

  it('returns the catboy-first no-video default when no-video is on and nothing is set', () => {
    expect([...resolveNativeMirrorOrder(true)]).toEqual([...NATIVE_MIRROR_ORDER_NO_VIDEO])
  })

  it("treats 'balanced' as no custom priority in both cases", () => {
    setPriority('balanced')
    expect([...resolveNativeMirrorOrder(false)]).toEqual(['beatconnect', 'catboy', 'nerinyan', 'sayobot'])
    expect([...resolveNativeMirrorOrder(true)]).toEqual(['catboy', 'beatconnect', 'nerinyan', 'sayobot'])
  })
})

describe('resolveNativeMirrorOrder with a custom priority', () => {
  it('puts the chosen mirror first, keeping the default relative order for the rest', () => {
    setPriority('nerinyan')
    expect([...resolveNativeMirrorOrder(false)]).toEqual([
      'nerinyan',
      'beatconnect',
      'catboy',
      'sayobot',
    ])
    setPriority('sayobot')
    expect([...resolveNativeMirrorOrder(false)]).toEqual([
      'sayobot',
      'beatconnect',
      'catboy',
      'nerinyan',
    ])
    setPriority('catboy')
    expect([...resolveNativeMirrorOrder(false)]).toEqual([
      'catboy',
      'beatconnect',
      'nerinyan',
      'sayobot',
    ])
  })

  it('lets a custom priority win over the catboy-first no-video default', () => {
    setPriority('sayobot')
    expect([...resolveNativeMirrorOrder(true)]).toEqual([
      'sayobot',
      'beatconnect',
      'catboy',
      'nerinyan',
    ])
  })
})

describe('resolveNativeMirrorOrder validation', () => {
  it('falls back to the default order for a stale value (the removed Direct Bancho option)', () => {
    setPriority('direct')
    expect([...resolveNativeMirrorOrder(false)]).toEqual([...NATIVE_MIRROR_ORDER])
    expect([...resolveNativeMirrorOrder(true)]).toEqual([...NATIVE_MIRROR_ORDER_NO_VIDEO])
  })

  it('falls back to the default order for unknown or empty values', () => {
    setPriority('bogus-mirror')
    expect([...resolveNativeMirrorOrder(false)]).toEqual([...NATIVE_MIRROR_ORDER])
    setPriority('')
    expect([...resolveNativeMirrorOrder(true)]).toEqual([...NATIVE_MIRROR_ORDER_NO_VIDEO])
  })

  it('never includes official in the native order', () => {
    setPriority('nerinyan')
    expect(resolveNativeMirrorOrder(false)).not.toContain('official')
    expect(resolveNativeMirrorOrder(true)).not.toContain('official')
  })
})

describe('display order and Retry cycling follow the custom order', () => {
  it('pins official first, then the resolved natives', () => {
    setPriority('sayobot')
    expect([...resolveDisplayMirrorOrder(false)]).toEqual([
      'official',
      'sayobot',
      'beatconnect',
      'catboy',
      'nerinyan',
    ])
    expect([...displayOrderFor(true)]).toEqual([
      'official',
      'sayobot',
      'beatconnect',
      'catboy',
      'nerinyan',
    ])
  })

  it('cycles Retry through the custom order, wrapping back to official', () => {
    setPriority('sayobot')
    const base = { noVideo: false, mirrorIdUsed: null, mirrorId: undefined } as const
    expect(nextRetryMirrorId({ ...base, triedMirrorIds: ['official'] })).toBe('sayobot')
    expect(nextRetryMirrorId({ ...base, triedMirrorIds: ['official', 'sayobot'] })).toBe('beatconnect')
    expect(
      nextRetryMirrorId({
        ...base,
        triedMirrorIds: ['official', 'sayobot', 'beatconnect', 'catboy', 'nerinyan'],
      }),
    ).toBe('official')
  })
})

describe('consumers follow the resolved order', () => {
  it('startDownload Auto uses the chosen mirror first', () => {
    setPriority('nerinyan')
    const startBrowserDownload = vi.fn()
    const manager = createDownloadManager({
      startBrowserDownload,
      record: () => {},
    })
    const result = manager.startDownload({
      beatmapsetId: 42,
      seenKeyValue: 'guest:test',
    })
    expect(result.mirrorId).toBe('nerinyan')
    expect(startBrowserDownload).toHaveBeenCalledWith('https://api.nerinyan.moe/d/42')
  })

  it('startDownload with no-video and a custom priority keeps per-mirror no-video shaping', () => {
    setPriority('sayobot')
    const startBrowserDownload = vi.fn()
    const manager = createDownloadManager({
      startBrowserDownload,
      record: () => {},
    })
    // Sayobot has no verified no-video form: full file, never
    // claimed as no-video, even though no-video is on.
    const result = manager.startDownload({
      beatmapsetId: 42,
      seenKeyValue: 'guest:test',
      noVideo: true,
    })
    expect(result).toEqual({ status: 'started', mirrorId: 'sayobot', noVideoApplied: false })
    expect(startBrowserDownload).toHaveBeenCalledWith(
      'https://txy1.sayobot.cn/beatmaps/download/full/42',
    )
  })

  it('startDownload with no-video and catboy priority uses the {id}n form', () => {
    setPriority('catboy')
    const startBrowserDownload = vi.fn()
    const manager = createDownloadManager({
      startBrowserDownload,
      record: () => {},
    })
    const result = manager.startDownload({
      beatmapsetId: 42,
      seenKeyValue: 'guest:test',
      noVideo: true,
    })
    expect(result).toEqual({ status: 'started', mirrorId: 'catboy', noVideoApplied: true })
    expect(startBrowserDownload).toHaveBeenCalledWith('https://catboy.best/d/42n')
  })

  it('Songs-folder copy fetch order follows the custom priority', () => {
    setPriority('sayobot')
    const attempts = mirrorAttemptUrls({ beatmapsetId: 42, artist: 'A', title: 'T' })
    expect(attempts.map((a) => a.mirrorId)).toEqual([
      'sayobot',
      'beatconnect',
      'catboy',
      'nerinyan',
    ])
    expect(attempts[0].url).toBe('https://txy1.sayobot.cn/beatmaps/download/full/42')
    expect(attempts[1].url).toBe('https://beatconnect.io/b/42')
    expect(attempts[2].url).toBe('https://catboy.best/d/42')
  })

  it('Songs-folder copy with no-video and a custom priority still tries catboy no-video first for catboy', () => {
    setPriority('nerinyan')
    const attempts = mirrorAttemptUrls({
      beatmapsetId: 42,
      artist: 'A',
      title: 'T',
      noVideo: true,
    })
    const catboyAttempts = attempts.filter((a) => a.mirrorId === 'catboy')
    expect(catboyAttempts.map((a) => a.url)).toEqual([
      'https://catboy.best/d/42n',
      'https://catboy.best/d/42',
    ])
    expect(attempts[0].mirrorId).toBe('nerinyan')
  })
})
