import { describe, expect, it } from 'vitest'
import { tierCapabilities } from '../capabilities'

describe('tierCapabilities', () => {
  it('account tier can do everything', () => {
    const caps = tierCapabilities('account')
    expect(caps).toEqual({
      canSave: true,
      canCreateLists: true,
      canRate: true,
      canLearn: true,
      canSnapshotHistory: true,
      canDownload: true,
      canPreview: true,
    })
  })

  it('guest tier: preview + download only, save/lists/rate locked', () => {
    const caps = tierCapabilities('guest')
    expect(caps.canSave).toBe(false)
    expect(caps.canCreateLists).toBe(false)
    expect(caps.canRate).toBe(false)
    expect(caps.canLearn).toBe(false)
    expect(caps.canSnapshotHistory).toBe(false)
    expect(caps.canPreview).toBe(true)
    expect(caps.canDownload).toBe(true)
  })

  it('none tier: no account features, mirror preview/download only', () => {
    const caps = tierCapabilities('none')
    expect(caps.canSave).toBe(false)
    expect(caps.canCreateLists).toBe(false)
    expect(caps.canRate).toBe(false)
    expect(caps.canLearn).toBe(false)
    expect(caps.canSnapshotHistory).toBe(false)
    expect(caps.canPreview).toBe(true)
    expect(caps.canDownload).toBe(true)
  })
})
