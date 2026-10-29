/** @type {import('tailwindcss').Config} */
// Merged config: RecOsuk plan tokens (stage/panel/paper/recpink/modes/stargold/hitgreen,
// display/sans font families) kept alongside the full Stitch DESIGN.md extend config
// extracted to stitch-tailwind-config.raw.txt (colors, borderRadius, spacing,
// fontFamily, fontSize). Stitch values win on shared keys (they are the exported design tokens).
//
// THEMING (batch 11): theme-varying tokens are CSS variables defined
// per `[data-theme]` block in src/index.css (`--c-<token>`, RGB
// triplets). Each colour below resolves through
// `rgb(var(--c-<token>) / <alpha-value>)` so Tailwind opacity
// modifiers (`bg-primary/20`, `text-secondary/80`, …) keep working
// and every token class re-tints when the theme changes. Dark Stage
// values in index.css are the pre-theme hexes verbatim, so the
// default theme is pixel-identical to this config's old values.
// FIXED tokens (brand/semantic, identical in every theme — see
// src/lib/themes.ts): recpink, stargold, hitgreen, modes.*, and the
// error family stay as literal hexes here.
const themeVar = (name) => `rgb(var(--c-${name}) / <alpha-value>)`
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      "colors": {
            "stage": themeVar('stage'),
            "panel": themeVar('panel'),
            "paper": themeVar('paper'),
            "recpink": "#FF66AA",
            "stargold": "#FFCC22",
            "hitgreen": "#7EE787",
            "modes": {
                  "osu": "#FF66AA",
                  "taiko": "#FF5C39",
                  "fruits": "#4CC3FF",
                  "mania": "#9D6BFF"
            },
            "surface-variant": themeVar('surface-variant'),
            "secondary-fixed": themeVar('secondary-fixed'),
            "primary-fixed-dim": themeVar('primary-fixed-dim'),
            "on-error": "#690005",
            "on-primary": themeVar('on-primary'),
            "tertiary-fixed-dim": themeVar('tertiary-fixed-dim'),
            "outline-variant": themeVar('outline-variant'),
            "outline": themeVar('outline'),
            "on-secondary-fixed-variant": themeVar('on-secondary-fixed-variant'),
            "surface-bright": themeVar('surface-bright'),
            "error-container": "#93000a",
            "surface-container-highest": themeVar('surface-container-highest'),
            "on-surface": themeVar('on-surface'),
            "on-tertiary-fixed-variant": themeVar('on-tertiary-fixed-variant'),
            "on-secondary": themeVar('on-secondary'),
            "inverse-on-surface": themeVar('inverse-on-surface'),
            "on-tertiary": themeVar('on-tertiary'),
            "primary-fixed": themeVar('primary-fixed'),
            "on-primary-fixed": themeVar('on-primary-fixed'),
            "secondary": themeVar('secondary'),
            "tertiary-container": themeVar('tertiary-container'),
            "inverse-primary": themeVar('inverse-primary'),
            "on-tertiary-container": themeVar('on-tertiary-container'),
            "secondary-fixed-dim": themeVar('secondary-fixed-dim'),
            "surface-dim": themeVar('surface-dim'),
            "error": "#ffb4ab",
            "on-surface-variant": themeVar('on-surface-variant'),
            "primary": themeVar('primary'),
            "on-secondary-container": themeVar('on-secondary-container'),
            "secondary-container": themeVar('secondary-container'),
            "primary-container": themeVar('primary-container'),
            "tertiary": themeVar('tertiary'),
            "on-error-container": "#ffdad6",
            "background": themeVar('background'),
            "on-primary-fixed-variant": themeVar('on-primary-fixed-variant'),
            "surface-container-lowest": themeVar('surface-container-lowest'),
            "surface-container": themeVar('surface-container'),
            "tertiary-fixed": themeVar('tertiary-fixed'),
            "on-background": themeVar('on-background'),
            "surface-tint": themeVar('surface-tint'),
            "on-secondary-fixed": themeVar('on-secondary-fixed'),
            "inverse-surface": themeVar('inverse-surface'),
            "surface": themeVar('surface'),
            "on-primary-container": themeVar('on-primary-container'),
            "surface-container-low": themeVar('surface-container-low'),
            "on-tertiary-fixed": themeVar('on-tertiary-fixed'),
            "surface-container-high": themeVar('surface-container-high')
      },
      "borderRadius": {
            "DEFAULT": "1rem",
            "lg": "2rem",
            "xl": "3rem",
            "full": "9999px"
      },
      "spacing": {
            "space-sm": "0.5rem",
            "margin": "2rem",
            "gutter-mobile": "0.75rem",
            "space-xs": "0.25rem",
            "space-lg": "1.5rem",
            "gutter": "1.25rem",
            "space-xl": "2.5rem",
            "margin-mobile": "1rem",
            "space-md": "1rem"
      },
      "fontFamily": {
            "label-sm": [
                  "Inter"
            ],
            "headline-xl": [
                  "Outfit"
            ],
            "metric-sm": [
                  "Outfit"
            ],
            "headline-lg-mobile": [
                  "Outfit"
            ],
            "body-lg": [
                  "Inter"
            ],
            "headline-md": [
                  "Outfit"
            ],
            "headline-sm": [
                  "Outfit"
            ],
            "body-sm": [
                  "Inter"
            ],
            "body-md": [
                  "Inter"
            ],
            "metric-display": [
                  "Outfit"
            ],
            "headline-xl-mobile": [
                  "Outfit"
            ],
            "headline-lg": [
                  "Outfit"
            ],
            "display": [
                  "Outfit",
                  "sans-serif"
            ],
            "sans": [
                  "Inter",
                  "sans-serif"
            ],
            "outfit": [
                  "Outfit",
                  "sans-serif"
            ],
            "inter": [
                  "Inter",
                  "sans-serif"
            ]
      },
      "fontSize": {
            "label-sm": [
                  "11px",
                  {
                        "lineHeight": "16px",
                        "fontWeight": "600"
                  }
            ],
            "headline-xl": [
                  "48px",
                  {
                        "lineHeight": "56px",
                        "letterSpacing": "-0.02em",
                        "fontWeight": "800"
                  }
            ],
            "metric-sm": [
                  "20px",
                  {
                        "lineHeight": "24px",
                        "fontWeight": "700"
                  }
            ],
            "headline-lg-mobile": [
                  "24px",
                  {
                        "lineHeight": "32px",
                        "letterSpacing": "-0.015em",
                        "fontWeight": "800"
                  }
            ],
            "body-lg": [
                  "16px",
                  {
                        "lineHeight": "24px",
                        "fontWeight": "400"
                  }
            ],
            "headline-md": [
                  "24px",
                  {
                        "lineHeight": "32px",
                        "fontWeight": "700"
                  }
            ],
            "headline-sm": [
                  "18px",
                  {
                        "lineHeight": "26px",
                        "fontWeight": "700"
                  }
            ],
            "body-sm": [
                  "12px",
                  {
                        "lineHeight": "18px",
                        "fontWeight": "400"
                  }
            ],
            "body-md": [
                  "14px",
                  {
                        "lineHeight": "20px",
                        "fontWeight": "400"
                  }
            ],
            "metric-display": [
                  "40px",
                  {
                        "lineHeight": "44px",
                        "letterSpacing": "-0.02em",
                        "fontWeight": "800"
                  }
            ],
            "headline-xl-mobile": [
                  "32px",
                  {
                        "lineHeight": "40px",
                        "letterSpacing": "-0.02em",
                        "fontWeight": "800"
                  }
            ],
            "label-md": [
                  "13px",
                  {
                        "lineHeight": "18px",
                        "fontWeight": "600"
                  }
            ],
            "headline-lg": [
                  "32px",
                  {
                        "lineHeight": "40px",
                        "letterSpacing": "-0.015em",
                        "fontWeight": "800"
                  }
            ]
      }
},
  },
  plugins: [],
}
