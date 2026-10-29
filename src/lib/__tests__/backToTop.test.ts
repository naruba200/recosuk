import { describe, expect, it } from 'vitest'
import { BACK_TO_TOP_THRESHOLD, shouldShowBackToTop } from '../../components/BackToTop'

describe('shouldShowBackToTop (§AE)', () => {
  it('uses a 600px threshold', () => {
    expect(BACK_TO_TOP_THRESHOLD).toBe(600)
  })

  it('hidden at and below the threshold', () => {
    expect(shouldShowBackToTop(0)).toBe(false)
    expect(shouldShowBackToTop(600)).toBe(false)
  })

  it('shown just past the threshold', () => {
    expect(shouldShowBackToTop(601)).toBe(true)
    expect(shouldShowBackToTop(4000)).toBe(true)
  })

  it('honours a custom threshold', () => {
    expect(shouldShowBackToTop(100, 200)).toBe(false)
    expect(shouldShowBackToTop(201, 200)).toBe(true)
  })
})
