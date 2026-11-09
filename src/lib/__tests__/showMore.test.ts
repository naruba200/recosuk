import { describe, expect, it } from 'vitest'
import {
  hasMoreToShow,
  nextVisibleCount,
  RECENT_PLAYS_PAGE_SIZE,
  TOP_PLAYS_PAGE_SIZE,
} from '../showMore'

describe('nextVisibleCount (§AQ items 6–7)', () => {
  it('advances by one step', () => {
    expect(nextVisibleCount(15, 100, 15)).toBe(30)
    expect(nextVisibleCount(24, 100, 24)).toBe(48)
  })

  it('caps at the total instead of overshooting', () => {
    expect(nextVisibleCount(90, 100, 15)).toBe(100)
    expect(nextVisibleCount(95, 100, 24)).toBe(100)
  })

  it('never moves past the end or below zero', () => {
    expect(nextVisibleCount(100, 100, 15)).toBe(100)
    expect(nextVisibleCount(0, 0, 15)).toBe(0)
    expect(nextVisibleCount(-5, 10, 15)).toBe(10)
  })
})

describe('hasMoreToShow (§AQ items 6–7)', () => {
  it('is true while rows remain hidden', () => {
    expect(hasMoreToShow(15, 100)).toBe(true)
    expect(hasMoreToShow(24, 25)).toBe(true)
  })

  it('is false once everything is shown', () => {
    expect(hasMoreToShow(100, 100)).toBe(false)
    expect(hasMoreToShow(15, 15)).toBe(false)
    expect(hasMoreToShow(0, 0)).toBe(false)
  })
})

describe('page sizes (§AQ items 6–7)', () => {
  it('recent plays reveal 24 at a time, top plays 15', () => {
    expect(RECENT_PLAYS_PAGE_SIZE).toBe(24)
    expect(TOP_PLAYS_PAGE_SIZE).toBe(15)
  })
})
