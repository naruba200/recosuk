import { describe, expect, it } from 'vitest'
import {
  BACK_TO_TOP_THRESHOLD,
  backToTopPositionClass,
  shouldShowBackToTop,
} from '../../components/BackToTop'

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

describe('backToTopPositionClass (§AN)', () => {
  it('left placement is the plain 16px gutter (§AQ item 12: the sidebar is gone)', () => {
    expect(backToTopPositionClass('left', false, false, false)).toBe('left-4 bottom-4')
    expect(backToTopPositionClass('left', true, false, false)).toBe(
      'left-4 bottom-[112px]',
    )
    // The dock never moves the left placement.
    expect(backToTopPositionClass('left', false, true, false)).toBe('left-4 bottom-4')
    expect(backToTopPositionClass('left', true, false, true)).toBe(
      'left-4 bottom-[112px]',
    )
  })

  it('right placement sits at the base when the dock is empty', () => {
    expect(backToTopPositionClass('right', false, false, false)).toBe('right-4 bottom-4')
    expect(backToTopPositionClass('right', true, false, false)).toBe('right-4 bottom-[112px]')
  })

  it('right placement stacks above the open dock window (~259px + 16px gap)', () => {
    expect(backToTopPositionClass('right', false, true, false)).toBe('right-4 bottom-[292px]')
    expect(backToTopPositionClass('right', true, true, false)).toBe('right-4 bottom-[388px]')
  })

  it('right placement stacks above the reopen button (44px + 16px gap)', () => {
    expect(backToTopPositionClass('right', false, false, true)).toBe('right-4 bottom-[76px]')
    expect(backToTopPositionClass('right', true, false, true)).toBe('right-4 bottom-[172px]')
  })

  it('the open window wins over the reopen button', () => {
    expect(backToTopPositionClass('right', false, true, true)).toBe('right-4 bottom-[292px]')
  })
})
