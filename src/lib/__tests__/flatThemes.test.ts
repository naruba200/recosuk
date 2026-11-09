/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Batch AM/AQ: all five themes go flat. AM made EVA flat as an
// experiment; AQ extends the same rules to every theme, and the
// blurred glow discs become flat static colour. The override is
// one contained CSS block in index.css — the visual result itself
// is live-only (see test plan §AQ), but the block's presence and
// shape are auditable here, same pattern as the theme token audit
// in themes.test.ts.
const css = readFileSync(
  fileURLToPath(new URL('../../index.css', import.meta.url)),
  'utf8',
)

const THEMES = ['dark-stage', 'eva-unit-01', 'dark-horse', 'punch-of-color', 'fresh-modern']

function flatSection(): string {
  const marker = 'Batch AM/AQ: all five themes go flat'
  const idx = css.indexOf(marker)
  expect(idx, 'missing all-themes flat block in index.css').toBeGreaterThan(-1)
  // Bound the section to this block only (it ends where the Dark
  // Horse token block begins) and strip the header comment: the
  // assertions below must match real CSS rules, not words inside the
  // comment (it names the same custom properties the rules zero).
  const start = css.lastIndexOf('/*', idx)
  const end = css.indexOf('/* Dark Horse (Hook Agency)', idx)
  expect(end, 'flat block has no end boundary').toBeGreaterThan(idx)
  return css.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('Flat themes (batch AQ, index.css audit)', () => {
  it('zeroes every Tailwind shadow + drop-shadow for all five themes', () => {
    const flat = flatSection()
    expect(flat).toContain('--tw-shadow: 0 0 #0000 !important;')
    expect(flat).toContain('--tw-shadow-colored: 0 0 #0000 !important;')
    expect(flat).toContain('--tw-drop-shadow: drop-shadow(0 0 #0000) !important;')
    // Every theme is listed in the flat block — no theme is
    // left with its shadows.
    for (const theme of THEMES) {
      expect(flat).toContain(`[data-theme="${theme}"]`)
    }
    // No EVA-only scoping remains (the old AM selector).
    expect(flat).not.toContain('[data-theme="eva-unit-01"] *')
  })

  it('flattens gradient fills to their own start colour', () => {
    const flat = flatSection()
    expect(flat).toContain('background-image: none !important;')
    expect(flat).toContain(
      'background-color: var(--tw-gradient-from, rgb(var(--c-primary-container))) !important;',
    )
    // The from-transparent divider fades fall back to their via tint.
    expect(flat).toContain(
      'background-color: var(--tw-gradient-via, transparent) !important;',
    )
  })

  it('neutralises the non-Tailwind glows (hit-circle class, pulse animation, ambient overlay, sidebar mode dot)', () => {
    const flat = flatSection()
    expect(flat).toContain('.hit-circle-glow')
    expect(flat).toContain('.animate-circle-glow')
    expect(flat).toContain('animation: none !important;')
    expect(flat).toContain('.ambient-glow-mania')
    expect(flat).toContain('button[title^="osu!"]')
  })

  it('removes the blur from glow discs but never touches backdrop blur', () => {
    const flat = flatSection()
    // Every `blur-*` filter utility is flattened to a static
    // colour shape; the :not() guard keeps `backdrop-blur-*`
    // (glass panels, header, badges) out of the rule.
    expect(flat).toContain('[class*="blur-"]')
    expect(flat).toContain(':not([class*="backdrop-blur"])')
    expect(flat).toContain('filter: none !important;')
    // No rule in the block mentions backdrop-filter at all.
    expect(flat).not.toContain('backdrop-filter')
  })

  it('does not touch rings — no ring custom property is zeroed', () => {
    const flat = flatSection()
    expect(flat).not.toContain('--tw-ring-shadow')
    expect(flat).not.toContain('--tw-ring-offset-shadow')
  })

  it('leaves the colour tokens untouched', () => {
    // The token block still defines the EVA primary (neon green).
    expect(css).toContain('--c-primary: 157 255 63;')
  })

  it('defines the mode-change transition keyframe (§AQ item 12d)', () => {
    expect(css).toContain('@keyframes modeChangeIn')
    expect(css).toContain('.animate-mode-change')
    expect(css).toContain('animation: modeChangeIn 0.35s ease-out;')
  })
})
