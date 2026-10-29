import { describe, expect, it } from 'vitest'
import { applyDownloadedVisibility } from '../recommend'

const item = (beatmapsetId: number) => ({ beatmapsetId })

describe('applyDownloadedVisibility', () => {
  it('hides downloaded sets and preserves the order of the rest', () => {
    const items = [item(1), item(2), item(3), item(4)]
    const { visible, showingDownloadedFallback } = applyDownloadedVisibility(items, [2, 4])
    expect(visible.map((c) => c.beatmapsetId)).toEqual([1, 3])
    expect(showingDownloadedFallback).toBe(false)
  })

  it('leaves the list unchanged when nothing is downloaded', () => {
    const items = [item(1), item(2)]
    const { visible, showingDownloadedFallback } = applyDownloadedVisibility(items, [])
    expect(visible.map((c) => c.beatmapsetId)).toEqual([1, 2])
    expect(showingDownloadedFallback).toBe(false)
  })

  it('ignores downloaded ids that are not in the list', () => {
    const items = [item(1), item(2)]
    const { visible, showingDownloadedFallback } = applyDownloadedVisibility(items, [99])
    expect(visible.map((c) => c.beatmapsetId)).toEqual([1, 2])
    expect(showingDownloadedFallback).toBe(false)
  })

  it('empty input stays empty with no fallback', () => {
    const { visible, showingDownloadedFallback } = applyDownloadedVisibility([], [1, 2])
    expect(visible).toEqual([])
    expect(showingDownloadedFallback).toBe(false)
  })

  it('all downloaded: fallback shows everything again, in order, flagged', () => {
    const items = [item(1), item(2), item(3)]
    const { visible, showingDownloadedFallback } = applyDownloadedVisibility(items, [1, 2, 3])
    expect(visible.map((c) => c.beatmapsetId)).toEqual([1, 2, 3])
    expect(showingDownloadedFallback).toBe(true)
  })

  it('a single downloaded item falls back to showing it again', () => {
    const items = [item(7)]
    const { visible, showingDownloadedFallback } = applyDownloadedVisibility(items, [7])
    expect(visible.map((c) => c.beatmapsetId)).toEqual([7])
    expect(showingDownloadedFallback).toBe(true)
  })

  it('does not mutate the input list', () => {
    const items = [item(1), item(2)]
    applyDownloadedVisibility(items, [1])
    expect(items.map((c) => c.beatmapsetId)).toEqual([1, 2])
  })
})
