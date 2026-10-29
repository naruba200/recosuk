import { proxyCall } from './osu'
import { dataCache } from './dataCache'
import type { GameMode } from './mode'

/**
 * Beatmap packs for the Collections page.
 *
 * RESEARCHED FACTS (osu! API docs, verified 2026-10-29 — implement
 * from these, not from guesses):
 *
 * - BeatmapPack object fields: `author`, `date` (Timestamp), `name`,
 *   `no_diff_reduction`, `ruleset_id` (integer), `tag`, `url`;
 *   optional `beatmapsets`, `user_completion_data`. `url` is "The
 *   download url of the beatmap pack."
 * - List endpoint `GET /beatmaps/packs` takes `type` (a
 *   BeatmapPackType NAME — standard, featured, tournament, loved,
 *   chart, theme, artist) and DEFAULTS to `standard` when omitted,
 *   plus `cursor_string` for pagination. The response body is
 *   returned verbatim, so a response cursor (when present) reaches
 *   the client. Previously the list call passed NO `type`, so only
 *   `standard` packs ever loaded.
 * - Detail endpoint `GET /beatmaps/packs/{pack}` takes the tag
 *   VERBATIM (e.g. `ST445`).
 * - The tag "starts with a character representing the type (see the
 *   Tag column of BeatmapPackType) followed by an integer" — but the
 *   docs' description is INCOMPLETE: live tags include two-letter
 *   forms `ST445`, `SM385`, `SC172` alongside `S1888` (observed on
 *   osu.ppy.sh/beatmaps/packs/, 2026-10-29). The second letter is
 *   the mode signal in the wild (T=taiko, M=mania, C=catch, bare
 *   S=osu!/default). It is recorded as OBSERVED, never as the mode
 *   source of truth: `ruleset_id` wins on any conflict.
 * - BeatmapPackType letters (docs, authoritative): standard=S,
 *   featured=F, tournament=P, loved=L, chart=R, theme=T, artist=A.
 * - The old Weekly/Monthly/Yearly grouping was an INVENTED
 *   heuristic over name text. The real grouping is by TYPE (the
 *   seven categories above). It is gone.
 *
 * SOURCE HONESTY: BeatConnect's own pack API needs a supporter key
 * (its API docs tie access to an active Patreon subscription, and its
 * API page reports the API closed), so RecOsuk lists the PUBLIC osu!
 * beatmap packs instead, via the proxy's `getBeatmapPacks` /
 * `getBeatmapPack` actions (osu! API v2 `GET /beatmaps/packs`). Pack
 * names, tags and contents come from that API — nothing is
 * fabricated.
 *
 * The proxy half needs a redeploy to take effect
 * (`supabase functions deploy osu-proxy --no-verify-jwt`); until
 * then the page shows its honest error state + sample packs.
 */

/** The seven documented pack categories (BeatmapPackType names). */
export type PackCategory =
  | 'standard'
  | 'featured'
  | 'tournament'
  | 'loved'
  | 'chart'
  | 'theme'
  | 'artist'

export const PACK_CATEGORIES: PackCategory[] = [
  'standard',
  'featured',
  'tournament',
  'loved',
  'chart',
  'theme',
  'artist',
]

export const PACK_CATEGORY_LABELS: Record<PackCategory, string> = {
  standard: 'Standard',
  featured: 'Featured',
  tournament: 'Tournament',
  loved: 'Loved',
  chart: 'Chart',
  theme: 'Theme',
  artist: 'Artist',
}

/** A pack's category as read from its tag; `unknown` when the tag
 * does not match any documented form — never dropped, just unlabelled. */
export type PackType = PackCategory | 'unknown'

/** First tag letter → category (docs, BeatmapPackType Tag column). */
const PACK_TAG_LETTER_TO_TYPE: Record<string, PackCategory> = {
  S: 'standard',
  F: 'featured',
  P: 'tournament',
  L: 'loved',
  R: 'chart',
  T: 'theme',
  A: 'artist',
}

export interface ParsedPackTag {
  /** Category from the tag's FIRST character. */
  type: PackType
  /** The integer after the letter(s), when present. */
  number: number | null
  /** The OBSERVED second letter (T/M/C) in two-letter standard tags
   * such as ST445/SM385/SC172 — corroboration/display only, NEVER
   * the mode source of truth (`ruleset_id` wins on any conflict). */
  modeLetter: 'T' | 'M' | 'C' | null
}

const PACK_TAG_RE = /^([SFPLRTA])([TCM]?)(\d+)$/i

/**
 * Parse a pack tag. Handles the documented single-letter form
 * (`S1888`) AND the observed two-letter standard form (`ST445`).
 * Garbage, empty, and non-string input parse to `unknown` — never
 * throw. The tag itself is kept verbatim elsewhere; this only reads it.
 */
export function parsePackTag(tag: unknown): ParsedPackTag {
  const fallback: ParsedPackTag = { type: 'unknown', number: null, modeLetter: null }
  if (typeof tag !== 'string') return fallback
  const match = PACK_TAG_RE.exec(tag.trim())
  if (!match) return fallback
  const typeLetter = match[1].toUpperCase()
  return {
    type: PACK_TAG_LETTER_TO_TYPE[typeLetter] ?? 'unknown',
    number: Number(match[3]),
    modeLetter: match[2] ? (match[2].toUpperCase() as 'T' | 'M' | 'C') : null,
  }
}

/**
 * Mode from the documented `ruleset_id` integer: 0→osu, 1→taiko,
 * 2→fruits (Catch), 3→mania — the same ids the app already uses.
 * Anything else (absent, non-integer, out of range) is unknown.
 * This is the ONLY mode source of truth for packs; the tag's
 * second letter is corroboration only.
 */
export function packModeFromRuleset(rulesetId: unknown): GameMode | null {
  if (typeof rulesetId !== 'number' || !Number.isInteger(rulesetId)) return null
  switch (rulesetId) {
    case 0:
      return 'osu'
    case 1:
      return 'taiko'
    case 2:
      return 'fruits'
    case 3:
      return 'mania'
    default:
      return null
  }
}

export interface BeatmapPack {
  /** Pack tag, e.g. the identifier the detail endpoint takes — kept
   * verbatim, always (`ST445` stays `ST445`). */
  tag: string
  name: string
  /** The pack's download URL (single archive), when the API provides
   * one — osu! API docs, BeatmapPack object: `url` is "The download
   * url of the beatmap pack." Absent on list entries that carry no
   * archive link; the Download button then falls back to per-map. */
  url?: string
  /** Release date string, when the API provides one. */
  date?: string
  /** Beatmapset ids in the pack (empty until the detail call fills them). */
  beatmapsetIds: number[]
  /** Title/artist per set, when the payload carries them (used for
   *  Songs-folder filenames; absent entries fall back to the id). */
  setMeta?: { id: number; artist: string; title: string }[]
  /** The documented `ruleset_id`, or null when absent/not an integer. */
  rulesetId: number | null
  /** Category read from the tag's first character. */
  packType: PackType
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function toIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  const ids: number[] = []
  for (const entry of value) {
    if (typeof entry === 'number' && Number.isFinite(entry)) {
      ids.push(entry)
    } else {
      const rec = asRecord(entry)
      if (rec && typeof rec.id === 'number' && Number.isFinite(rec.id)) ids.push(rec.id)
    }
  }
  return [...new Set(ids)]
}

/**
 * Normalize one raw pack object. Returns null when the entry carries
 * no usable tag/name at all — a single bad entry must never break
 * the list.
 */
export function normalizePack(raw: unknown): BeatmapPack | null {
  const rec = asRecord(raw)
  if (!rec) return null
  const tag = typeof rec.tag === 'string' ? rec.tag : null
  const name = typeof rec.name === 'string' ? rec.name : null
  if (!tag && !name) return null
  const effectiveTag = tag ?? (name as string)
  const ids = toIds(rec.beatmapsets ?? rec.beatmapset_ids)
  const setMeta: { id: number; artist: string; title: string }[] = []
  if (Array.isArray(rec.beatmapsets)) {
    for (const entry of rec.beatmapsets) {
      const set = asRecord(entry)
      if (
        set &&
        typeof set.id === 'number' &&
        typeof set.artist === 'string' &&
        typeof set.title === 'string'
      ) {
        setMeta.push({ id: set.id, artist: set.artist, title: set.title })
      }
    }
  }
  const rulesetId =
    typeof rec.ruleset_id === 'number' && Number.isInteger(rec.ruleset_id)
      ? rec.ruleset_id
      : null
  return {
    tag: effectiveTag,
    name: name ?? (tag as string),
    url: typeof rec.url === 'string' ? rec.url : undefined,
    date: typeof rec.date === 'string' ? rec.date : undefined,
    beatmapsetIds: ids,
    setMeta: setMeta.length > 0 ? setMeta : undefined,
    rulesetId,
    packType: parsePackTag(effectiveTag).type,
  }
}

export interface NormalizedPackListPage {
  packs: BeatmapPack[]
  /** The response `cursor_string` when the payload carries one;
   * null when the list is complete (or the payload has no cursor). */
  cursor: string | null
}

/** Normalize a packs-list payload AND preserve its pagination
 * cursor. The documented shape comes first: `GET /beatmaps/packs`
 * returns `{ beatmap_packs: BeatmapPack[] }` (osu! API docs, "Get
 * Beatmap Packs"). A bare array and the legacy `{ packs: [...] }`
 * envelope are kept for compat. */
export function normalizePackListPage(payload: unknown): NormalizedPackListPage {
  let list: unknown = null
  let cursor: string | null = null
  if (Array.isArray(payload)) {
    list = payload
  } else {
    const rec = asRecord(payload)
    if (rec) {
      list = Array.isArray(rec.beatmap_packs) ? rec.beatmap_packs : rec.packs
      cursor =
        typeof rec.cursor_string === 'string' && rec.cursor_string !== ''
          ? rec.cursor_string
          : null
    }
  }
  if (!Array.isArray(list)) return { packs: [], cursor }
  const packs: BeatmapPack[] = []
  for (const entry of list) {
    const pack = normalizePack(entry)
    if (pack) packs.push(pack)
  }
  return { packs, cursor }
}

/** Normalize a packs-list payload, cursor discarded (see
 * normalizePackListPage for the paged form). */
export function normalizePackList(payload: unknown): BeatmapPack[] {
  return normalizePackListPage(payload).packs
}

/** Plain calendar date for display: the API `date` is an ISO
 * timestamp (`2025-01-01T00:00:00+00:00`); show just the date part.
 * Anything that is not ISO-shaped is shown as-is — never invented. */
export function packDateLabel(date: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(date)
  return match ? match[1] : date
}

/** Mode filter for the packs list. `all` shows everything; a
 * specific mode shows its packs PLUS packs whose mode is unknown
 * (absent/out-of-range `ruleset_id`) — an unknown mode is never
 * hidden by the filter. */
export type PackModeFilter = GameMode | 'all'

export function packVisibleForMode(pack: BeatmapPack, filter: PackModeFilter): boolean {
  if (filter === 'all') return true
  const mode = packModeFromRuleset(pack.rulesetId)
  return mode === null || mode === filter
}

/** Packs shown before "Show more" (batch 12, part 10). */
export const PACKS_PAGE_SIZE = 12

/**
 * Client-side chunking over the buffered list, in fetch order.
 * "Show more" reveals the next chunk of what was already fetched;
 * cursor pages (see fetchBeatmapPacksPage) extend the buffer.
 * Returns the visible slice plus how many packs remain hidden.
 */
export function paginatePackList(
  packs: BeatmapPack[],
  shown: number,
): { visible: BeatmapPack[]; remaining: number } {
  const visible = packs.slice(0, Math.max(0, shown))
  return { visible, remaining: Math.max(0, packs.length - visible.length) }
}

/** How a pack's Download button behaves (batch 12, part 10). */
export type PackDownloadKind = 'archive' | 'all-maps'

/** 'archive' when the API provides the pack download URL, else
 * per-map sequential download. Never guessed: only a present,
 * non-empty `url` counts as an archive. */
export function packDownloadKind(pack: BeatmapPack): PackDownloadKind {
  return pack.url ? 'archive' : 'all-maps'
}

/** Button label that matches the behaviour exactly: the archive
 * case says "Download pack", the per-map case names the count once
 * the contents are known. */
export function packDownloadLabel(pack: BeatmapPack): string {
  if (pack.url) return 'Download pack'
  if (pack.beatmapsetIds.length > 0) {
    return `Download all (${pack.beatmapsetIds.length} maps)`
  }
  return 'Download all maps'
}

const PACKS_TTL_MS = 60 * 60 * 1000
const PACK_DETAIL_TTL_MS = 60 * 60 * 1000
/** An empty list is almost certainly transient (a busy proxy, a
 * hiccup upstream) — caching it for the full hour would freeze the
 * Collections page on "try again in a moment" for up to an hour
 * with no retry able to help. Empty results get 60s at most. */
export const PACKS_EMPTY_TTL_MS = 60 * 1000

interface PackListCacheEntry {
  packs: BeatmapPack[]
  cursor: string | null
}

/**
 * One page of one pack category, merged into the buffered per-type
 * list. Cache key includes the TYPE (each category has its own
 * buffer + cursor); the cursor is stored alongside the merged list,
 * never as part of the key — a cursor page fetched after its cache
 * entry expired simply starts a fresh buffer. `fresh` replaces the
 * buffer; a cursor fetch appends to it (deduped by tag).
 */
export async function fetchBeatmapPacksPage(opts: {
  type?: PackCategory
  fresh?: boolean
  cursor?: string
} = {}): Promise<{ packs: BeatmapPack[]; cursor: string | null }> {
  const type = opts.type ?? 'standard'
  const key = `packs:list:${type}`
  const cursor = opts.cursor ?? null
  if (!opts.fresh && !cursor) {
    const hit = dataCache.get<PackListCacheEntry>(key)
    if (hit) return hit
  }
  const params: Record<string, unknown> = { type }
  if (cursor) params.cursor_string = cursor
  const page = normalizePackListPage(await proxyCall<unknown>('getBeatmapPacks', params))
  const prev =
    cursor && !opts.fresh ? dataCache.get<PackListCacheEntry>(key) : undefined
  const seen = new Set<string>()
  const merged: BeatmapPack[] = []
  for (const pack of [...(prev?.packs ?? []), ...page.packs]) {
    if (seen.has(pack.tag)) continue
    seen.add(pack.tag)
    merged.push(pack)
  }
  const entry: PackListCacheEntry = { packs: merged, cursor: page.cursor }
  dataCache.set(key, entry, merged.length === 0 ? PACKS_EMPTY_TTL_MS : PACKS_TTL_MS)
  return entry
}

/** The pack list for one category (default `standard`), cached for
 * an hour; an empty list is cached for 60s only (see
 * PACKS_EMPTY_TTL_MS). Convenience wrapper over
 * fetchBeatmapPacksPage for callers that only need the packs. */
export async function fetchBeatmapPacks(opts: {
  type?: PackCategory
  fresh?: boolean
} = {}): Promise<BeatmapPack[]> {
  const entry = await fetchBeatmapPacksPage(opts)
  return entry.packs
}

/** One pack with its beatmapset ids filled in (cached per tag). */
export async function fetchBeatmapPack(
  tag: string,
  opts: { fresh?: boolean } = {},
): Promise<BeatmapPack | null> {
  const key = `packs:detail:${tag}`
  if (!opts.fresh) {
    const hit = dataCache.get<BeatmapPack>(key)
    if (hit) return hit
  }
  const pack = normalizePack(await proxyCall<unknown>('getBeatmapPack', { pack: tag }))
  if (pack) dataCache.set(key, pack, PACK_DETAIL_TTL_MS)
  return pack
}
