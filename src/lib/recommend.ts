import { proxyCall } from './osu'
import { dataCache } from './dataCache'
import type { GameMode } from './mode'
import { modeLabel } from './mode'
import type { SkillProfile } from './skillProfile'
import { gapReason } from './interpretations'
import { isHardSeen, type SeenState } from './seenStore'

/**
 * Recommendation engine (PLAN-v2 §3 + §13).
 *
 * RANKING HONESTY: this is a *windowed* ranking, not a global one. The
 * osu! search API is cursor-paginated, so we fetch a candidate window
 * (a few search pages around the player's comfort band), score every
 * candidate in that window with one deterministic function, and serve
 * the best of the window. Ordering is exact *within the window*; we
 * never claim the #1 result is the globally best map on osu!.
 *
 * Score shape (§3): pp_relevance + gap_fit + tag_match + a per-mode
 * term (bpm_fit | ar_fit | key_match), minus a played penalty.
 * rating_boost exists in the formula but is 0 for everyone in v1 —
 * ratings land in M5 (guests can never have one, §6).
 */

// ---------------------------------------------------------------------------
// Search payload shapes (proxy → osu! beatmapsets/search)
// ---------------------------------------------------------------------------

export interface SearchDifficulty {
  id: number
  mode: string
  version: string
  difficulty_rating: number
  bpm?: number
  total_length?: number
  cs?: number
  ar?: number
  od?: number
}

export interface SearchBeatmapset {
  id: number
  title: string
  artist: string
  creator: string
  status: string
  play_count?: number
  favourite_count?: number
  tags?: string
  covers?: { card?: string; cover?: string; list?: string }
  beatmaps?: SearchDifficulty[]
}

export interface SearchPage {
  beatmapsets: SearchBeatmapset[]
  cursor_string?: string | null
  total?: number
}

// ---------------------------------------------------------------------------
// Candidates + filters
// ---------------------------------------------------------------------------

export interface RecCandidate {
  beatmapsetId: number
  beatmapId: number
  title: string
  artist: string
  creator: string
  version: string
  cover?: string
  sr: number
  bpm: number
  lengthSec: number
  cs: number
  ar: number
  od: number
  tags: string[]
  status: string
  playCount: number
  favouriteCount: number
  /** 0..1 log-scaled popularity inside the fetched window. */
  popularity: number
  /** Deterministic engine score (higher = better training pick). */
  score: number
  /** APPROXIMATE expected pp for a strong play — see estimatePp(). */
  ppPotential: number
  reason: string
}

export interface RecFilters {
  srMin: number
  srMax: number
  bpmMin: number
  bpmMax: number
  lenMinSec: number
  lenMaxSec: number
  rankedLovedOnly: boolean
  /** Mania only: restrict to this key count (null = any). */
  keyCount: number | null
  /** Free-text tag/keyword the map's tags/title must contain. */
  tagText: string
}

export function defaultFiltersFor(profile: SkillProfile): RecFilters {
  return {
    srMin: Math.max(0, Math.round((profile.comfortSrMin - 0.5) * 10) / 10),
    srMax: Math.round((profile.srCeiling + 0.8) * 10) / 10,
    bpmMin: Math.max(60, profile.bpmSweetMin - 30),
    bpmMax: profile.bpmSweetMax + 30,
    lenMinSec: 60,
    lenMaxSec: 600,
    rankedLovedOnly: true,
    keyCount: profile.mode === 'mania' ? profile.mainKeyCount : null,
    tagText: '',
  }
}

/**
 * Search queries for candidate generation. The primary query uses the
 * osu! search query syntax (stars/bpm bounds) so the window arrives
 * pre-narrowed; tag variants widen the pool with the player's own
 * playstyle vocabulary. Everything is re-filtered client-side anyway —
 * the query is an optimisation, the filters are the guarantee.
 */
export function buildCandidateQueries(
  profile: SkillProfile,
  mode: GameMode,
  filters: RecFilters,
): string[] {
  // Mode travels as its own proxy param; the query text is mode-agnostic.
  void mode
  const primary =
    `stars>=${filters.srMin.toFixed(1)} stars<=${filters.srMax.toFixed(1)} ` +
    `bpm>=${filters.bpmMin} bpm<=${filters.bpmMax}`
  const queries = [primary]
  for (const tag of profile.playstyleTags.slice(0, 2)) {
    queries.push(`${tag} ${primary}`)
  }
  if (filters.tagText.trim()) {
    queries.push(`${filters.tagText.trim()} ${primary}`)
  }
  return [...new Set(queries)]
}

// ---------------------------------------------------------------------------
// Mapping + filtering (pure)
// ---------------------------------------------------------------------------

/**
 * Pick the difficulty of a set that best serves this player: among the
 * set's difficulties *in the chosen mode*, the one closest to the
 * training edge (just above the comfort band). Returns null when the
 * set has no difficulty in the mode.
 */
export function pickDifficulty(
  set: SearchBeatmapset,
  mode: GameMode,
  profile: SkillProfile,
): SearchDifficulty | null {
  // A difficulty without a finite star rating cannot be ranked: drop
  // it instead of letting NaN through the sort (NaN bands downstream
  // read as a broken profile, not a crash — but a wrong one).
  const inMode = (set?.beatmaps ?? []).filter(
    (b) =>
      b &&
      b.mode === mode &&
      typeof b.difficulty_rating === 'number' &&
      Number.isFinite(b.difficulty_rating),
  )
  if (inMode.length === 0) return null
  const target = profile.comfortSrMax + 0.2
  return [...inMode].sort(
    (a, b) =>
      Math.abs(a.difficulty_rating - target) - Math.abs(b.difficulty_rating - target) ||
      b.difficulty_rating - a.difficulty_rating,
  )[0]
}

export function splitTags(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .toLowerCase()
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

export function setToCandidate(
  set: SearchBeatmapset,
  mode: GameMode,
  profile: SkillProfile,
): RecCandidate | null {
  // Malformed search entries (null set, missing id) are skipped, not
  // dereferenced: a single bad entry used to take down the whole list.
  if (!set || typeof set.id !== 'number') return null
  const diff = pickDifficulty(set, mode, profile)
  if (!diff) return null
  return {
    beatmapsetId: set.id,
    beatmapId: diff.id,
    title: set.title ?? '',
    artist: set.artist ?? '',
    creator: set.creator ?? '',
    version: diff.version ?? '',
    cover: set.covers?.card ?? set.covers?.cover,
    sr: diff.difficulty_rating,
    bpm: diff.bpm ?? set.beatmaps?.[0]?.bpm ?? 0,
    lengthSec: diff.total_length ?? 0,
    cs: diff.cs ?? 0,
    ar: diff.ar ?? 0,
    od: diff.od ?? 0,
    tags: splitTags(set.tags),
    status: set.status ?? '',
    playCount: set.play_count ?? 0,
    favouriteCount: set.favourite_count ?? 0,
    popularity: 0,
    score: 0,
    ppPotential: 0,
    reason: '',
  }
}

/** Filters narrow the pool BEFORE scoring (§3) — they never re-sort. */
export function applyFilters(
  candidates: RecCandidate[],
  filters: RecFilters,
  mode: GameMode,
): RecCandidate[] {
  const tag = filters.tagText.trim().toLowerCase()
  return candidates.filter((c) => {
    if (c.sr < filters.srMin || c.sr > filters.srMax) return false
    if (c.bpm > 0 && (c.bpm < filters.bpmMin || c.bpm > filters.bpmMax)) return false
    if (c.lengthSec > 0 && (c.lengthSec < filters.lenMinSec || c.lengthSec > filters.lenMaxSec))
      return false
    if (filters.rankedLovedOnly && c.status !== 'ranked' && c.status !== 'loved') return false
    if (mode === 'mania' && filters.keyCount !== null && Math.round(c.cs) !== filters.keyCount)
      return false
    if (tag) {
      const haystack = `${c.tags.join(' ')} ${c.title} ${c.artist}`.toLowerCase()
      if (!haystack.includes(tag)) return false
    }
    return true
  })
}

// ---------------------------------------------------------------------------
// Scoring (pure, deterministic)
// ---------------------------------------------------------------------------

/**
 * APPROXIMATION: expected pp for a clean play. The real pp value needs
 * a full score simulation; what the ranking actually needs is a
 * monotone proxy, so we estimate pp ∝ SR^3.2 with a per-mode scale and
 * a mild length bonus. Good enough to rank "reachable pp" — never shown
 * to the user as a promised pp value.
 */
const PP_MODE_SCALE: Record<GameMode, number> = {
  osu: 3.1,
  taiko: 2.6,
  fruits: 2.4,
  mania: 2.2,
}

export function estimatePp(sr: number, lengthSec: number, mode: GameMode): number {
  const base = PP_MODE_SCALE[mode] * Math.pow(Math.max(0, sr), 3.2)
  const lengthBonus = 1 + Math.min(Math.max(lengthSec, 0), 300) / 1500
  return Math.round(base * lengthBonus)
}

function gapFit(sr: number, profile: SkillProfile): number {
  const { comfortSrMin, comfortSrMax, srCeiling } = profile
  if (sr < comfortSrMin) {
    // Below the band: consolidation value only, fading with distance.
    return Math.max(0.15, 0.55 - (comfortSrMin - sr) * 0.3)
  }
  if (sr <= comfortSrMax) return 0.78
  if (sr <= srCeiling) return 1 // the training gap itself — best fit
  if (sr <= srCeiling + 0.6) return Math.max(0.3, 0.7 - (sr - srCeiling) * 0.6)
  return 0.2
}

function bpmFit(bpm: number, profile: SkillProfile): number {
  if (bpm <= 0 || profile.bpmSweetMax === 0) return 0.5
  if (bpm >= profile.bpmSweetMin && bpm <= profile.bpmSweetMax) return 1
  const dist = bpm < profile.bpmSweetMin ? profile.bpmSweetMin - bpm : bpm - profile.bpmSweetMax
  return Math.max(0, 1 - dist / 45)
}

function arFit(ar: number, profile: SkillProfile): number {
  if (ar <= 0 || profile.avgAr === 0) return 0.5
  return Math.max(0, 1 - Math.abs(ar - profile.avgAr) / 2.5)
}

function keyFit(cs: number, profile: SkillProfile): number {
  if (profile.mainKeyCount === null) return 0.5
  return Math.round(cs) === profile.mainKeyCount ? 1 : 0.25
}

function modeFit(c: RecCandidate, profile: SkillProfile): number {
  switch (profile.mode) {
    case 'taiko':
      return bpmFit(c.bpm, profile)
    case 'fruits':
      return arFit(c.ar, profile)
    case 'mania':
      return keyFit(c.cs, profile)
    default:
      return bpmFit(c.bpm, profile)
  }
}

export interface ScoreContext {
  playedSetIds: ReadonlySet<number>
  /** Account learning signal; 0 for guests and for everyone until M5. */
  ratingBoost?: number
}

export function scoreCandidate(
  c: RecCandidate,
  profile: SkillProfile,
  ctx: ScoreContext,
): RecCandidate {
  const ppPotential = estimatePp(c.sr, c.lengthSec, profile.mode)
  // pp relevance: peaks when the map's pp potential sits just above the
  // player's per-play pp level (their total pp spread over ~top plays).
  const level = Math.max(20, profile.pp / 12)
  const ppRelevance = Math.max(
    0,
    1 - Math.abs(Math.log(ppPotential / level)) / 1.6,
  )
  const playstyleTags = profile.playstyleTags ?? []
  const tagOverlap = playstyleTags.filter((t) =>
    c.tags.some((ct) => ct === t || ct.startsWith(t)),
  )
  const tagMatch =
    playstyleTags.length === 0
      ? 0.4
      : Math.min(1, tagOverlap.length / Math.min(2, playstyleTags.length))

  let score =
    45 * gapFit(c.sr, profile) +
    25 * ppRelevance +
    15 * tagMatch +
    15 * modeFit(c, profile) +
    (ctx.ratingBoost ?? 0)
  if (ctx.playedSetIds.has(c.beatmapsetId)) score *= 0.35 // played penalty (§3)

  let reason = gapReason(profile, c.sr, c.bpm)
  if (profile.mode === 'mania' && profile.mainKeyCount !== null && Math.round(c.cs) === profile.mainKeyCount) {
    reason = `${profile.mainKeyCount}K main, accuracy collapses at ${profile.srCeiling.toFixed(1)}★ — this ${c.sr.toFixed(1)}★ ${Math.round(c.cs)}K map trains it at ${c.bpm} BPM.`
  } else if (profile.mode === 'fruits' && profile.avgAr > 0) {
    reason = `You play AR ${profile.avgAr.toFixed(1)} comfortably — this is AR ${c.ar.toFixed(1)} at ${c.sr.toFixed(1)}★.`
  } else if (tagOverlap.length > 0) {
    reason = `${reason} Matches your ${tagOverlap[0]} plays.`
  }

  return { ...c, score: Math.round(score * 10) / 10, ppPotential, reason }
}

export function scoreAndSort(
  candidates: RecCandidate[],
  profile: SkillProfile,
  ctx: ScoreContext,
): RecCandidate[] {
  const maxPlays = Math.max(1, ...candidates.map((c) => c.playCount))
  return candidates
    .map((c) => ({
      ...scoreCandidate(c, profile, ctx),
      popularity: Math.round((Math.log10(c.playCount + 1) / Math.log10(maxPlays + 1)) * 100) / 100,
    }))
    .sort((a, b) => b.score - a.score || b.playCount - a.playCount || a.beatmapsetId - b.beatmapsetId)
}

// ---------------------------------------------------------------------------
// Orchestration — Generated mode
// ---------------------------------------------------------------------------

/** Search pages are cached per (query, mode, cursor) so switching
 *  back to a mode/query already loaded renders instantly (item 5).
 *  Explicit Regenerate/refresh passes fresh=true to bypass the read
 *  (the fresh page still overwrites the entry). */
const SEARCH_PAGE_TTL_MS = 5 * 60 * 1000

async function fetchSearchPage(
  query: string,
  mode: GameMode,
  cursor?: string | null,
  opts: { fresh?: boolean } = {},
): Promise<SearchPage> {
  const cacheKey = JSON.stringify(['rec-search', query, mode, cursor ?? null])
  if (!opts.fresh) {
    const hit = dataCache.get<SearchPage>(cacheKey)
    if (hit) return hit
  }
  const page = normalizeSearchPage(
    await proxyCall<SearchPage>('searchBeatmapsets', {
      mode,
      query,
      cursor_string: cursor ?? undefined,
      filters: { sort: 'plays_desc' },
    }),
  )
  dataCache.set(cacheKey, page, SEARCH_PAGE_TTL_MS)
  return page
}

function normalizeSearchPage(page: unknown): SearchPage {
  // Normalize a malformed page (missing/undefined `beatmapsets`, or a
  // non-object payload) into an empty page. Callers treat "no more
  // results" as an honest end state; they must never dereference
  // `undefined.beatmapsets` and crash the list.
  if (!page || typeof page !== 'object' || !Array.isArray((page as SearchPage).beatmapsets)) {
    const total =
      page && typeof page === 'object' && typeof (page as SearchPage).total === 'number'
        ? (page as SearchPage).total
        : undefined
    return { beatmapsets: [], cursor_string: null, total }
  }
  return page as SearchPage
}

export interface GenerateResult {
  items: RecCandidate[]
  totalMatched: number | null
  poolSize: number
}

export async function generateRecommendations(
  profile: SkillProfile,
  mode: GameMode,
  opts: {
    count: number
    filters: RecFilters
    seen?: SeenState | null
    enrichTop?: number
    /** Bypass the search-page cache (explicit Regenerate). */
    fresh?: boolean
  },
): Promise<GenerateResult> {
  const queries = buildCandidateQueries(profile, mode, opts.filters)
  const bySet = new Map<number, SearchBeatmapset>()
  let totalMatched: number | null = null

  for (const query of queries) {
    if (bySet.size >= 150) break
    let cursor: string | null | undefined = undefined
    for (let page = 0; page < 2; page++) {
      const result = await fetchSearchPage(query, mode, cursor, { fresh: opts.fresh })
      if (totalMatched === null && typeof result.total === 'number') {
        totalMatched = result.total
      }
      for (const set of result.beatmapsets ?? []) {
        if (!set || typeof set.id !== 'number') continue
        bySet.set(set.id, set)
      }
      cursor = result.cursor_string
      if (!cursor) break
    }
  }

  let candidates = [...bySet.values()]
    .map((set) => setToCandidate(set, mode, profile))
    .filter((c): c is RecCandidate => c !== null)
  candidates = applyFilters(candidates, opts.filters, mode)
  if (opts.seen) {
    const seen = opts.seen
    candidates = candidates.filter((c) => !isHardSeen(seen, c.beatmapsetId))
  }
  const poolSize = candidates.length

  const playedSetIds = new Set(opts.seen?.played ?? [])
  let ranked = scoreAndSort(candidates, profile, { playedSetIds, ratingBoost: 0 })

  // Difficulty-attribute enrichment for the top slice only (§3: cheap
  // for ~30). Attributes give the authoritative SR for the exact
  // difficulty+mode; ppPotential is re-estimated from it.
  const enrichN = opts.enrichTop ?? 30
  const top = ranked.slice(0, enrichN)
  if (top.length > 0) {
    const enriched = await Promise.all(
      top.map(async (c) => {
        try {
          const res = await proxyCall<{ attributes?: { star_rating?: number } }>(
            'getDifficultyAttributes',
            { beatmapId: c.beatmapId, mode },
          )
          const sr = res?.attributes?.star_rating
          if (typeof sr === 'number' && sr > 0) {
            return { ...c, sr, ppPotential: estimatePp(sr, c.lengthSec, mode) }
          }
        } catch {
          /* enrichment is best-effort; the search SR already ranks fine */
        }
        return c
      }),
    )
    ranked = [...enriched, ...ranked.slice(enrichN)]
  }

  return { items: ranked.slice(0, opts.count), totalMatched, poolSize }
}

// ---------------------------------------------------------------------------
// Orchestration — Unlimited feed (§13: windowed re-ranking)
// ---------------------------------------------------------------------------

/**
 * A feed session (§13.2.3): bound to one (profile, mode, filters)
 * triple. Holds a scoring pool ~3 pages ahead; `take()` serves the best
 * of the pool, refills fetch further search pages and re-score the
 * whole pool, so ordering stays good where the user's eyes are. The
 * seen set guarantees zero repeats across refills.
 */
export class FeedSession {
  private cursor: string | null | undefined = undefined
  private queryIndex = 0
  private queries: string[]
  private pool: RecCandidate[] = []
  private servedIds = new Set<number>()
  exhausted = false
  totalMatched: number | null = null
  /** Set when a refill is in flight, so the UI can show skeletons. */
  loading = false

  private profile: SkillProfile
  private mode: GameMode
  private filters: RecFilters
  private seen: SeenState
  private seenKeyValue: string
  private markServed: (key: string, ids: number[]) => void
  private fresh: boolean

  constructor(
    profile: SkillProfile,
    mode: GameMode,
    filters: RecFilters,
    seen: SeenState,
    seenKeyValue: string,
    markServed: (key: string, ids: number[]) => void,
    opts: { fresh?: boolean } = {},
  ) {
    this.profile = profile
    this.mode = mode
    this.filters = filters
    this.seen = seen
    this.seenKeyValue = seenKeyValue
    this.markServed = markServed
    this.fresh = opts.fresh ?? false
    this.queries = buildCandidateQueries(profile, mode, filters)
  }

  get bufferedCount(): number {
    return this.pool.length
  }

  private async refill(): Promise<void> {
    if (this.exhausted || this.loading) return
    this.loading = true
    try {
      // §13.2.7: one refill fetches at most 5 pages, then serves what it has.
      let pages = 0
      const fresh: RecCandidate[] = []
      while (pages < 5 && this.queryIndex < this.queries.length) {
        const result = await fetchSearchPage(
          this.queries[this.queryIndex],
          this.mode,
          this.cursor,
          { fresh: this.fresh },
        )
        pages += 1
        if (this.totalMatched === null && typeof result.total === 'number') {
          this.totalMatched = result.total
        }
        for (const set of result.beatmapsets ?? []) {
          if (!set || typeof set.id !== 'number') continue
          if (this.servedIds.has(set.id)) continue
          if (isHardSeen(this.seen, set.id) && !this.seen.served.includes(set.id)) continue
          if (this.seen.served.includes(set.id)) continue
          const candidate = setToCandidate(set, this.mode, this.profile)
          if (candidate) fresh.push(candidate)
        }
        this.cursor = result.cursor_string
        if (!this.cursor) {
          this.queryIndex += 1
          if (this.queryIndex >= this.queries.length) {
            this.exhausted = true
            break
          }
        }
        if (fresh.length >= 40) break
      }
      if (fresh.length > 0) {
        const filtered = applyFilters(fresh, this.filters, this.mode)
        const playedSetIds = new Set(this.seen.played)
        const scored = scoreAndSort(filtered, this.profile, { playedSetIds, ratingBoost: 0 })
        this.pool = scoreAndSort(
          [...this.pool, ...scored],
          this.profile,
          { playedSetIds, ratingBoost: 0 },
        )
      } else if (this.queryIndex >= this.queries.length) {
        this.exhausted = true
      }
    } finally {
      this.loading = false
    }
  }

  /** Serve the best `n` maps, refilling first when the buffer runs low. */
  async take(n: number): Promise<RecCandidate[]> {
    if (this.pool.length < n) await this.refill()
    const out = this.pool.slice(0, n)
    this.pool = this.pool.slice(out.length)
    for (const c of out) this.servedIds.add(c.beatmapsetId)
    if (out.length > 0) {
      this.markServed(
        this.seenKeyValue,
        out.map((c) => c.beatmapsetId),
      )
    }
    return out
  }
}

export function formatLength(totalSec: number): string {
  if (!totalSec) return '—'
  const m = Math.floor(totalSec / 60)
  const s = Math.round(totalSec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function modeTagLabel(candidate: RecCandidate, mode: GameMode): string {
  if (mode === 'mania') return `${Math.round(candidate.cs)}K ${modeLabel(mode)}`
  return modeLabel(mode)
}
