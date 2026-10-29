/// <reference types="node" />
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_THEME,
  THEMES,
  THEME_IDS,
  THEME_STORAGE_KEY,
  THEME_TOKEN_KEYS,
  applyTheme,
  applyThemeToRoot,
  getCurrentTheme,
  isThemeId,
  readStoredTheme,
  resolveInitialTheme,
  useThemeStore,
  type ThemeId,
  type ThemeStorage,
} from '../themes'

function memoryStorage(initial: Record<string, string> = {}): ThemeStorage & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial))
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v)
    },
  }
}

function fakeRoot() {
  const attrs = new Map<string, string>()
  return {
    dataset: {} as { theme?: string },
    attrs,
    setAttribute: (name: string, value: string) => {
      attrs.set(name, value)
    },
  }
}

describe('themes catalogue', () => {
  it('ships 5 themes with Dark Stage as the default', () => {
    expect(DEFAULT_THEME).toBe('dark-stage')
    expect(THEME_IDS).toEqual([
      'dark-stage',
      'eva-unit-01',
      'dark-horse',
      'punch-of-color',
      'fresh-modern',
    ])
    expect(new Set(THEME_IDS).size).toBe(THEME_IDS.length)
  })

  it('every theme has a label, description and 3 hex swatches', () => {
    for (const t of THEMES) {
      expect(t.label.length).toBeGreaterThan(0)
      expect(t.description.length).toBeGreaterThan(0)
      expect(t.swatches).toHaveLength(3)
      for (const hex of t.swatches) {
        expect(hex).toMatch(/^#[0-9a-fA-F]{6}$/)
      }
    }
  })

  it('rejects unknown ids', () => {
    expect(isThemeId('dark-stage')).toBe(true)
    expect(isThemeId('light')).toBe(false)
    expect(isThemeId('')).toBe(false)
    expect(isThemeId(null)).toBe(false)
  })
})

describe('theme persistence (mocked storage)', () => {
  it('defaults to Dark Stage when nothing is stored', () => {
    expect(resolveInitialTheme(memoryStorage())).toBe('dark-stage')
    expect(readStoredTheme(memoryStorage())).toBeNull()
  })

  it('honours a stored valid choice', () => {
    const storage = memoryStorage({ [THEME_STORAGE_KEY]: 'eva-unit-01' })
    expect(resolveInitialTheme(storage)).toBe('eva-unit-01')
    expect(readStoredTheme(storage)).toBe('eva-unit-01')
  })

  it('falls back to Dark Stage on a stored invalid value', () => {
    const storage = memoryStorage({ [THEME_STORAGE_KEY]: 'neon-zzz' })
    expect(resolveInitialTheme(storage)).toBe('dark-stage')
    expect(readStoredTheme(storage)).toBeNull()
  })

  it('a storage failure resolves to the default instead of throwing', () => {
    const failing: ThemeStorage = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    expect(resolveInitialTheme(failing)).toBe('dark-stage')
    expect(readStoredTheme(failing)).toBeNull()
  })
})

describe('applyThemeToRoot', () => {
  it('sets data-theme on the root element', () => {
    const root = fakeRoot()
    applyThemeToRoot(root, 'dark-horse')
    expect(root.attrs.get('data-theme')).toBe('dark-horse')
    expect(root.dataset.theme).toBe('dark-horse')
  })

  it('falls back to Dark Stage for an unknown id', () => {
    const root = fakeRoot()
    applyThemeToRoot(root, 'bogus' as ThemeId)
    expect(root.attrs.get('data-theme')).toBe('dark-stage')
  })

  it('no-ops without a root', () => {
    expect(() => applyThemeToRoot(null, 'eva-unit-01')).not.toThrow()
    expect(() => applyThemeToRoot(undefined, 'eva-unit-01')).not.toThrow()
  })
})

describe('theme store + applyTheme (node env, no document)', () => {
  beforeEach(() => {
    useThemeStore.getState().setTheme('dark-stage')
  })
  afterEach(() => {
    useThemeStore.getState().setTheme('dark-stage')
  })

  it('switching themes updates state and persists across reload (mocked storage)', () => {
    // applyTheme must not throw without a document, and must persist.
    expect(() => applyTheme('eva-unit-01')).not.toThrow()
    expect(readStoredTheme()).toBe('eva-unit-01')
    // "Reload": resolve from storage again.
    expect(resolveInitialTheme()).toBe('eva-unit-01')

    useThemeStore.getState().setTheme('punch-of-color')
    expect(getCurrentTheme()).toBe('punch-of-color')
    expect(readStoredTheme()).toBe('punch-of-color')
    expect(resolveInitialTheme()).toBe('punch-of-color')
  })

  it('ignores invalid theme ids in the store', () => {
    useThemeStore.getState().setTheme('bogus' as ThemeId)
    expect(getCurrentTheme()).toBe('dark-stage')
  })
})

/** Pre-theme hex values from tailwind.config.js (verbatim). Dark
 *  Stage must reproduce them exactly as RGB triplets in index.css. */
const LEGACY_DARK_STAGE_HEX: Record<string, string> = {
  background: '#161020',
  'inverse-on-surface': '#342d3f',
  'inverse-primary': '#713bd0',
  'inverse-surface': '#eadef5',
  'on-background': '#eadef5',
  'on-primary': '#3f008e',
  'on-primary-container': '#36007d',
  'on-primary-fixed': '#25005a',
  'on-primary-fixed-variant': '#5819b8',
  'on-secondary': '#640038',
  'on-secondary-container': '#ff9ac0',
  'on-secondary-fixed': '#3e0021',
  'on-secondary-fixed-variant': '#8d0051',
  'on-surface': '#eadef5',
  'on-surface-variant': '#ccc3d6',
  'on-tertiary': '#00344a',
  'on-tertiary-container': '#002d41',
  'on-tertiary-fixed': '#001e2d',
  'on-tertiary-fixed-variant': '#004c6a',
  outline: '#958d9f',
  'outline-variant': '#4a4454',
  panel: '#221832',
  paper: '#F5F1FA',
  primary: '#d2bbff',
  'primary-container': '#a476ff',
  'primary-fixed': '#eaddff',
  'primary-fixed-dim': '#d2bbff',
  secondary: '#ffb0cc',
  'secondary-container': '#910054',
  'secondary-fixed': '#ffd9e4',
  'secondary-fixed-dim': '#ffb0cc',
  stage: '#150F1F',
  surface: '#161020',
  'surface-bright': '#3d3648',
  'surface-container': '#231d2d',
  'surface-container-high': '#2e2738',
  'surface-container-highest': '#393243',
  'surface-container-low': '#1f1929',
  'surface-container-lowest': '#110b1b',
  'surface-dim': '#161020',
  'surface-tint': '#d2bbff',
  'surface-variant': '#393243',
  tertiary: '#80d0ff',
  'tertiary-container': '#009bd3',
  'tertiary-fixed': '#c5e7ff',
  'tertiary-fixed-dim': '#80d0ff',
}

function hexToTriplet(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

function themeBlock(css: string, id: ThemeId): Record<string, string> {
  const re = new RegExp(`\\[data-theme="${id}"\\] \\{([^}]*)\\}`, 's')
  const match = css.match(re)
  expect(match, `missing [data-theme="${id}"] block in index.css`).toBeTruthy()
  const vars: Record<string, string> = {}
  for (const line of (match?.[1] ?? '').split('\n')) {
    const m = line.match(/--c-([a-z-]+):\s*([0-9 ]+);/)
    if (m) vars[m[1]] = m[2].trim().replace(/\s+/g, ' ')
  }
  return vars
}

describe('theme CSS audit (index.css + tailwind.config.js)', () => {
  const css = readFileSync(
    fileURLToPath(new URL('../../index.css', import.meta.url)),
    'utf8',
  )
  const config = readFileSync(
    fileURLToPath(new URL('../../../tailwind.config.js', import.meta.url)),
    'utf8',
  )

  it('every theme block defines all 46 theme tokens as RGB triplets', () => {
    for (const id of THEME_IDS) {
      const vars = themeBlock(css, id)
      for (const key of THEME_TOKEN_KEYS) {
        expect(vars[key], `${id} missing --c-${key}`).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/)
        const [r, g, b] = vars[key].split(' ').map(Number)
        expect(r).toBeLessThanOrEqual(255)
        expect(g).toBeLessThanOrEqual(255)
        expect(b).toBeLessThanOrEqual(255)
      }
    }
  })

  it('Dark Stage is pixel-identical to the pre-theme hex tokens', () => {
    const vars = themeBlock(css, 'dark-stage')
    expect(Object.keys(LEGACY_DARK_STAGE_HEX).sort()).toEqual([...THEME_TOKEN_KEYS].sort())
    for (const [key, hex] of Object.entries(LEGACY_DARK_STAGE_HEX)) {
      expect(vars[key], `--c-${key}`).toBe(hexToTriplet(hex))
    }
    // :root (first paint, before JS) carries the same Dark Stage values.
    const rootMatch = css.match(/:root \{([^}]*)\}/s)
    expect(rootMatch).toBeTruthy()
    for (const [key, hex] of Object.entries(LEGACY_DARK_STAGE_HEX)) {
      expect(rootMatch?.[1]).toContain(`--c-${key}: ${hexToTriplet(hex)};`)
    }
  })

  it('themes actually differ from each other (primary token)', () => {
    const primaries = new Set(THEME_IDS.map((id) => themeBlock(css, id).primary))
    expect(primaries.size).toBe(THEME_IDS.length)
  })

  it('tailwind config maps every theme token through a CSS variable', () => {
    for (const key of THEME_TOKEN_KEYS) {
      expect(config).toContain(`themeVar('${key}')`)
    }
    // Fixed brand/semantic tokens stay literal hex in the config.
    expect(config).toContain('"recpink": "#FF66AA"')
    expect(config).toContain('"stargold": "#FFCC22"')
    expect(config).toContain('"hitgreen": "#7EE787"')
    // No stale Dark Stage literal may survive as a theme token value.
    expect(config).not.toContain('"primary": "#d2bbff"')
    expect(config).not.toContain('"surface": "#161020"')
  })
})
