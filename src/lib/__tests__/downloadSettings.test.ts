import { describe, expect, it, beforeEach } from 'vitest'
import {
  getAutoCopy,
  getMirrorPriority,
  getNoVideo,
  MIRROR_PRIORITY_DEFAULT,
  useDownloadSettings,
} from '../downloadSettings'

describe('downloadSettings defaults (QA batch 2)', () => {
  beforeEach(() => {
    const s = useDownloadSettings.getState()
    s.setNoVideo(false)
    s.setAutoCopy(false)
    s.setSongsFolderName(null)
    s.setMirrorPriority(MIRROR_PRIORITY_DEFAULT)
  })

  it('defaults both download switches OFF and no folder name', () => {
    expect(getNoVideo()).toBe(false)
    expect(getAutoCopy()).toBe(false)
    expect(useDownloadSettings.getState().songsFolderName).toBeNull()
    expect(useDownloadSettings.getState().noVideo).toBe(false)
    expect(useDownloadSettings.getState().autoCopy).toBe(false)
  })

  it('toggles update state and the accessors', () => {
    const s = useDownloadSettings.getState()
    s.setNoVideo(true)
    s.setAutoCopy(true)
    s.setSongsFolderName('Songs')
    expect(getNoVideo()).toBe(true)
    expect(getAutoCopy()).toBe(true)
    expect(useDownloadSettings.getState().songsFolderName).toBe('Songs')
  })

  it('defaults the mirror priority to balanced and persists the choice', () => {
    expect(useDownloadSettings.getState().mirrorPriority).toBe('balanced')
    expect(getMirrorPriority()).toBe('balanced')
    useDownloadSettings.getState().setMirrorPriority('nerinyan')
    expect(getMirrorPriority()).toBe('nerinyan')
    // Persisted in the same localStorage key as the other
    // download switches (guests included, no migration).
    const raw = globalThis.localStorage?.getItem('recosuk-download-settings')
    expect(raw).toContain('"mirrorPriority":"nerinyan"')
  })
})
