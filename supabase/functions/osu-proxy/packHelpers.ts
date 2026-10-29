// Pure, runtime-agnostic helpers for the beatmap-packs proxy actions
// (`getBeatmapPacks` / `getBeatmapPack` in index.ts). Imported by both
// Deno (the Edge Function) and vitest (Node) — no Deno or Node APIs,
// no imports, so the same code is unit-tested and deployed.
//
// RESEARCHED FACTS (osu! API docs, "Get Beatmap Packs" / BeatmapPack /
// BeatmapPackType, verified 2026-10-29):
// - `GET /beatmaps/packs` takes `type` (a BeatmapPackType NAME, not a
//   letter) and defaults to `standard` when omitted. The seven types
//   are: standard, featured, tournament, loved, chart, theme, artist.
// - `GET /beatmaps/packs` also accepts `cursor_string` for pagination.
//   The response body is returned verbatim, so a response cursor (when
//   present) reaches the client untouched.
// - `GET /beatmaps/packs/{pack}` takes the pack TAG verbatim — e.g.
//   `ST445` reaches upstream as `/beatmaps/packs/ST445`.
// The client-side twin of the type names lives in src/lib/packs.ts
// (PACK_CATEGORIES / PACK_CATEGORY_LABELS); the two lists must name
// the same seven types.

/** The seven documented BeatmapPackType names. */
export const PACK_TYPE_NAMES = [
  'standard',
  'featured',
  'tournament',
  'loved',
  'chart',
  'theme',
  'artist',
] as const

export type PackTypeName = (typeof PACK_TYPE_NAMES)[number]

/** Thrown by resolvePackListType for an invalid `type` value. The
 * Edge Function converts this to a 400 naming the valid values. */
export class PackListError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PackListError'
  }
}

/**
 * Resolve the `type` param for `GET /beatmaps/packs`. Absent/empty
 * means the documented default, `standard`. Anything else must be
 * one of the seven documented names — an invalid value is a caller
 * bug and must fail loudly, never silently fetch the wrong category.
 */
export function resolvePackListType(value: unknown): PackTypeName {
  if (value === undefined || value === null || value === '') return 'standard'
  if (typeof value === 'string' && (PACK_TYPE_NAMES as readonly string[]).includes(value)) {
    return value as PackTypeName
  }
  throw new PackListError(
    `type must be one of: ${PACK_TYPE_NAMES.join(', ')} (default: standard)`,
  )
}

/**
 * Upstream path for the packs list. `cursor_string` is passed
 * through only when it is a non-empty string; the body (including
 * any response cursor) is returned verbatim by the caller.
 */
export function buildBeatmapPacksPath(type: PackTypeName, cursorString: unknown): string {
  const search = new URLSearchParams({ type })
  if (typeof cursorString === 'string' && cursorString.trim() !== '') {
    search.set('cursor_string', cursorString)
  }
  return `/beatmaps/packs?${search.toString()}`
}

/**
 * Upstream path for one pack. The tag is sent VERBATIM (only
 * reserved characters are escaped): `ST445` stays `ST445`.
 */
export function buildBeatmapPackDetailPath(tag: string): string {
  return `/beatmaps/packs/${encodeURIComponent(tag)}`
}
