import { describe, expect, it } from 'vitest'
import { GAME_MODES, MODE_LABELS, isGameMode, modeLabel } from '../mode'

describe('mode', () => {
  it('accepts exactly the four API modes', () => {
    expect(GAME_MODES).toEqual(['osu', 'taiko', 'fruits', 'mania'])
    for (const mode of GAME_MODES) expect(isGameMode(mode)).toBe(true)
  })

  it('rejects non-modes and UI labels', () => {
    expect(isGameMode('catch')).toBe(false)
    expect(isGameMode('standard')).toBe(false)
    expect(isGameMode('')).toBe(false)
    expect(isGameMode(null)).toBe(false)
    expect(isGameMode(undefined)).toBe(false)
    expect(isGameMode(4)).toBe(false)
  })

  it('labels fruits as Catch and never leaks the API name to the UI', () => {
    expect(MODE_LABELS.fruits).toBe('Catch')
    expect(MODE_LABELS.osu).toBe('Standard')
    expect(MODE_LABELS.taiko).toBe('Taiko')
    expect(MODE_LABELS.mania).toBe('Mania')
    expect(modeLabel('fruits')).toBe('Catch')
  })

  it('modeLabel falls back to the raw value for unknown modes', () => {
    expect(modeLabel('something-else')).toBe('something-else')
  })
})
