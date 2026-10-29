import { proxyCall } from './osu'
import { dataCache } from './dataCache'

/**
 * Beatmap packs for the Collections page (QA batch 2, item 6).
 *
 * SOURCE HONESTY: BeatConnect's own pack API needs a supporter key
 * (its API docs tie access to an active Patreon subscription, and its
 * API page reports the API closed), so RecOsuk lists the PUBLIC osu!
 * beatmap packs instead, via the proxy's `getBeatmapPacks` /
 * `getBeatmapPack` actions (osu! API v2 `GET /beatmaps/packs`). Pack
 * names, tags and contents come from that API — nothing is
 * fabricated. The Weekly / Monthly / Yearly grouping is a
 * presentational heuristic over the pack names/tags (see
 * packPeriod): osu!'s packs are not themselves period-labelled.
 *
 * The proxy half needs a redeploy to take effect
 * (`supabase functions deploy osu-proxy --no-verify-jwt`); until
 * then the page shows its honest error state + sample packs.
 */

export type PackPeriod = 'weekly' | 'monthly' | 'yearly' | 'curated'

export const PACK_PERIOD_ORDER: PackPeriod[] = ['weekly', 'monthly', 'yearly', 'curated']

export const PACK_PERIOD_LABELS: Record<PackPeriod, string> = {
  weekly: 'Weekly packs',
  monthly: 'Monthly packs',
  yearly: 'Yearly packs',
  curated: 'Curated packs',
}

export interface BeatmapPack {
  /** Pack tag, e.g. the identifier the detail endpoint takes. */
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
  return {
    tag: tag ?? name as string,
    name: name ?? (tag as string),
    url: typeof rec.url === 'string' ? rec.url : undefined,
    date: typeof rec.date === 'string' ? rec.date : undefined,
    beatmapsetIds: ids,
    setMeta: setMeta.length > 0 ? setMeta : undefined,
  }
}

/** Normalize a packs-list payload. The documented shape comes first:
 * `GET /beatmaps/packs` returns `{ beatmap_packs: BeatmapPack[] }`
 * (osu! API docs, "Get Beatmap Packs"). A bare array and the legacy
 * `{ packs: [...] }` envelope are kept for compat. */
export function normalizePackList(payload: unknown): BeatmapPack[] {
  let list: unknown = null
  if (Array.isArray(payload)) {
    list = payload
  } else {
    const rec = asRecord(payload)
    if (rec) {
      list = Array.isArray(rec.beatmap_packs) ? rec.beatmap_packs : rec.packs
    }
  }
  if (!Array.isArray(list)) return []
  const packs: BeatmapPack[] = []
  for (const entry of list) {
    const pack = normalizePack(entry)
    if (pack) packs.push(pack)
  }
  return packs
}

/**
 * Presentational period grouping from the pack's name/tag text.
 * "Weekly"/"monthly"/"yearly" (or a 4-digit year) in the text wins;
 * anything else is Curated. This labels REAL packs; it never invents
 * a pack or a date.
 */
export function packPeriod(pack: BeatmapPack): PackPeriod {
  const text = `${pack.name} ${pack.tag}`.toLowerCase()
  if (/\bweek(ly)?\b/.test(text)) return 'weekly'
  if (/\bmonth(ly)?\b/.test(text)) return 'monthly'
  if (/\byear(ly)?\b/.test(text) || /\b(19|20)\d{2}\b/.test(text)) return 'yearly'
  return 'curated'
}

export function groupPacks(packs: BeatmapPack[]): Record<PackPeriod, BeatmapPack[]> {
  const grouped: Record<PackPeriod, BeatmapPack[]> = {
    weekly: [],
    monthly: [],
    yearly: [],
    curated: [],
  }
  for (const pack of packs) grouped[packPeriod(pack)].push(pack)
  return grouped
}

/** Packs shown before "Show more" (batch 12, part 10). */
export const PACKS_PAGE_SIZE = 12

/**
 * Client-side chunking over the fetched list, in period order
 * (weekly → monthly → yearly → curated). The packs API carries no
 * next-page cursor in its response (the docs list only
 * `beatmap_packs`), so there is nothing to fetch on demand —
 * "Show more" reveals the next chunk of what was already fetched.
 * Returns the visible slice plus how many packs remain hidden.
 */
export function paginatePackList(
  packs: BeatmapPack[],
  shown: number,
): { visible: BeatmapPack[]; remaining: number } {
  const grouped = groupPacks(packs)
  const ordered = PACK_PERIOD_ORDER.flatMap((period) => grouped[period])
  const visible = ordered.slice(0, Math.max(0, shown))
  return { visible, remaining: Math.max(0, ordered.length - visible.length) }
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

/** The pack list, cached for an hour (packs change weekly at most);
 * an empty list is cached for 60s only (see PACKS_EMPTY_TTL_MS). */
export async function fetchBeatmapPacks(opts: { fresh?: boolean } = {}): Promise<BeatmapPack[]> {
  const key = 'packs:list'
  if (!opts.fresh) {
    const hit = dataCache.get<BeatmapPack[]>(key)
    if (hit) return hit
  }
  const packs = normalizePackList(await proxyCall<unknown>('getBeatmapPacks', {}))
  dataCache.set(key, packs, packs.length === 0 ? PACKS_EMPTY_TTL_MS : PACKS_TTL_MS)
  return packs
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
