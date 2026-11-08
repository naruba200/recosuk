/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Batch AM: EVA Unit-01 goes flat. The override is one contained CSS
// block in index.css, scoped to [data-theme="eva-unit-01"] — the
// visual result itself is live-only (see test plan §AM), but the
// block's presence and shape are auditable here, same pattern as
// the theme token audit in themes.test.ts.
const css = readFileSync(
  fileURLToPath(new URL('../../index.css', import.meta.url)),
  'utf8',
)

function evaFlatSection(): string {
  const marker = 'Batch AM: EVA Unit-01 goes flat'
  const idx = css.indexOf(marker)
  expect(idx, 'missing EVA flat block in index.css').toBeGreaterThan(-1)
  // Bound the section to this block only (it ends where the Dark
  // Horse token block begins) and strip the header comment: the
  // assertions below must match real CSS rules, not words inside the
  // comment (it names the same custom properties the rules zero).
  const start = css.lastIndexOf('/*', idx)
  const end = css.indexOf('/* Dark Horse (Hook Agency)', idx)
  expect(end, 'EVA flat block has no end boundary').toBeGreaterThan(idx)
  return css.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('EVA flat theme (batch AM, index.css audit)', () => {
  it('zeroes every Tailwind shadow + drop-shadow under EVA only', () => {
    const flat = evaFlatSection()
    expect(flat).toContain('--tw-shadow: 0 0 #0000 !important;')
    expect(flat).toContain('--tw-shadow-colored: 0 0 #0000 !important;')
    expect(flat).toContain('--tw-drop-shadow: drop-shadow(0 0 #0000) !important;')
    // Scoped to EVA: no other theme gets a shadow rule.
    expect(css).not.toContain('[data-theme="dark-stage"] *')
    expect(css).not.toContain('[data-theme="dark-horse"] *')
    expect(css).not.toContain('[data-theme="punch-of-color"] *')
    expect(css).not.toContain('[data-theme="fresh-modern"] *')
  })

  it('flattens gradient fills to their own start colour', () => {
    const flat = evaFlatSection()
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
    const flat = evaFlatSection()
    expect(flat).toContain('.hit-circle-glow')
    expect(flat).toContain('.animate-circle-glow')
    expect(flat).toContain('animation: none !important;')
    expect(flat).toContain('.ambient-glow-mania')
    expect(flat).toContain('button[title^="osu!"]')
  })

  it('does not touch rings — no ring custom property is zeroed', () => {
    const flat = evaFlatSection()
    expect(flat).not.toContain('--tw-ring-shadow')
    expect(flat).not.toContain('--tw-ring-offset-shadow')
  })

  it('leaves the EVA colour tokens untouched', () => {
    // The token block still defines the EVA primary (neon green).
    expect(css).toContain('--c-primary: 157 255 63;')
  })
})
