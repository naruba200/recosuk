import type { SupabaseClient } from '@supabase/supabase-js'
import type { GameMode } from './mode'
import { fetchBeatmapsetSummary } from './beatmapsets'

/**
 * Map feedback (M5, PLAN-v2 §M5): tried/skipped status + 1–5 rating
 * per user per beatmap, over Supabase with the RLS policies from
 * migration 001 (own rows only). The `mode` column is already in
 * the schema, so per-mode learning needs no migration.
 *
 * Guests never reach these functions — the UI gates on tier, and
 * guests have no auth user to write rows for. Every function takes
 * the client explicitly (null = unconfigured) and throws an Error
 * with the Supabase message on failure.
 *
 * LEARNING (rating → rating_boost, per mode): `computeRatingBoosts`
 * turns one mode's rated sets into a per-candidate score boost.
 * Only the mode being generated is ever loaded — ratings in mania
 * cannot leak into an osu! run, because the osu! run loads only
 * osu! feedback. The boost is a heuristic, documented below, and
 * is capped so learning steers the ranking without overriding the
 * PP-anchored score.
 */

export type FeedbackStatus = 'tried' | 'skipped'

export interface FeedbackEntry {
  id?: string
  user_id: string
  beatmap_id: number
  beatmapset_id: number | null
  mode: GameMode | null
  status: FeedbackStatus
  rating: number | null
  created_at?: string
}

type DbError = { message: string } | null

function requireClient(client: SupabaseClient | null): SupabaseClient {
  if (!client) throw new Error('Supabase is not connected — ratings need an account on a configured project.')
  return client
}

function throwIf(error: DbError, what: string): void {
  if (error) throw new Error(`${what}: ${error.message}`)
}

const FEEDBACK_COLS = 'id, user_id, beatmap_id, beatmapset_id, mode, status, rating, created_at'

export async function loadFeedbackForMode(
  client: SupabaseClient | null,
  userId: string,
  mode: GameMode,
): Promise<FeedbackEntry[]> {
  const db = requireClient(client)
  const { data, error } = await db
    .from('map_feedback')
    .select(FEEDBACK_COLS)
    .eq('user_id', userId)
    .eq('mode', mode)
    .order('created_at', { ascending: false })
  throwIf(error, 'Could not load your ratings')
  return (data ?? []) as FeedbackEntry[]
}

export async function loadAllFeedback(
  client: SupabaseClient | null,
  userId: string,
): Promise<FeedbackEntry[]> {
  const db = requireClient(client)
  const { data, error } = await db
    .from('map_feedback')
    .select(FEEDBACK_COLS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  throwIf(error, 'Could not load your tried & rated history')
  return (data ?? []) as FeedbackEntry[]
}

export async function loadFeedbackForBeatmap(
  client: SupabaseClient | null,
  userId: string,
  beatmapId: number,
): Promise<FeedbackEntry | null> {
  const db = requireClient(client)
  const { data, error } = await db
    .from('map_feedback')
    .select(FEEDBACK_COLS)
    .eq('user_id', userId)
    .eq('beatmap_id', beatmapId)
    // maybeSingle(): zero rows is the normal unrated case and
    // answers null with NO error — the old single() answered it
    // with PGRST116, which PostgREST surfaces as HTTP 406, so
    // every unrated row in a list spammed a 406 into the console
    // (batch 11, part 5). The PGRST116 tolerance below stays as
    // belt-and-braces for any client that still reports it.
    .maybeSingle()
  if (error && (error as { code?: string }).code !== 'PGRST116') {
    throwIf(error, 'Could not load your rating')
  }
  return (data ?? null) as FeedbackEntry | null
}

/**
 * Batched row lookup (batch 11, part 5): one loadFeedbackForMode /
 * loadAllFeedback call per list page, keyed by beatmap_id for the
 * rows to read without a query each. Pure — no I/O, fully tested.
 * Later entries win on a duplicate beatmap_id (the table's
 * user+beatmap uniqueness means duplicates should not occur).
 */
export function feedbackByBeatmapId(
  entries: FeedbackEntry[],
): Map<number, FeedbackEntry> {
  const map = new Map<number, FeedbackEntry>()
  for (const entry of entries) map.set(entry.beatmap_id, entry)
  return map
}

/**
 * Create or replace the row for one difficulty (unique on
 * user+beatmap). Rating null clears the stars while keeping the
 * tried/skipped status. `mode` records the mode the rating was
 * made in, so learning stays per-mode.
 */
export async function upsertFeedback(
  client: SupabaseClient | null,
  userId: string,
  input: {
    beatmapId: number
    beatmapsetId: number
    /** Null only for legacy rows written before mode was recorded. */
    mode: GameMode | null
    status: FeedbackStatus
    rating: number | null
  },
): Promise<FeedbackEntry> {
  const db = requireClient(client)
  if (input.rating !== null && (input.rating < 1 || input.rating > 5)) {
    throw new Error('Rating must be between 1 and 5.')
  }
  const { data, error } = await db
    .from('map_feedback')
    .upsert(
      {
        user_id: userId,
        beatmap_id: input.beatmapId,
        beatmapset_id: input.beatmapsetId,
        mode: input.mode,
        status: input.status,
        rating: input.rating,
      },
      { onConflict: 'user_id,beatmap_id' },
    )
    .select()
    .single()
  throwIf(error, 'Could not save your rating')
  if (!data) throw new Error('Could not save your rating: no row came back.')
  return data as FeedbackEntry
}

export async function deleteFeedback(
  client: SupabaseClient | null,
  userId: string,
  beatmapId: number,
): Promise<void> {
  const db = requireClient(client)
  const { error } = await db
    .from('map_feedback')
    .delete()
    .eq('user_id', userId)
    .eq('beatmap_id', beatmapId)
  throwIf(error, 'Could not remove your rating')
}

// ---------------------------------------------------------------------------
// Learning: feedback → per-candidate boost
// ---------------------------------------------------------------------------

/** One rated set, enriched with the features learning needs. */
export interface RatedSetFeatures {
  beatmapsetId: number
  rating: number
  tags: string[]
  /** SR of the rated difficulty (null when unresolvable — the SR
   * term then contributes nothing, but the direct/tag terms still
   * apply). */
  sr: number | null
}

export interface BoostCandidate {
  beatmapsetId: number
  tags: string[]
  sr: number
}

/** Heuristic weights (score points; the base score sums to ~100). */
export const RATING_BOOST_CAP = 12
const TAG_WEIGHT = 5
const SR_WEIGHT = 3
const DIRECT_WEIGHT = 4

/**
 * Per-candidate boost from ONE mode's rated sets (pure function —
 * no I/O, fully tested). Generation passes it as ScoreContext's
 * `boostFor`, so it is evaluated per candidate at scoring time.
 * For each rated set r with weight w = rating − 3 (5★ → +2,
 * 1★ → −2, 3★ → 0):
 * - the rated set itself gets w × DIRECT_WEIGHT (a 5★ map you have
 *   not excluded is worth re-serving; a 1★ map is pushed down);
 * - other candidates get w × (TAG_WEIGHT × shared-tag fraction +
 *   SR_WEIGHT × SR proximity), where the tag fraction caps at 3
 *   shared tags and SR proximity fades linearly to 0 at a 2★ gap.
 * Unrated (3★ / no-rating) entries contribute nothing. The total is
 * clamped to ±RATING_BOOST_CAP so learning steers, never overrides,
 * the PP-anchored ranking.
 */
export function boostForCandidate(
  rated: RatedSetFeatures[],
  c: BoostCandidate,
): number {
  let boost = 0
  for (const r of rated) {
    if (typeof r.rating !== 'number' || r.rating === 3) continue
    const w = r.rating - 3
    if (r.beatmapsetId === c.beatmapsetId) {
      boost += w * DIRECT_WEIGHT
      continue
    }
    const shared = r.tags.filter((t) => c.tags.includes(t)).length
    const tagTerm = TAG_WEIGHT * (Math.min(shared, 3) / 3)
    const srTerm =
      r.sr !== null ? SR_WEIGHT * Math.max(0, 1 - Math.abs(c.sr - r.sr) / 2) : 0
    boost += w * (tagTerm + srTerm)
  }
  const clamped = Math.max(-RATING_BOOST_CAP, Math.min(RATING_BOOST_CAP, boost))
  return Math.round(clamped * 10) / 10
}

/**
 * Load one mode's feedback and build the `boostFor` closure that
 * generation passes into scoring. Best-effort by design: any
 * failure (unconfigured client, no rows, enrichment down) yields
 * undefined — generation proceeds with no learning, never a
 * failure. Guests (no user id) always get undefined: the plan's
 * guest tier has no ratings, so `rating_boost` stays 0 for them.
 * Only the requested mode is loaded, so ratings can never leak
 * across modes.
 */
export async function loadModeBoostFor(
  client: SupabaseClient | null,
  userId: string | null | undefined,
  mode: GameMode,
): Promise<((c: BoostCandidate) => number) | undefined> {
  if (!client || !userId) return undefined
  try {
    const entries = await loadFeedbackForMode(client, userId, mode)
    if (entries.length === 0) return undefined
    const rated = await enrichRatedSets(entries)
    if (rated.length === 0) return undefined
    return (c) => boostForCandidate(rated, c)
  } catch {
    return undefined
  }
}
/**
 * Enrich rated entries with tags + rated-difficulty SR for learning.
 * Best-effort: a set whose metadata cannot be fetched (proxy not
 * redeployed yet, network) keeps its rating with empty tags and a
 * null SR, so its direct boost still applies and it never blocks
 * generation. Capped at the most recent 20 rated sets — learning
 * from the freshest signal, without a metadata call per rating.
 */
export async function enrichRatedSets(
  entries: FeedbackEntry[],
  opts: {
    fetchSummary?: (
      beatmapsetId: number,
      summaryOpts: { mode?: GameMode; beatmapId?: number },
    ) => Promise<{ tags: string[]; difficultySr: number | null } | null>
    limit?: number
  } = {},
): Promise<RatedSetFeatures[]> {
  const rated = entries.filter(
    (e): e is FeedbackEntry & { rating: number; beatmapset_id: number } =>
      typeof e.rating === 'number' && typeof e.beatmapset_id === 'number',
  )
  const limit = opts.limit ?? 20
  const fetchSummary =
    opts.fetchSummary ??
    ((beatmapsetId: number, summaryOpts: { mode?: GameMode; beatmapId?: number }) =>
      fetchBeatmapsetSummary(beatmapsetId, summaryOpts))
  const out: RatedSetFeatures[] = []
  for (const entry of rated.slice(0, limit)) {
    let tags: string[] = []
    let sr: number | null = null
    try {
      const summary = await fetchSummary(entry.beatmapset_id, {
        mode: entry.mode ?? undefined,
        beatmapId: entry.beatmap_id,
      })
      tags = summary?.tags ?? []
      sr = summary?.difficultySr ?? null
    } catch {
      /* enrichment is best-effort — direct boost still applies */
    }
    out.push({ beatmapsetId: entry.beatmapset_id, rating: entry.rating, tags, sr })
  }
  return out
}
