import { describe, expect, it } from 'vitest'
import { applySeenVisibility } from '../recommend'

const item = (beatmapsetId: number) => ({ beatmapsetId })

describe('applySeenVisibility', () => {
  it('hides downloaded sets and preserves the order of the rest', () => {
    const items = [item(1), item(2), item(3), item(4)]
    const { visible, showingDownloadedFallback, showingSeenFallback } = applySeenVisibility(
      items,
      [2, 4],
      [],
    )
    expect(visible.map((c) => c.beatmapsetId)).toEqual([1, 3])
    expect(showingDownloadedFallback).toBe(false)
    expect(showingSeenFallback).toBe(false)
  })

  it('hides previously-seen sets (served before the current window)', () => {
    const items = [item(1), item(2), item(3), item(4)]
    const { visible, showingDownloadedFallback, showingSeenFallback } = applySeenVisibility(
      items,
      [],
      [1, 3],
    )
    expect(visible.map((c) => c.beatmapsetId)).toEqual([2, 4])
    expect(showingDownloadedFallback).toBe(false)
    expect(showingSeenFallback).toBe(false)
  })

  it('does not hide the current window’s own items (absent from the snapshot)', () => {
    const items = [item(1), item(2)]
    const { visible } = applySeenVisibility(items, [], [99])
    expect(visible.map((c) => c.beatmapsetId)).toEqual([1, 2])
  })

  it('composes downloaded + previously-seen hiding', () => {
    const items = [item(1), item(2), item(3), item(4), item(5)]
    const { visible, showingDownloadedFallback, showingSeenFallback } = applySeenVisibility(
      items,
      [2],
      [4],
    )
    expect(visible.map((c) => c.beatmapsetId)).toEqual([1, 3, 5])
    expect(showingDownloadedFallback).toBe(false)
    expect(showingSeenFallback).toBe(false)
  })

  it('all downloaded: downloaded fallback only, seen fallback stays off', () => {
    const items = [item(1), item(2), item(3)]
    const { visible, showingDownloadedFallback, showingSeenFallback } = applySeenVisibility(
      items,
      [1, 2, 3],
      [],
    )
    expect(visible.map((c) => c.beatmapsetId)).toEqual([1, 2, 3])
    expect(showingDownloadedFallback).toBe(true)
    expect(showingSeenFallback).toBe(false)
  })

  it('all previously seen: seen fallback only, downloaded fallback stays off', () => {
    const items = [item(1), item(2), item(3)]
    const { visible, showingDownloadedFallback, showingSeenFallback } = applySeenVisibility(
      items,
      [],
      [1, 2, 3],
    )
    expect(visible.map((c) => c.beatmapsetId)).toEqual([1, 2, 3])
    expect(showingDownloadedFallback).toBe(false)
    expect(showingSeenFallback).toBe(true)
  })

  it('mixed all-hidden (some downloaded, some seen): seen fallback, not downloaded', () => {
    const items = [item(1), item(2), item(3)]
    const { visible, showingDownloadedFallback, showingSeenFallback } = applySeenVisibility(
      items,
      [1],
      [2, 3],
    )
    expect(visible.map((c) => c.beatmapsetId)).toEqual([1, 2, 3])
    expect(showingDownloadedFallback).toBe(false)
    expect(showingSeenFallback).toBe(true)
  })

  it('an item both downloaded and seen hides once and keeps the downloaded note when all are downloaded', () => {
    const items = [item(1), item(2)]
    const { visible, showingDownloadedFallback, showingSeenFallback } = applySeenVisibility(
      items,
      [1, 2],
      [1, 2],
    )
    expect(visible.map((c) => c.beatmapsetId)).toEqual([1, 2])
    expect(showingDownloadedFallback).toBe(true)
    expect(showingSeenFallback).toBe(false)
  })

  it('empty input stays empty with no fallback', () => {
    const { visible, showingDownloadedFallback, showingSeenFallback } = applySeenVisibility(
      [],
      [1],
      [2],
    )
    expect(visible).toEqual([])
    expect(showingDownloadedFallback).toBe(false)
    expect(showingSeenFallback).toBe(false)
  })

  it('ignores hidden ids that are not in the list', () => {
    const items = [item(1), item(2)]
    const { visible, showingDownloadedFallback, showingSeenFallback } = applySeenVisibility(
      items,
      [99],
      [98],
    )
    expect(visible.map((c) => c.beatmapsetId)).toEqual([1, 2])
    expect(showingDownloadedFallback).toBe(false)
    expect(showingSeenFallback).toBe(false)
  })

  it('does not mutate the input list', () => {
    const items = [item(1), item(2)]
    applySeenVisibility(items, [1], [2])
    expect(items.map((c) => c.beatmapsetId)).toEqual([1, 2])
  })
})

describe('applySeenVisibility showDownloaded option (§AE)', () => {
  it('shows downloaded sets again when the toggle is on, order preserved, no fallback', () => {
    const items = [item(1), item(2), item(3), item(4)]
    const { visible, showingDownloadedFallback, showingSeenFallback } = applySeenVisibility(
      items,
      [2, 4],
      [],
      { showDownloaded: true },
    )
    expect(visible.map((c) => c.beatmapsetId)).toEqual([1, 2, 3, 4])
    expect(showingDownloadedFallback).toBe(false)
    expect(showingSeenFallback).toBe(false)
  })

  it('the served-before rule still hides non-downloaded maps when the toggle is on', () => {
    const items = [item(1), item(2), item(3), item(4)]
    const { visible, showingDownloadedFallback, showingSeenFallback } = applySeenVisibility(
      items,
      [2],
      [1, 3],
      { showDownloaded: true },
    )
    expect(visible.map((c) => c.beatmapsetId)).toEqual([2, 4])
    expect(showingDownloadedFallback).toBe(false)
    expect(showingSeenFallback).toBe(false)
  })

  it('all served (none downloaded): seen fallback still fires with the toggle on', () => {
    const items = [item(1), item(2)]
    const { visible, showingDownloadedFallback, showingSeenFallback } = applySeenVisibility(
      items,
      [],
      [1, 2],
      { showDownloaded: true },
    )
    expect(visible.map((c) => c.beatmapsetId)).toEqual([1, 2])
    expect(showingDownloadedFallback).toBe(false)
    expect(showingSeenFallback).toBe(true)
  })

  it('all downloaded with the toggle on: visible with no fallback (nothing to fall back to)', () => {
    const items = [item(1), item(2), item(3)]
    const { visible, showingDownloadedFallback, showingSeenFallback } = applySeenVisibility(
      items,
      [1, 2, 3],
      [],
      { showDownloaded: true },
    )
    expect(visible.map((c) => c.beatmapsetId)).toEqual([1, 2, 3])
    expect(showingDownloadedFallback).toBe(false)
    expect(showingSeenFallback).toBe(false)
  })

  it('toggle off (default) still hides downloaded sets', () => {
    const items = [item(1), item(2)]
    const { visible } = applySeenVisibility(items, [1], [], { showDownloaded: false })
    expect(visible.map((c) => c.beatmapsetId)).toEqual([2])
  })
})
