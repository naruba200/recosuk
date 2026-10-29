import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  fetchBeatmapsetSummary,
  normalizeBeatmapsetSummary,
  resetBeatmapsetSummaryCache,
} from '../beatmapsets'
import { proxyCall } from '../osu'
import type { SearchBeatmapset } from '../recommend'

/** A vi.fn stub shaped like the generic proxyCall (cast once, here). */
function stubCall(impl: () => Promise<unknown>) {
  return vi.fn(impl) as unknown as typeof proxyCall
}

function rawSet(): SearchBeatmapset {
  return {
    id: 42,
    title: 'Exit This Earth',
    artist: 'Camellia',
    creator: 'mapper',
    status: 'ranked',
    tags: 'Jumpstream Chordjack Speed',
    covers: { card: 'https://card', cover: 'https://cover' },
    beatmaps: [
      { id: 420, mode: 'mania', version: '7K', difficulty_rating: 4.4, bpm: 170, total_length: 120, cs: 7, ar: 9, od: 8 },
      { id: 421, mode: 'mania', version: '4K', difficulty_rating: 5.1, bpm: 170, total_length: 120, cs: 4, ar: 9, od: 8 },
      { id: 422, mode: 'osu', version: 'Insane', difficulty_rating: 6.2, bpm: 170, total_length: 120 },
    ],
  }
}

describe('normalizeBeatmapsetSummary', () => {
  it('restricts the SR range to the requested mode and lowercases tags', () => {
    const summary = normalizeBeatmapsetSummary(rawSet(), { mode: 'mania' })
    expect(summary.srMin).toBe(4.4)
    expect(summary.srMax).toBe(5.1)
    expect(summary.tags).toEqual(['jumpstream', 'chordjack', 'speed'])
    expect(summary.cover).toBe('https://card')
    expect(summary.bpm).toBe(170)
    expect(summary.lengthSec).toBe(120)
  })

  it('uses all difficulties when no mode is given', () => {
    const summary = normalizeBeatmapsetSummary(rawSet())
    expect(summary.srMin).toBe(4.4)
    expect(summary.srMax).toBe(6.2)
  })

  it('reports the named difficulty’s SR and nulls when nothing matches', () => {
    expect(normalizeBeatmapsetSummary(rawSet(), { mode: 'mania', beatmapId: 421 }).difficultySr).toBe(5.1)
    expect(normalizeBeatmapsetSummary(rawSet(), { beatmapId: 999 }).difficultySr).toBeNull()
    const empty = normalizeBeatmapsetSummary({ ...rawSet(), beatmaps: [] }, { mode: 'taiko' })
    expect(empty.srMin).toBeNull()
    expect(empty.srMax).toBeNull()
    expect(empty.bpm).toBeNull()
  })
})

describe('fetchBeatmapsetSummary', () => {
  beforeEach(() => {
    resetBeatmapsetSummaryCache()
  })

  it('normalizes a proxy payload and caches per set+mode+difficulty', async () => {
    const call = stubCall(async () => rawSet())
    const first = await fetchBeatmapsetSummary(42, { mode: 'mania', call })
    expect(first?.title).toBe('Exit This Earth')
    const second = await fetchBeatmapsetSummary(42, { mode: 'mania', call })
    expect(second).toBe(first)
    expect(call).toHaveBeenCalledTimes(1)
    // A different mode key is a different summary — re-fetched.
    await fetchBeatmapsetSummary(42, { mode: 'osu', call })
    expect(call).toHaveBeenCalledTimes(2)
    expect(call).toHaveBeenLastCalledWith('getBeatmapset', { beatmapsetId: 42 })
  })

  it('returns null when the proxy rejects (e.g. action unknown before redeploy)', async () => {
    const call = stubCall(async () => {
      throw new Error('mode is required')
    })
    expect(await fetchBeatmapsetSummary(42, { call })).toBeNull()
  })

  it('returns null for a malformed payload', async () => {
    const call = stubCall(async () => ({ nope: true }) as unknown as SearchBeatmapset)
    expect(await fetchBeatmapsetSummary(42, { call })).toBeNull()
  })
})
