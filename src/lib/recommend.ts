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
  /** Lowest/highest star rating across the set's in-mode difficulties. */
  srMin: number
  srMax: number
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

/**
 * Whether the profile carries a usable BPM sweet spot. A profile
 * whose top plays reported no BPM at all calibrates bpmSweetMin/Max
 * to 0 — "unknown", never a real bound. Treating 0 as a bound used
 * to build the inverted window bpm>=60 bpm<=30, which matches
 * nothing upstream and filters out every candidate with a BPM:
 * silent empty recommendations in every mode, with no error.
 */
export function hasKnownBpm(profile: SkillProfile): boolean {
  return (
    Number.isFinite(profile.bpmSweetMin) &&
    Number.isFinite(profile.bpmSweetMax) &&
    profile.bpmSweetMin > 0 &&
    profile.bpmSweetMax >= profile.bpmSweetMin
  )
}

export function defaultFiltersFor(profile: SkillProfile): RecFilters {
  // SR guards: a profile with no usable star ratings falls back to
  // the starter band values instead of emitting NaN/0 bounds.
  const comfortMin =
    Number.isFinite(profile.comfortSrMin) && profile.comfortSrMin > 0
      ? profile.comfortSrMin
      : 3.0
  const ceiling =
    Number.isFinite(profile.srCeiling) && profile.srCeiling > comfortMin
      ? profile.srCeiling
      : comfortMin + 1.5
  return {
    srMin: Math.max(0, Math.round((comfortMin - 0.5) * 10) / 10),
    srMax: Math.round((ceiling + 0.8) * 10) / 10,
    // Unknown BPM (no top play reported one) gets the wide window,
    // never the inverted 60..30 one.
    bpmMin: hasKnownBpm(profile) ? Math.max(60, profile.bpmSweetMin - 30) : 60,
    bpmMax: hasKnownBpm(profile) ? profile.bpmSweetMax + 30 : 300,
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
/** SR/BPM/length window a picked difficulty should satisfy when one exists. */
export interface DifficultyBounds {
  srMin: number
  srMax: number
  bpmMin: number
  bpmMax: number
  lenMinSec: number
  lenMaxSec: number
}

export function pickDifficulty(
  set: SearchBeatmapset,
  mode: GameMode,
  profile: SkillProfile,
  bounds?: DifficultyBounds,
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
  const byCloseness = (list: SearchDifficulty[]) =>
    [...list].sort(
      (a, b) =>
        Math.abs(a.difficulty_rating - target) - Math.abs(b.difficulty_rating - target) ||
        b.difficulty_rating - a.difficulty_rating,
    )
  if (!bounds) return byCloseness(inMode)[0]
  // Prefer a difficulty the player can actually play under the active
  // filters. The upstream stars/bpm query matches a SET when ANY
  // difficulty fits, but picking the closest-to-target difficulty
  // regardless of BPM/length used to nominate an unplayable one and
  // let applyFilters drop the whole set — entire windows emptied
  // even though a playable difficulty existed in the same set.
  // Unknown BPM/length (0/missing) passes, matching the filter rule.
  const inBounds = (b: SearchDifficulty) => {
    if (b.difficulty_rating < bounds.srMin || b.difficulty_rating > bounds.srMax) return false
    const bpm = typeof b.bpm === 'number' && Number.isFinite(b.bpm) ? b.bpm : 0
    if (bpm > 0 && (bpm < bounds.bpmMin || bpm > bounds.bpmMax)) return false
    const len =
      typeof b.total_length === 'number' && Number.isFinite(b.total_length) ? b.total_length : 0
    if (len > 0 && (len < bounds.lenMinSec || len > bounds.lenMaxSec)) return false
    return true
  }
  const fitting = inMode.filter(inBounds)
  return byCloseness(fitting.length > 0 ? fitting : inMode)[0]
}

export function splitTags(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .toLowerCase()
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

/**
 * Skillset-vocabulary tags only, for the row chips (batch 5, item C).
 * Whole-token, case-insensitive match against a fixed vocabulary —
 * a tag not in this list is simply not shown, and no meaning is
 * invented for unknown tags. Compound forms jumpstream/chordjack
 * are included because they ARE the skillset names mappers use
 * (a stream of jumps / a jack of chords), alongside the plain
 * stream/jump/jack/chord forms. Order is the set's tag order,
 * capped at 4, duplicates dropped.
 */
const SKILLSET_TAG_VOCABULARY = new Set([
  'stream', 'streams', 'jump', 'jumps', 'jumpstream',
  'aim', 'tech', 'technical', 'stamina', 'speed', 'precision',
  'reading', 'burst', 'bursts', 'slider', 'sliders',
  'jack', 'jacks', 'chordjack', 'chord', 'chords',
  'ln', 'longnote', 'longnotes', 'rice', 'hybrid', 'swing',
  'flow', 'snap', 'alt', 'alternate', 'singletap', 'singletaps',
  'accuracy', 'control', 'movement', 'fingercontrol',
])

export function essentialTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags) {
    // Normalise separators so finger-control / single-tap / long-note
    // match the same vocabulary entries as their joined forms.
    const tag = raw.toLowerCase().replace(/[-_]/g, '').trim()
    if (!SKILLSET_TAG_VOCABULARY.has(tag) || seen.has(tag)) continue
    seen.add(tag)
    out.push(tag)
    if (out.length >= 4) break
  }
  return out
}

export function setToCandidate(
  set: SearchBeatmapset,
  mode: GameMode,
  profile: SkillProfile,
  bounds?: DifficultyBounds,
): RecCandidate | null {
  // Malformed search entries (null set, missing id) are skipped, not
  // dereferenced: a single bad entry used to take down the whole list.
  if (!set || typeof set.id !== 'number') return null
  const diff = pickDifficulty(set, mode, profile, bounds)
  if (!diff) return null
  // SR range across the set's in-mode difficulties (same in-mode
  // list pickDifficulty uses, independent of the picked difficulty
  // and of any bounds): a set with 2.1★–6.8★ diffs must not be
  // presented as a single SR value.
  const inModeSrs = (set.beatmaps ?? [])
    .filter(
      (b) =>
        b &&
        b.mode === mode &&
        typeof b.difficulty_rating === 'number' &&
        Number.isFinite(b.difficulty_rating),
    )
    .map((b) => b.difficulty_rating)
  return {
    beatmapsetId: set.id,
    beatmapId: diff.id,
    title: set.title ?? '',
    artist: set.artist ?? '',
    creator: set.creator ?? '',
    version: diff.version ?? '',
    cover: set.covers?.card ?? set.covers?.cover,
    sr: diff.difficulty_rating,
    srMin: inModeSrs.length > 0 ? Math.min(...inModeSrs) : diff.difficulty_rating,
    srMax: inModeSrs.length > 0 ? Math.max(...inModeSrs) : diff.difficulty_rating,
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

/**
 * One-tap escape from the filtered-out empty state: widen the numeric
 * ranges (SR ±1★, BPM ±30, length dropped) and regenerate. The tag
 * and status settings are kept — loosening the ranges is the change
 * the diagnostic message itself suggests.
 */
export function widenRecFilters(filters: RecFilters): RecFilters {
  return {
    ...filters,
    srMin: Math.max(0, Math.round((filters.srMin - 1) * 10) / 10),
    srMax: Math.round((filters.srMax + 1) * 10) / 10,
    bpmMin: Math.max(60, filters.bpmMin - 30),
    bpmMax: filters.bpmMax + 30,
    lenMinSec: 0,
    lenMaxSec: 3600,
  }
}

/** One-tap escape from the filtered-out empty state: drop only the tag. */
export function clearRecTag(filters: RecFilters): RecFilters {
  return { ...filters, tagText: '' }
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
    // Key count only applies when the candidate actually carries a
    // CS value: search payloads without one (cs 0 = unknown) must
    // pass, matching Mirror's "unknown values pass" rule. Dropping
    // them emptied every mania run whose payloads lacked CS.
    if (mode === 'mania' && filters.keyCount !== null && c.cs > 0 && Math.round(c.cs) !== filters.keyCount)
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
  /** Legacy scalar learning signal; generation no longer passes it
   * (M5 wires per-candidate learning through `boostFor` instead).
   * Kept so older callers/tests keep compiling; boostFor wins. */
  ratingBoost?: number
  /** M5 learning (feedback.ts): per-candidate boost computed from
   * the mode's own ratings only. Absent for guests and when no
   * feedback exists — scoring is then exactly the pre-M5 score. */
  boostFor?: (c: RecCandidate) => number
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
    (ctx.boostFor?.(c) ?? ctx.ratingBoost ?? 0)
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

/**
 * Where the pool emptied, so the UI can say WHY instead of showing a
 * silent empty list. Counts are cumulative over the queries run:
 * rawSets = unique sets returned by osu! search, afterPick = sets
 * with a playable in-mode difficulty, afterFilters = survivors of
 * the SR/BPM/length/status/key-count filters, afterSeen = survivors
 * of the seen-set exclusion when it is active (= poolSize when the
 * run ignores seen, as Generated mode always does since batch 6,
 * part 4). `shuffled` marks a Renew run: the ranked list was
 * shuffled, so the order is random for that run.
 */
export interface GenerationDiagnostics {
  queries: string[]
  rawSets: number
  afterPick: number
  afterFilters: number
  afterSeen: number
  bpmUnknown: boolean
  /** True when every query's cursor is spent — no further window exists. */
  windowExhausted: boolean
  /** True when this run shuffled the ranked list (Renew only). */
  shuffled: boolean
}

export interface GenerateResult {
  items: RecCandidate[]
  totalMatched: number | null
  poolSize: number
  diagnostics: GenerationDiagnostics
  /** Resume state for the NEXT window: pass back as `resume` to continue. */
  nextResume: GenerationResume
}

/**
 * Explicit, testable resume state for Generated-mode paging (batch 5,
 * item A). Per-query cursors: an absent key means the query was never
 * fetched, a null value means its cursor is spent. Deliberately NOT
 * module-global mutable state — the caller owns it in a ref keyed by
 * the profile+mode+filters signature, so a signature change restarts
 * from page 1 and tests can drive successive windows directly.
 */
export interface GenerationResume {
  cursors: Record<string, string | null>
}

export function emptyGenerationResume(): GenerationResume {
  return { cursors: {} }
}

/**
 * Plain-language reason for an empty result, naming the stage that
 * emptied the pool. Used by the Generated recommendations screen;
 * never blames user-set filters for a pool the defaults emptied.
 * There is deliberately NO seen-set branch: Generated mode always
 * shows beatmaps, even already-seen ones (batch 6, part 4), so the
 * seen set can never be what emptied the pool there.
 */
export function emptyPoolReason(d: GenerationDiagnostics, filters: RecFilters): string {
  if (d.rawSets === 0) {
    return (
      `osu! search returned no beatmapsets for this SR/BPM window ` +
      `(${d.queries.length} ${d.queries.length === 1 ? 'query' : 'queries'} tried). ` +
      (d.bpmUnknown
        ? 'Your top plays reported no BPM, so a wide 60–300 BPM window was used — the empty result is upstream, not your filters. '
        : '') +
      'Retry — the proxy or osu! may have been busy — or loosen the SR range.'
    )
  }
  if (d.afterPick === 0) {
    return `${d.rawSets} ${d.rawSets === 1 ? 'set' : 'sets'} came back from osu! search, but none had a playable difficulty in this mode. Retry or loosen the SR range.`
  }
  if (d.afterFilters === 0) {
    return `${d.afterPick} ${d.afterPick === 1 ? 'set' : 'sets'} came back, but every one was filtered out by the SR/BPM/length/status${filters.keyCount !== null ? '/key-count' : ''} filters. Loosen the ranges or clear the tag.`
  }
  return 'No maps matched these filters. Loosen the SR/BPM ranges or clear the tag and apply again.'
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
    /** Skip the seen-set exclusion for this run. Generated mode
     * always passes this (batch 6, part 4): it shows beatmaps even
     * when already seen. The seen store itself is never touched
     * by this flag — the caller still marks served separately.
     * The Endless feed does NOT use this: its no-repeat guarantee
     * is its whole point. */
    ignoreSeen?: boolean
    /** Resume state from the previous window (see GenerationResume).
     * Ignored when `fresh` is set — a fresh run always restarts
     * from page 1. */
    resume?: GenerationResume
    /** Renew only: Fisher-Yates shuffle the ranked list before
     * taking `count`, so the run shows a random subset in a random
     * order. Normal runs keep the PP-anchored fixed ranking. */
    shuffle?: boolean
    /** Random source for the shuffle. Defaults to Math.random;
     * tests inject a fixed-seed source for determinism. */
    rng?: () => number
    /** M5 learning: per-candidate boost from the mode's own
     * ratings (feedback.ts `boostForCandidate` closure). Guests
     * and feedback-free runs omit it — scoring is unchanged. */
    boostFor?: (c: RecCandidate) => number
  },
): Promise<GenerateResult> {
  const queries = buildCandidateQueries(profile, mode, opts.filters)
  const bySet = new Map<number, SearchBeatmapset>()
  let totalMatched: number | null = null

  // Resume from the previous window's cursors; `fresh` restarts.
  const startCursors: Record<string, string | null> = opts.fresh
    ? {}
    : { ...(opts.resume?.cursors ?? {}) }
  const nextCursors: Record<string, string | null> = { ...startCursors }
  for (const query of queries) {
    if (bySet.size >= 150) break
    // NB: `?? undefined` would collapse a stored null (spent query)
    // back to undefined and re-fetch page 1 — read the key directly.
    const stored = startCursors[query]
    let cursor: string | null | undefined = stored === undefined ? undefined : stored
    // A null cursor means this query's pages are spent: skip it so a
    // later window never re-fetches (and re-serves) the first pages.
    if (cursor === null) continue
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
    nextCursors[query] = cursor ?? null
  }
  const windowExhausted = queries.every((q) => nextCursors[q] === null)

  const rawSets = bySet.size
  let candidates = [...bySet.values()]
    .map((set) => setToCandidate(set, mode, profile, opts.filters))
    .filter((c): c is RecCandidate => c !== null)
  const afterPick = candidates.length
  candidates = applyFilters(candidates, opts.filters, mode)
  const afterFilters = candidates.length
  if (opts.seen && !opts.ignoreSeen) {
    const seen = opts.seen
    candidates = candidates.filter((c) => !isHardSeen(seen, c.beatmapsetId))
  }
  const poolSize = candidates.length
  const diagnostics: GenerationDiagnostics = {
    queries,
    rawSets,
    afterPick,
    afterFilters,
    afterSeen: poolSize,
    bpmUnknown: !hasKnownBpm(profile),
    windowExhausted,
    shuffled: opts.shuffle ?? false,
  }

  const playedSetIds = new Set(opts.seen?.played ?? [])
  let ranked = scoreAndSort(candidates, profile, { playedSetIds, boostFor: opts.boostFor })

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

  // Renew (part 4): shuffle the RANKED list with the injected rng,
  // then take `count` — a random subset in a random order. Normal
  // runs never reach this: their ranking stays PP-anchored.
  if (opts.shuffle) {
    const rng = opts.rng ?? Math.random
    for (let i = ranked.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      const tmp = ranked[i]
      ranked[i] = ranked[j]
      ranked[j] = tmp
    }
  }

  return {
    items: ranked.slice(0, opts.count),
    totalMatched,
    poolSize,
    diagnostics,
    nextResume: { cursors: nextCursors },
  }
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
  private examinedIds = new Set<number>()
  exhausted = false
  totalMatched: number | null = null
  /** Set when a refill is in flight, so the UI can show skeletons. */
  loading = false
  /** Unique sets examined across refills (diagnostics for the WHY line). */
  examinedSets = 0
  /** Candidates that survived pick + filters and entered the pool. */
  producedCandidates = 0

  private profile: SkillProfile
  private mode: GameMode
  private filters: RecFilters
  private seen: SeenState
  private seenKeyValue: string
  private markServed: (key: string, ids: number[]) => void
  private fresh: boolean
  private boostFor?: (c: RecCandidate) => number

  constructor(
    profile: SkillProfile,
    mode: GameMode,
    filters: RecFilters,
    seen: SeenState,
    seenKeyValue: string,
    markServed: (key: string, ids: number[]) => void,
    opts: { fresh?: boolean; boostFor?: (c: RecCandidate) => number } = {},
  ) {
    this.profile = profile
    this.mode = mode
    this.filters = filters
    this.seen = seen
    this.seenKeyValue = seenKeyValue
    this.markServed = markServed
    this.fresh = opts.fresh ?? false
    this.boostFor = opts.boostFor
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
          if (!this.examinedIds.has(set.id)) {
            this.examinedIds.add(set.id)
            this.examinedSets = this.examinedIds.size
          }
          if (this.servedIds.has(set.id)) continue
          if (isHardSeen(this.seen, set.id) && !this.seen.served.includes(set.id)) continue
          if (this.seen.served.includes(set.id)) continue
          const candidate = setToCandidate(set, this.mode, this.profile, this.filters)
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
        this.producedCandidates += filtered.length
        const playedSetIds = new Set(this.seen.played)
        const scored = scoreAndSort(filtered, this.profile, { playedSetIds, boostFor: this.boostFor })
        this.pool = scoreAndSort(
          [...this.pool, ...scored],
          this.profile,
          { playedSetIds, boostFor: this.boostFor },
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
