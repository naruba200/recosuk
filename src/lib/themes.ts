import { create } from 'zustand'

/**
 * Themes (batch 11, part 2).
 *
 * Colours were wired as STATIC hex tokens in tailwind.config.js — no
 * CSS variables, no switcher, Settings locked the UI to Dark Stage.
 * Theming now follows the codebase's own token set: every Tailwind
 * colour token that varies by theme is a CSS variable
 * (`--c-<token>`, space-separated RGB triplets so Tailwind's
 * `/opacity` modifiers keep working), defined per theme in
 * src/index.css under `[data-theme="<id>"]`. tailwind.config.js maps
 * each token to `rgb(var(--c-<token>) / <alpha-value>)`, so every
 * surface using a token class re-tints when the attribute changes.
 * The choice is stored in localStorage (`recosuk-theme`) and applied
 * to `document.documentElement` before first paint (see main.tsx).
 *
 * FIXED tokens — deliberately NOT per-theme (they are brand /
 * semantic identity, not scheme colours, and keep their Dark Stage
 * values in tailwind.config.js): `recpink` (osu! brand pink),
 * `stargold` (star), `hitgreen` (success), the `modes.*` game-mode
 * accents (also mirrored in MODE_ACCENTS), and the `error` family.
 * Per-theme tokens are exactly THEME_TOKEN_KEYS below (46 keys);
 * src/lib/__tests__/themes.test.ts asserts every theme block in
 * index.css defines all of them and that Dark Stage matches the
 * pre-theme hex values verbatim.
 */

export const THEME_STORAGE_KEY = 'recosuk-theme'

export type ThemeId =
  | 'dark-stage'
  | 'eva-unit-01'
  | 'dark-horse'
  | 'punch-of-color'
  | 'fresh-modern'

export const DEFAULT_THEME: ThemeId = 'dark-stage'

export function isThemeId(value: unknown): value is ThemeId {
  return (
    value === 'dark-stage' ||
    value === 'eva-unit-01' ||
    value === 'dark-horse' ||
    value === 'punch-of-color' ||
    value === 'fresh-modern'
  )
}

/**
 * Every Tailwind colour token that varies by theme. Must match the
 * `--c-*` variables defined for each `[data-theme]` block in
 * index.css and the var-backed entries in tailwind.config.js.
 */
export const THEME_TOKEN_KEYS = [
  'background',
  'inverse-on-surface',
  'inverse-primary',
  'inverse-surface',
  'on-background',
  'on-primary',
  'on-primary-container',
  'on-primary-fixed',
  'on-primary-fixed-variant',
  'on-secondary',
  'on-secondary-container',
  'on-secondary-fixed',
  'on-secondary-fixed-variant',
  'on-surface',
  'on-surface-variant',
  'on-tertiary',
  'on-tertiary-container',
  'on-tertiary-fixed',
  'on-tertiary-fixed-variant',
  'outline',
  'outline-variant',
  'panel',
  'paper',
  'primary',
  'primary-container',
  'primary-fixed',
  'primary-fixed-dim',
  'secondary',
  'secondary-container',
  'secondary-fixed',
  'secondary-fixed-dim',
  'stage',
  'surface',
  'surface-bright',
  'surface-container',
  'surface-container-high',
  'surface-container-highest',
  'surface-container-low',
  'surface-container-lowest',
  'surface-dim',
  'surface-tint',
  'surface-variant',
  'tertiary',
  'tertiary-container',
  'tertiary-fixed',
  'tertiary-fixed-dim',
] as const

export interface ThemeMeta {
  id: ThemeId
  /** Display name shown in the Settings picker. */
  label: string
  /** One-line description shown in the picker. */
  description: string
  /**
   * Picker preview swatches: [surface, primary, secondary] hexes,
   * copied from the theme's own palette in index.css (not new
   * colours — the picker dots preview the real tokens).
   */
  swatches: [string, string, string]
}

/**
 * Theme catalogue. Palettes (full 46-token sets) live in index.css;
 * the notes here record each palette's anchors so a future editor
 * can re-derive them.
 *
 * Dark Stage — the original Stitch palette, verbatim (default).
 *
 * EVA Unit-01 — Evangelion Unit-01, defined here (no article
 * source): deep purple armour (#5A2D9E container, #1E1233 panel),
 * neon green accents (primary #9DFF3F, tint), near-black
 * purple-tinted surfaces (stage #0D0914), small orange details
 * (secondary #FFB27A / container #5C2E0A), mint entry-plug green
 * as tertiary (#7DF0C8). Text is a green-tinted off-white
 * (#EAF7E3) so the green accent never fights the body copy.
 *
 * Dark Horse — Hook Agency "Dark Horse" scheme
 * (#feda6a yellow, #d4d4dc silver, #393f4d matte grey,
 * #1d1e22 dark slate). Already dark: slate is the surface ladder,
 * yellow is the primary accent, silver the secondary. Tertiary is
 * a muted slate-blue derived for the third accent role; the
 * article's four hexes are used verbatim as anchors.
 *
 * Punch of Color — Hook Agency "Dark Backgrounds With a Punch of
 * Color" (#393939 dark grey, #FF5A09 deep orange, #ec7f37 light
 * orange, #be4f0c orange yellow). Dark grey is the surface ladder,
 * the oranges carry primary/secondary/container roles in a single
 * hue family, per the article's "one colour, depth through
 * shades" note. Accents are lightened only where text sits on
 * dark (primary #FFA06B) for contrast; article hexes stay as
 * secondary/container anchors.
 *
 * Fresh Modern — Hook Agency "A Fresh Modern Color Palette"
 * (#1d1145 deep purple, #0db4b9 trapper-keeper green/teal,
 * #f2a1a1 pink boot, #e76d89 modern pink backpack). Deep purple
 * is the surface ladder, teal the primary accent, the two pinks
 * secondary/tertiary. All four article hexes are used verbatim as
 * anchors (stage, fixed-variant, secondary, tertiary).
 */
export const THEMES: ThemeMeta[] = [
  {
    id: 'dark-stage',
    label: 'Dark Stage',
    description: 'The original RecOsuk look — deep purple stage, lavender and pink accents.',
    swatches: ['#150F1F', '#d2bbff', '#ffb0cc'],
  },
  {
    id: 'eva-unit-01',
    label: 'EVA Unit-01',
    description: 'Evangelion Unit-01 — purple armour, neon green accents, near-black, orange details.',
    swatches: ['#0D0914', '#9DFF3F', '#FFB27A'],
  },
  {
    id: 'dark-horse',
    label: 'Dark Horse',
    description: 'Dark slate with a confident yellow accent and silver neutrals.',
    swatches: ['#1D1E22', '#FEDA6A', '#D4D4DC'],
  },
  {
    id: 'punch-of-color',
    label: 'Punch of Color',
    description: 'Dark grey surfaces with a single punchy orange family.',
    swatches: ['#1A1714', '#FFA06B', '#FF5A09'],
  },
  {
    id: 'fresh-modern',
    label: 'Fresh Modern',
    description: 'Deep purple with fresh teal and pink accents.',
    swatches: ['#1D1145', '#6FD8DB', '#F2A1A1'],
  },
]

export const THEME_IDS: ThemeId[] = THEMES.map((t) => t.id)

export function themeMeta(id: ThemeId): ThemeMeta {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

export interface ThemeStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function defaultThemeStorage(): ThemeStorage | null {
  try {
    const ls = globalThis.localStorage
    if (!ls) return null
    return {
      getItem: (k) => ls.getItem(k),
      setItem: (k, v) => ls.setItem(k, v),
    }
  } catch {
    return null
  }
}

/** Stored choice, or null when nothing (or nothing valid) is stored. */
export function readStoredTheme(
  storage: ThemeStorage | null = defaultThemeStorage(),
): ThemeId | null {
  try {
    const raw = storage?.getItem(THEME_STORAGE_KEY) ?? null
    return isThemeId(raw) ? raw : null
  } catch {
    return null
  }
}

/** Initial theme: the stored choice, else Dark Stage. */
export function resolveInitialTheme(
  storage: ThemeStorage | null = defaultThemeStorage(),
): ThemeId {
  return readStoredTheme(storage) ?? DEFAULT_THEME
}

export interface ThemeRoot {
  dataset: { theme?: string }
  setAttribute(name: string, value: string): void
}

/**
 * Apply a theme to a root element (document.documentElement in the
 * app). Sets `data-theme` — the CSS variable blocks in index.css do
 * the rest. Unknown ids fall back to Dark Stage rather than leaving
 * the attribute in a state no CSS block matches.
 */
export function applyThemeToRoot(root: ThemeRoot | null | undefined, id: ThemeId): void {
  if (!root) return
  const theme = isThemeId(id) ? id : DEFAULT_THEME
  try {
    root.setAttribute('data-theme', theme)
  } catch {
    /* attribute write failed — :root defaults to Dark Stage */
  }
  try {
    if (root.dataset) root.dataset.theme = theme
  } catch {
    /* dataset is a convenience mirror; the attribute is authoritative */
  }
}

/** Apply + persist. No-ops (except the fallback) without a document. */
export function applyTheme(id: ThemeId): void {
  const root =
    typeof globalThis.document !== 'undefined'
      ? (globalThis.document.documentElement as unknown as ThemeRoot)
      : null
  applyThemeToRoot(root, id)
  try {
    defaultThemeStorage()?.setItem(THEME_STORAGE_KEY, isThemeId(id) ? id : DEFAULT_THEME)
  } catch {
    /* private mode — theme just won't persist */
  }
}

interface ThemeState {
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
}

export const useThemeStore = create<ThemeState>()((set) => ({
  theme: resolveInitialTheme(),

  setTheme: (theme) => {
    if (!isThemeId(theme)) return
    applyTheme(theme)
    set({ theme })
  },
}))

/** Non-hook accessor (main.tsx bootstrap, tests). */
export function getCurrentTheme(): ThemeId {
  return useThemeStore.getState().theme
}
