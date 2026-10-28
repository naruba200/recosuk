import { describe, expect, it, beforeEach } from 'vitest'
import { getAutoCopy, getNoVideo, useDownloadSettings } from '../downloadSettings'

describe('downloadSettings defaults (QA batch 2)', () => {
  beforeEach(() => {
    const s = useDownloadSettings.getState()
    s.setNoVideo(false)
    s.setAutoCopy(false)
    s.setSongsFolderName(null)
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
})
