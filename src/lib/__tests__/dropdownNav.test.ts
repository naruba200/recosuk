import { describe, expect, it } from 'vitest'
import { initialActiveIndex, moveActiveIndex } from '../dropdownNav'

/**
 * Pure keyboard-navigation helpers for the custom listbox
 * dropdown (MenuSelect, batch 12). The component itself cannot be
 * render-tested: the suite runs under the node environment with
 * no DOM/testing library installed.
 */
describe('moveActiveIndex', () => {
  it('moves down and up within the list', () => {
    expect(moveActiveIndex(0, 'ArrowDown', 4)).toBe(1)
    expect(moveActiveIndex(2, 'ArrowDown', 4)).toBe(3)
    expect(moveActiveIndex(2, 'ArrowUp', 4)).toBe(1)
  })

  it('wraps around both ends', () => {
    expect(moveActiveIndex(3, 'ArrowDown', 4)).toBe(0)
    expect(moveActiveIndex(0, 'ArrowUp', 4)).toBe(3)
  })

  it('lands on the first/last option from no active index', () => {
    expect(moveActiveIndex(null, 'ArrowDown', 4)).toBe(0)
    expect(moveActiveIndex(null, 'ArrowUp', 4)).toBe(3)
    expect(moveActiveIndex(null, 'Home', 4)).toBe(0)
    expect(moveActiveIndex(null, 'End', 4)).toBe(3)
  })

  it('Home/End jump regardless of the current index', () => {
    expect(moveActiveIndex(2, 'Home', 4)).toBe(0)
    expect(moveActiveIndex(1, 'End', 4)).toBe(3)
  })

  it('returns -1 for an empty list', () => {
    expect(moveActiveIndex(0, 'ArrowDown', 0)).toBe(-1)
    expect(moveActiveIndex(null, 'ArrowDown', 0)).toBe(-1)
  })
})

describe('initialActiveIndex', () => {
  it('prefers the selected option', () => {
    expect(initialActiveIndex(2, 4)).toBe(2)
  })

  it('falls back to the first option when the selection is out of range', () => {
    expect(initialActiveIndex(-1, 4)).toBe(0)
    expect(initialActiveIndex(9, 4)).toBe(0)
  })

  it('returns -1 for an empty list', () => {
    expect(initialActiveIndex(0, 0)).toBe(-1)
  })
})
