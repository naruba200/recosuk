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
  /** Link to the pack's page, when the API provides one. */
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

/** Normalize a packs-list payload (array or `{ packs: [...] }`). */
export function normalizePackList(payload: unknown): BeatmapPack[] {
  const rec = asRecord(payload)
  const list = Array.isArray(payload) ? payload : rec ? rec.packs : null
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

const PACKS_TTL_MS = 60 * 60 * 1000
const PACK_DETAIL_TTL_MS = 60 * 60 * 1000

/** The pack list, cached for an hour (packs change weekly at most). */
export async function fetchBeatmapPacks(opts: { fresh?: boolean } = {}): Promise<BeatmapPack[]> {
  const key = 'packs:list'
  if (!opts.fresh) {
    const hit = dataCache.get<BeatmapPack[]>(key)
    if (hit) return hit
  }
  const packs = normalizePackList(await proxyCall<unknown>('getBeatmapPacks', {}))
  dataCache.set(key, packs, PACKS_TTL_MS)
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
