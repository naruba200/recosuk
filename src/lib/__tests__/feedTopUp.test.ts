import { describe, expect, it } from 'vitest'
import {
  FEED_TOP_UP_MAX_CONSECUTIVE,
  FEED_TOP_UP_THRESHOLD,
  shouldTopUpFeed,
} from '../recommend'

const base = {
  visibleCount: 3,
  totalCount: 20,
  ended: false,
  loading: false,
  showingFallback: false,
  consecutiveTopUps: 0,
}

describe('shouldTopUpFeed (§AE)', () => {
  it('tops up when the visible list is thin and the feed can continue', () => {
    expect(shouldTopUpFeed(base)).toBe(true)
  })

  it('uses threshold 10 and cap 3', () => {
    expect(FEED_TOP_UP_THRESHOLD).toBe(10)
    expect(FEED_TOP_UP_MAX_CONSECUTIVE).toBe(3)
  })

  it('does not top up at or above the threshold', () => {
    expect(shouldTopUpFeed({ ...base, visibleCount: 10 })).toBe(false)
    expect(shouldTopUpFeed({ ...base, visibleCount: 25 })).toBe(false)
  })

  it('tops up just below the threshold', () => {
    expect(shouldTopUpFeed({ ...base, visibleCount: 9 })).toBe(true)
  })

  it('does not top up when the feed ended', () => {
    expect(shouldTopUpFeed({ ...base, ended: true })).toBe(false)
  })

  it('does not top up while a load is already in flight', () => {
    expect(shouldTopUpFeed({ ...base, loading: true })).toBe(false)
  })

  it('does not top up when the fallback is already showing', () => {
    expect(shouldTopUpFeed({ ...base, showingFallback: true })).toBe(false)
  })

  it('does not top up before the first load', () => {
    expect(shouldTopUpFeed({ ...base, totalCount: 0, visibleCount: 0 })).toBe(false)
  })

  it('stops at the consecutive cap so an all-hidden remainder cannot loop', () => {
    expect(shouldTopUpFeed({ ...base, consecutiveTopUps: 2 })).toBe(true)
    expect(shouldTopUpFeed({ ...base, consecutiveTopUps: 3 })).toBe(false)
    expect(shouldTopUpFeed({ ...base, consecutiveTopUps: 99 })).toBe(false)
  })
})
