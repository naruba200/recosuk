import { describe, expect, it } from 'vitest'
import {
  groupPacks,
  normalizePack,
  normalizePackList,
  packPeriod,
  type BeatmapPack,
} from '../packs'

describe('normalizePack', () => {
  it('reads tag/name/url/date and ids from beatmapsets objects', () => {
    expect(
      normalizePack({
        tag: 'P1234',
        name: 'Beatmap Pack #1234',
        url: 'https://example.test/packs/P1234',
        date: '2026-10-01',
        beatmapsets: [{ id: 1 }, { id: 2 }, { id: 2 }],
      }),
    ).toEqual({
      tag: 'P1234',
      name: 'Beatmap Pack #1234',
      url: 'https://example.test/packs/P1234',
      date: '2026-10-01',
      beatmapsetIds: [1, 2],
    })
  })

  it('reads ids from a plain beatmapset_ids array', () => {
    expect(normalizePack({ tag: 'P1', name: 'Pack', beatmapset_ids: [7, 8] })?.beatmapsetIds).toEqual([7, 8])
  })

  it('falls back to the name when the tag is missing, and vice versa', () => {
    expect(normalizePack({ name: 'Only Name' })?.tag).toBe('Only Name')
    expect(normalizePack({ tag: 'only-tag' })?.name).toBe('only-tag')
  })

  it('returns null for entries with neither tag nor name, and for non-objects', () => {
    expect(normalizePack({})).toBeNull()
    expect(normalizePack(null)).toBeNull()
    expect(normalizePack('pack')).toBeNull()
    expect(normalizePack({ beatmapsets: [{ id: 1 }] })).toBeNull()
  })

  it('tolerates a list entry without beatmapsets (ids filled by the detail call)', () => {
    expect(normalizePack({ tag: 'P9', name: 'Pack 9' })?.beatmapsetIds).toEqual([])
  })
})

describe('normalizePackList', () => {
  it('accepts a bare array and a { packs } envelope, skipping bad entries', () => {
    const raw = [{ tag: 'A', name: 'A' }, null, { tag: 'B', name: 'B' }]
    expect(normalizePackList(raw).map((p) => p.tag)).toEqual(['A', 'B'])
    expect(normalizePackList({ packs: raw }).map((p) => p.tag)).toEqual(['A', 'B'])
    expect(normalizePackList({})).toEqual([])
    expect(normalizePackList(null)).toEqual([])
  })
})

describe('packPeriod grouping', () => {
  function pack(name: string, tag = ''): BeatmapPack {
    return { tag, name, beatmapsetIds: [] }
  }

  it('groups weekly/monthly/yearly by name text, year included', () => {
    expect(packPeriod(pack('Weekly Beatmap Pack'))).toBe('weekly')
    expect(packPeriod(pack('Beatmap Pack — Week 42'))).toBe('weekly')
    expect(packPeriod(pack('Monthly Pack'))).toBe('monthly')
    expect(packPeriod(pack('Yearly Pack 2025'))).toBe('yearly')
    expect(packPeriod(pack('Beatmap Pack #1234', '2025-pack'))).toBe('yearly')
  })

  it('puts unlabelled packs in Curated', () => {
    expect(packPeriod(pack('Beatmap Pack #1234', 'P1234'))).toBe('curated')
    expect(packPeriod(pack('Community Picks'))).toBe('curated')
  })

  it('groups packs into ordered buckets, empty buckets included', () => {
    const grouped = groupPacks([
      pack('Weekly A'),
      pack('Monthly B'),
      pack('Yearly C'),
      pack('Random D'),
      pack('Weekly E'),
    ])
    expect(grouped.weekly.map((p) => p.name)).toEqual(['Weekly A', 'Weekly E'])
    expect(grouped.monthly.map((p) => p.name)).toEqual(['Monthly B'])
    expect(grouped.yearly.map((p) => p.name)).toEqual(['Yearly C'])
    expect(grouped.curated.map((p) => p.name)).toEqual(['Random D'])
  })
})
