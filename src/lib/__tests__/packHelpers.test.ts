// Tests for the runtime-agnostic pack proxy helpers shared by the Edge
// Function (Deno) and vitest (Node). These prove the upstream contract:
// the list call always carries a `type`, the cursor passes through,
// and the detail tag reaches osu! verbatim.
import { describe, expect, it } from 'vitest'
import {
  buildBeatmapPackDetailPath,
  buildBeatmapPacksPath,
  PACK_TYPE_NAMES,
  PackListError,
  resolvePackListType,
} from '../../../supabase/functions/osu-proxy/packHelpers'

describe('resolvePackListType', () => {
  it('defaults to standard when the param is absent or empty', () => {
    expect(resolvePackListType(undefined)).toBe('standard')
    expect(resolvePackListType(null)).toBe('standard')
    expect(resolvePackListType('')).toBe('standard')
  })

  it('accepts all seven documented BeatmapPackType names', () => {
    expect(PACK_TYPE_NAMES).toEqual([
      'standard',
      'featured',
      'tournament',
      'loved',
      'chart',
      'theme',
      'artist',
    ])
    for (const name of PACK_TYPE_NAMES) {
      expect(resolvePackListType(name)).toBe(name)
    }
  })

  it('rejects anything else, naming the valid values', () => {
    for (const bad of ['STANDARD', 'weekly', 'S', 'ST445', 42, {}, []]) {
      expect(() => resolvePackListType(bad)).toThrow(PackListError)
      expect(() => resolvePackListType(bad)).toThrow(/standard.*featured.*tournament.*loved.*chart.*theme.*artist/)
    }
  })
})

describe('buildBeatmapPacksPath', () => {
  it('always carries the type param', () => {
    expect(buildBeatmapPacksPath('standard', undefined)).toBe('/beatmaps/packs?type=standard')
    expect(buildBeatmapPacksPath('featured', null)).toBe('/beatmaps/packs?type=featured')
  })

  it('passes cursor_string through only when non-empty', () => {
    expect(buildBeatmapPacksPath('standard', 'page-2')).toBe(
      '/beatmaps/packs?type=standard&cursor_string=page-2',
    )
    expect(buildBeatmapPacksPath('standard', '')).toBe('/beatmaps/packs?type=standard')
    expect(buildBeatmapPacksPath('standard', '   ')).toBe('/beatmaps/packs?type=standard')
  })

  it('URL-encodes opaque cursor values', () => {
    expect(buildBeatmapPacksPath('loved', 'a+b/c=d')).toBe(
      '/beatmaps/packs?type=loved&cursor_string=a%2Bb%2Fc%3Dd',
    )
  })
})

describe('buildBeatmapPackDetailPath (verbatim-tag regression)', () => {
  it('sends observed live tags intact, including ST445', () => {
    expect(buildBeatmapPackDetailPath('ST445')).toBe('/beatmaps/packs/ST445')
    expect(buildBeatmapPackDetailPath('SM385')).toBe('/beatmaps/packs/SM385')
    expect(buildBeatmapPackDetailPath('SC172')).toBe('/beatmaps/packs/SC172')
    expect(buildBeatmapPackDetailPath('S1888')).toBe('/beatmaps/packs/S1888')
  })

  it('escapes only reserved characters, never rewrites the tag', () => {
    expect(buildBeatmapPackDetailPath('S 1')).toBe('/beatmaps/packs/S%201')
    expect(buildBeatmapPackDetailPath('A/B')).toBe('/beatmaps/packs/A%2FB')
  })
})
