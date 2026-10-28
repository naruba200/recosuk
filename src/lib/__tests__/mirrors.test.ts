import { describe, expect, it } from 'vitest'
import { MIRRORS, mirrorById } from '../mirrors'

/**
 * Mirror URL builder, incl. the no-video variants (QA batch 2).
 *
 * Only catboy's no-video form is verified (the `{id}n` suffix, named
 * "catboy style" in the hinai mirror FAQ, mirror.hinamizawa.ai).
 * Beatconnect / Nerinyan / Sayobot fall back to the full file with
 * noVideo on — no shape is guessed for them. The official source
 * never takes a file URL at all.
 */
describe('mirror URLs', () => {
  it('builds the full-file URL for every mirror by default', () => {
    expect(mirrorById('official').url(42)).toBe('https://osu.ppy.sh/beatmapsets/42/download')
    expect(mirrorById('catboy').url(42)).toBe('https://catboy.best/d/42')
    expect(mirrorById('nerinyan').url(42)).toBe('https://api.nerinyan.moe/d/42')
    expect(mirrorById('beatconnect').url(42)).toBe('https://beatconnect.io/b/42')
    expect(mirrorById('sayobot').url(42)).toBe(
      'https://txy1.sayobot.cn/beatmaps/download/full/42',
    )
  })

  it('uses the verified {id}n no-video form for catboy only', () => {
    expect(mirrorById('catboy').url(42, { noVideo: true })).toBe('https://catboy.best/d/42n')
  })

  it('falls back to the full file for unverified mirrors with noVideo on', () => {
    expect(mirrorById('beatconnect').url(42, { noVideo: true })).toBe(
      'https://beatconnect.io/b/42',
    )
    expect(mirrorById('nerinyan').url(42, { noVideo: true })).toBe(
      'https://api.nerinyan.moe/d/42',
    )
    expect(mirrorById('sayobot').url(42, { noVideo: true })).toBe(
      'https://txy1.sayobot.cn/beatmaps/download/full/42',
    )
  })

  it('leaves the official osu! URL untouched by noVideo', () => {
    expect(mirrorById('official').url(42, { noVideo: true })).toBe(
      'https://osu.ppy.sh/beatmapsets/42/download',
    )
  })

  it('mirrorById falls back to the first mirror for unknown ids', () => {
    expect(mirrorById('nope')).toBe(MIRRORS[0])
  })
})
