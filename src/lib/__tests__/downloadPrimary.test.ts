import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { resolvePrimaryDownload } from '../downloadManager'
import { MIRROR_PRIORITY_DEFAULT, useDownloadSettings } from '../downloadSettings'

/**
 * §AF — Recommendations download priority (user decision
 * 2026-10-30): the main Download button in Recommendations
 * (Batches + Unlimited) uses the native Auto path instead of
 * opening the osu! tab. The decision lives in the pure helper
 * resolvePrimaryDownload: it never hardcodes a mirror — the
 * Auto first mirror is order[0] of resolveNativeMirrorOrder,
 * so the Mirror Route Priority setting and the no-video rule
 * drive it exactly as they drive every other Auto download.
 * Other views keep the default 'official' primary.
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

describe('resolvePrimaryDownload', () => {
  it('defaults to official with the official mirror id', () => {
    expect(resolvePrimaryDownload('official', false)).toEqual({
      kind: 'official',
      mirrorId: 'official',
    })
    expect(resolvePrimaryDownload('official', true)).toEqual({
      kind: 'official',
      mirrorId: 'official',
    })
  })

  it('auto with default settings resolves to BeatConnect first', () => {
    expect(resolvePrimaryDownload('auto', false)).toEqual({
      kind: 'auto',
      mirrorId: 'beatconnect',
    })
  })

  it('auto follows a custom Mirror Route Priority', () => {
    setPriority('catboy')
    expect(resolvePrimaryDownload('auto', false)).toEqual({
      kind: 'auto',
      mirrorId: 'catboy',
    })
    setPriority('sayobot')
    expect(resolvePrimaryDownload('auto', false)).toEqual({
      kind: 'auto',
      mirrorId: 'sayobot',
    })
    // hinai (batch AH) is a valid priority pick.
    setPriority('hinai')
    expect(resolvePrimaryDownload('auto', false)).toEqual({
      kind: 'auto',
      mirrorId: 'hinai',
    })
  })

  it('auto with no-video on and no custom priority resolves to catboy first', () => {
    expect(resolvePrimaryDownload('auto', true)).toEqual({
      kind: 'auto',
      mirrorId: 'catboy',
    })
  })

  it('auto with no-video on lets a custom priority win over catboy-first', () => {
    setPriority('nerinyan')
    expect(resolvePrimaryDownload('auto', true)).toEqual({
      kind: 'auto',
      mirrorId: 'nerinyan',
    })
    setPriority('beatconnect')
    expect(resolvePrimaryDownload('auto', true)).toEqual({
      kind: 'auto',
      mirrorId: 'beatconnect',
    })
  })

  it('auto falls back to the default order for a stale priority value', () => {
    setPriority('direct')
    expect(resolvePrimaryDownload('auto', false)).toEqual({
      kind: 'auto',
      mirrorId: 'beatconnect',
    })
    expect(resolvePrimaryDownload('auto', true)).toEqual({
      kind: 'auto',
      mirrorId: 'catboy',
    })
  })

  it('official ignores the priority and no-video entirely', () => {
    setPriority('sayobot')
    expect(resolvePrimaryDownload('official', false)).toEqual({
      kind: 'official',
      mirrorId: 'official',
    })
    expect(resolvePrimaryDownload('official', true)).toEqual({
      kind: 'official',
      mirrorId: 'official',
    })
  })
})
