/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { statusBadgeClasses } from '../statusBadge'

/**
 * §AV — every beatmapset status gets its own colored badge on the
 * row (user decision 2026-11-09): ranked pink, loved purple
 * (unchanged), qualified gold, pending blue, graveyard grey, and
 * any other/unknown status falls back to the same grey — never
 * unstyled, never badge-less. The helper is unit-tested directly;
 * the badge wiring is audited as source (same pattern as
 * downloadPrimaryViews.test.ts) because BeatmapRow is a
 * hook-using component.
 */

const beatmapRow = readFileSync(
  fileURLToPath(new URL('../../components/BeatmapRow.tsx', import.meta.url)),
  'utf8',
)

describe('statusBadgeClasses (§AV)', () => {
  it('ranked is pink (osu! primary)', () => {
    expect(statusBadgeClasses('ranked')).toBe(
      'bg-primary-container/60 text-primary',
    )
  })

  it('loved keeps its current classes exactly (unchanged)', () => {
    expect(statusBadgeClasses('loved')).toBe(
      'bg-secondary-container/60 text-secondary',
    )
  })

  it('qualified is gold (the star-rating gold)', () => {
    expect(statusBadgeClasses('qualified')).toBe(
      'bg-[#FFCC22]/15 text-[#FFCC22]',
    )
  })

  it('pending is blue (the Catch mode accent)', () => {
    expect(statusBadgeClasses('pending')).toBe(
      'bg-[#4CC3FF]/15 text-[#4CC3FF]',
    )
  })

  it('graveyard is muted grey', () => {
    expect(statusBadgeClasses('graveyard')).toBe(
      'bg-surface-container text-on-surface-variant',
    )
  })

  it('approved, wip and unknown statuses fall back to the same grey', () => {
    const grey = 'bg-surface-container text-on-surface-variant'
    expect(statusBadgeClasses('approved')).toBe(grey)
    expect(statusBadgeClasses('wip')).toBe(grey)
    expect(statusBadgeClasses('something-new')).toBe(grey)
  })

  it('matches case-insensitively', () => {
    expect(statusBadgeClasses('Ranked')).toBe(
      'bg-primary-container/60 text-primary',
    )
    expect(statusBadgeClasses('LOVED')).toBe(
      'bg-secondary-container/60 text-secondary',
    )
    expect(statusBadgeClasses('Graveyard')).toBe(
      'bg-surface-container text-on-surface-variant',
    )
  })
})

describe('row status badge wiring (§AV)', () => {
  it('the badge renders for every status via the helper, not loved-only', () => {
    expect(beatmapRow).toContain('statusBadgeClasses(c.status)')
    expect(beatmapRow).not.toContain("c.status === 'loved'")
  })
})
