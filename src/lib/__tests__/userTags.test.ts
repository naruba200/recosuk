import { describe, expect, it, vi } from 'vitest'
import { createDataCache } from '../dataCache'
import { proxyCall } from '../osu'
import {
  appendUserTagClause,
  BUNDLED_USER_TAGS,
  groupUserTags,
  loadUserTags,
  normalizeUserTags,
  resetUserTagsCache,
  tagsForMode,
  userTagQueryClause,
  USER_TAG_GROUPS,
  type UserTag,
} from '../userTags'

describe('bundled vocabulary (osu! wiki tables)', () => {
  it('carries every wiki table entry, once, with group + name + description', () => {
    expect(BUNDLED_USER_TAGS).toHaveLength(122)
    const ids = BUNDLED_USER_TAGS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const tag of BUNDLED_USER_TAGS) {
      expect(tag.group).not.toBe('')
      expect(tag.name).not.toBe('')
      expect(tag.description).not.toBe('')
      expect(tag.id).toBe(`${tag.group}/${tag.name}`)
    }
  })

  it('covers all twelve wiki groups', () => {
    const groups = new Set(BUNDLED_USER_TAGS.map((t) => t.group))
    expect([...groups].sort()).toEqual(
      [...USER_TAG_GROUPS.map((g) => g.id).filter((id) => id !== 'other')].sort(),
    )
  })

  it('spot-checks wiki transcriptions, including spaced names', () => {
    const byId = new Map(BUNDLED_USER_TAGS.map((t) => [t.id, t]))
    expect(byId.get('style/chordjack')?.description).toContain('evenly spaced chords')
    expect(byId.get('style/jumpstream')?.description).toContain('2-note')
    expect(byId.get('jumps/back and forth')).toBeDefined()
    expect(byId.get('gimmick/2B')?.description).toContain('two or more objects')
    expect(byId.get('skillset/streams')?.description).toContain('more than 9 notes')
    expect(byId.get('meta/mega collab')?.description).toContain('8 or more')
  })

  it('has unknown applicability for every bundled tag (wiki mode data is icons-only)', () => {
    // Unknown applicability must never drop a tag from a mode.
    expect(BUNDLED_USER_TAGS.every((t) => t.modes === null)).toBe(true)
  })
})

describe('normalizeUserTags (defensive: undocumented GET /tags shape)', () => {
  it('normalises a top-level array of tag objects', () => {
    const out = normalizeUserTags([
      { name: 'skillset/jumps', description: 'Jump focus' },
      { name: 'streams', group: 'streams', description: 'Stream focus' },
    ])
    expect(out).toEqual([
      { id: 'skillset/jumps', group: 'skillset', name: 'jumps', description: 'Jump focus', modes: null },
      { id: 'streams/streams', group: 'streams', name: 'streams', description: 'Stream focus', modes: null },
    ])
  })

  it('normalises {tags: [...]} and {data: [...]} wrappers', () => {
    const payload = [{ name: 'tech/flow', description: 'Flow' }]
    expect(normalizeUserTags({ tags: payload })?.map((t) => t.id)).toEqual(['tech/flow'])
    expect(normalizeUserTags({ data: payload })?.map((t) => t.id)).toEqual(['tech/flow'])
  })

  it('normalises string items, splitting group/name on the first slash', () => {
    const out = normalizeUserTags(['skillset/alt', 'freeform'])
    expect(out?.map((t) => t.id)).toEqual(['skillset/alt', 'other/freeform'])
  })

  it('normalises grouped containers and group-to-array maps', () => {
    const grouped = normalizeUserTags([
      { group: 'style', tags: [{ name: 'chordjack', description: 'Chords' }] },
    ])
    expect(grouped?.map((t) => t.id)).toEqual(['style/chordjack'])
    const mapped = normalizeUserTags({
      style: [{ name: 'dump', description: 'Dump' }],
      tech: ['wiggles'],
    })
    expect(mapped?.map((t) => t.id)).toEqual(['style/dump', 'tech/wiggles'])
  })

  it('records per-mode applicability from mode fields in any recognised spelling', () => {
    const out = normalizeUserTags([
      { name: 'a/one', description: '', modes: ['mania', 'osu'] },
      { name: 'b/two', description: '', rulesets: ['fruits'] },
      { name: 'c/three', description: '', applicable_modes: ['catch'] },
      { name: 'd/four', description: '', modes: [3] },
      { name: 'e/five', description: '', modes: ['standard'] },
    ])
    expect(out?.map((t) => [t.id, t.modes])).toEqual([
      ['a/one', ['mania', 'osu']],
      ['b/two', ['fruits']],
      ['c/three', ['fruits']],
      ['d/four', ['mania']],
      ['e/five', ['osu']],
    ])
  })

  it('keeps a tag whose mode data is unusable, with unknown applicability', () => {
    const out = normalizeUserTags([
      { name: 'style/vocal', description: 'Vocals', modes: ['not-a-mode'] },
      { name: 'style/clean', description: 'Clean', modes: [] },
    ])
    expect(out?.map((t) => [t.id, t.modes])).toEqual([
      ['style/vocal', null],
      ['style/clean', null],
    ])
  })

  it('dedupes by id, first entry wins', () => {
    const out = normalizeUserTags([
      { name: 'tech/flow', description: 'First' },
      { name: 'tech/flow', description: 'Second' },
    ])
    expect(out).toHaveLength(1)
    expect(out?.[0].description).toBe('First')
  })

  it('returns null for unrecognised / empty shapes instead of inventing tags', () => {
    expect(normalizeUserTags(null)).toBeNull()
    expect(normalizeUserTags(undefined)).toBeNull()
    expect(normalizeUserTags('skillset/jumps')).toBeNull()
    expect(normalizeUserTags(42)).toBeNull()
    expect(normalizeUserTags({})).toBeNull()
    expect(normalizeUserTags({ foo: 'bar' })).toBeNull()
    expect(normalizeUserTags([])).toBeNull()
    expect(normalizeUserTags({ tags: [] })).toBeNull()
    expect(normalizeUserTags([{ nope: 1 }, 42, ''])).toBeNull()
    expect(normalizeUserTags([{ name: '' }, { name: '   ' }])).toBeNull()
  })

  it('never throws on malformed input', () => {
    expect(() => normalizeUserTags({ tags: [{ name: { nested: true } }, null, [1, 2]] })).not.toThrow()
  })
})

describe('tagsForMode (per-mode picker filtering)', () => {
  const tags: UserTag[] = [
    { id: 'style/chordjack', group: 'style', name: 'chordjack', description: '', modes: ['mania'] },
    { id: 'skillset/jumps', group: 'skillset', name: 'jumps', description: '', modes: null },
    { id: 'style/convert', group: 'style', name: 'convert', description: '', modes: ['osu', 'taiko'] },
  ]

  it('includes unknown-applicability tags in every mode, never drops them', () => {
    for (const mode of ['osu', 'taiko', 'fruits', 'mania'] as const) {
      expect(tagsForMode(tags, mode).map((t) => t.id)).toContain('skillset/jumps')
    }
  })

  it('filters live tags with known applicability to the current mode', () => {
    expect(tagsForMode(tags, 'mania').map((t) => t.id)).toEqual(['style/chordjack', 'skillset/jumps'])
    expect(tagsForMode(tags, 'osu').map((t) => t.id)).toEqual(['skillset/jumps', 'style/convert'])
    expect(tagsForMode(tags, 'fruits').map((t) => t.id)).toEqual(['skillset/jumps'])
  })

  it("'all' is the union, whatever the applicability data says", () => {
    expect(tagsForMode(tags, 'all')).toHaveLength(3)
  })

  it('groups in wiki order with "other" last', () => {
    const grouped = groupUserTags([
      ...tags,
      { id: 'other/odd', group: 'other', name: 'odd', description: '', modes: null },
    ])
    expect(grouped.map((g) => g.group)).toEqual(['skillset', 'style', 'other'])
  })
})

describe('userTagQueryClause (exact server-side construction)', () => {
  it('builds tag="group/name", quoting spaced names', () => {
    expect(userTagQueryClause('style/chordjack')).toBe('tag="style/chordjack"')
    expect(userTagQueryClause('jumps/back and forth')).toBe('tag="jumps/back and forth"')
  })

  it('yields no clause for a missing/empty id', () => {
    expect(userTagQueryClause(null)).toBe('')
    expect(userTagQueryClause(undefined)).toBe('')
    expect(userTagQueryClause('')).toBe('')
    expect(userTagQueryClause('   ')).toBe('')
  })

  it('strips embedded quotes so an id cannot break out of the clause', () => {
    expect(userTagQueryClause('style/a"b')).toBe('tag="style/ab"')
  })

  it('appends the clause last, or returns the clause alone for an empty query', () => {
    expect(appendUserTagClause('stars>=4', 'style/chordjack')).toBe('stars>=4 tag="style/chordjack"')
    expect(appendUserTagClause('', 'style/chordjack')).toBe('tag="style/chordjack"')
    expect(appendUserTagClause('stars>=4', null)).toBe('stars>=4')
  })
})

describe('loadUserTags (live load with bundled fallback)', () => {
  function fakeCall(result: unknown): typeof proxyCall {
    const fn = vi.fn(async () => result)
    return fn as unknown as typeof proxyCall
  }

  it('returns the normalised live vocabulary and caches it', async () => {
    const cache = createDataCache()
    const inner = vi.fn(async () => ({ tags: [{ name: 'tech/flow', description: 'Flow', modes: ['osu'] }] }))
    const call = inner as unknown as typeof proxyCall
    const first = await loadUserTags({ call, cache })
    expect(first).toEqual([
      { id: 'tech/flow', group: 'tech', name: 'flow', description: 'Flow', modes: ['osu'] },
    ])
    const second = await loadUserTags({ call, cache })
    expect(second).toBe(first)
    expect(inner).toHaveBeenCalledTimes(1)
  })

  it('falls back to the bundled vocabulary when the proxy call throws (not redeployed yet)', async () => {
    const cache = createDataCache()
    const call = vi.fn(async () => {
      throw new Error('Unknown action: getBeatmapUserTags')
    }) as unknown as typeof proxyCall
    const tags = await loadUserTags({ call, cache })
    expect(tags).toBe(BUNDLED_USER_TAGS)
  })

  it('falls back to the bundled vocabulary when the live shape is unrecognised', async () => {
    const cache = createDataCache()
    const tags = await loadUserTags({ call: fakeCall({ unexpected: true }), cache })
    expect(tags).toBe(BUNDLED_USER_TAGS)
  })

  it('resetUserTagsCache drops the cached vocabulary', async () => {
    const cache = createDataCache()
    const live = fakeCall([{ name: 'tech/flow', description: 'Flow' }])
    await loadUserTags({ call: live, cache })
    resetUserTagsCache(cache)
    const fallback = await loadUserTags({
      call: fakeCall({ unexpected: true }),
      cache,
    })
    expect(fallback).toBe(BUNDLED_USER_TAGS)
  })
})
