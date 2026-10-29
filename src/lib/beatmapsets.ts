import type { GameMode } from './mode'
import { proxyCall } from './osu'
import { splitTags, type SearchBeatmapset } from './recommend'

/**
 * Beatmapset metadata for M5 surfaces (list detail, Tried & Rated
 * rows, rating enrichment). The table rows store ids only, so titles,
 * covers, tags and SR ranges come from the osu! API via the proxy's
 * `getBeatmapset` action — the natural sibling of the existing
 * `getBeatmap` action, added to the Edge Function source in this
 * batch (mode-free; needs the same redeploy as the Collections pack
 * actions). Until that redeploy lands, the proxy answers 400 and
 * every lookup here returns null — callers fall back to id-only
 * rows and say so, never fabricating metadata.
 *
 * Summaries are static, so successful lookups are cached in memory
 * for the session (one fetch per set+mode+difficulty, however many
 * lists/rows reference it).
 */

export interface BeatmapsetSummary {
  id: number
  title: string
  artist: string
  creator: string
  cover?: string
  status: string
  /** Lowercased mapper tags (splitTags semantics). */
  tags: string[]
  /** SR range across the set's in-mode difficulties (null when none). */
  srMin: number | null
  srMax: number | null
  bpm: number | null
  lengthSec: number | null
  /** SR of one named difficulty (the rated one), when it exists. */
  difficultySr: number | null
}

const summaryCache = new Map<string, BeatmapsetSummary>()

/** Test hook: drop the in-memory summary cache. */
export function resetBeatmapsetSummaryCache(): void {
  summaryCache.clear()
}

/** Pure normalisation of a raw beatmapset payload (API shape). */
export function normalizeBeatmapsetSummary(
  raw: SearchBeatmapset,
  opts: { mode?: GameMode; beatmapId?: number } = {},
): BeatmapsetSummary {
  const diffs = (raw.beatmaps ?? []).filter((d) => !opts.mode || d.mode === opts.mode)
  const srs = diffs
    .map((d) => d.difficulty_rating)
    .filter((sr): sr is number => typeof sr === 'number' && Number.isFinite(sr))
  const named = opts.beatmapId !== undefined
    ? (raw.beatmaps ?? []).find((d) => d.id === opts.beatmapId)
    : undefined
  const first = diffs[0]
  return {
    id: raw.id,
    title: raw.title,
    artist: raw.artist,
    creator: raw.creator,
    cover: raw.covers?.card ?? raw.covers?.cover,
    status: raw.status,
    tags: splitTags(raw.tags),
    srMin: srs.length > 0 ? Math.min(...srs) : null,
    srMax: srs.length > 0 ? Math.max(...srs) : null,
    bpm: typeof first?.bpm === 'number' ? first.bpm : null,
    lengthSec: typeof first?.total_length === 'number' ? first.total_length : null,
    difficultySr:
      typeof named?.difficulty_rating === 'number' ? named.difficulty_rating : null,
  }
}

export async function fetchBeatmapsetSummary(
  beatmapsetId: number,
  opts: { mode?: GameMode; beatmapId?: number; call?: typeof proxyCall } = {},
): Promise<BeatmapsetSummary | null> {
  // Mode/beatmap-scoped key: the SR range and difficultySr depend
  // on which mode/difficulty was asked for.
  const cacheKey = `${beatmapsetId}:${opts.mode ?? ''}:${opts.beatmapId ?? ''}`
  const cached = summaryCache.get(cacheKey)
  if (cached) return cached
  const call = opts.call ?? proxyCall
  try {
    const raw = await call<SearchBeatmapset>('getBeatmapset', { beatmapsetId })
    if (!raw || typeof raw.id !== 'number') return null
    const summary = normalizeBeatmapsetSummary(raw, {
      mode: opts.mode,
      beatmapId: opts.beatmapId,
    })
    summaryCache.set(cacheKey, summary)
    return summary
  } catch {
    // Unknown action (proxy not redeployed yet), network, or a
    // malformed payload — the caller shows the id-only fallback.
    return null
  }
}
