import { proxyCall } from './osu'
import { dataCache } from './dataCache'
import type { GameMode } from './mode'
import { modeLabel } from './mode'
import type { SkillProfile } from './skillProfile'
import { gapReason } from './interpretations'
import { appendUserTagClause } from './userTags'
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
  /**
   * Opportunistic payload fields (osu! Beatmap object): the .osu
   * checksum is the exact file-version key for the PP cache, and
   * last_updated is its fallback. Neither is guaranteed present
   * in every payload — the PP cache key falls back to the bare
   * beatmap id when both are absent, never failing the row.
   */
  checksum?: string
  last_updated?: string
}

export interface SearchBeatmapset {
  id: number
  title: string
  artist: string
  creator: string
  status: string
  play_count?: number
  favourite_count?: number
  /** ISO date the set was ranked (null when unranked). Present on
   *  ranked search results; read by the Ranked compilation lists. */
  ranked_date?: string | null
  tags?: string
  covers?: { card?: string; cover?: string; list?: string }
  beatmaps?: SearchDifficulty[]
}

export interface SearchPage {
  beatmapsets: SearchBeatmapset[]
  cursor_string?: string | null
  total?: number
}

/**
 * One difficulty of a candidate set, as carried for the max-PP
 * range (see lib/pp): the .osu file is fetched per beatmap id and
 * computed in the difficulty's own ruleset. Checksum/lastUpdated
 * are the cache version signals, read opportunistically from the
 * search payload (see SearchDifficulty).
 */
export interface CandidateDifficulty {
  beatmapId: number
  mode: GameMode
  checksum?: string
  lastUpdated?: string
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
  /**
   * The set's difficulties in the row's mode, carried from the
   * already-fetched search payload (no extra API calls) so the
   * row can compute the max-PP range (see lib/pp). Optional:
   * candidates built before this field existed, and demo/test
   * literals, omit it — rows without it show no PP pill.
   */
  difficulties?: CandidateDifficulty[]
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
  /**
   * Selected lazer user tag, as its "group/name" id (null = none).
   * Filtering is SERVER-side: the id becomes a `tag="group/name"`
   * clause on every search query (see buildCandidateQueries).
   * There is deliberately NO client-side tag check in
   * applyFilters: the search payload carries only mapper tags
   * (`SearchBeatmapset.tags`), never per-map voted user tags,
   * so matching the id against mapper text would be guessing.
   */
  userTag: string | null
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
    userTag: null,
  }
}

/**
 * Search queries for candidate generation. The primary query uses the
 * osu! search query syntax (stars/bpm bounds) so the window arrives
 * pre-narrowed; playstyle variants widen the pool with the player's
 * own playstyle vocabulary as full-text terms. The selected user
 * tag (if any) is appended as a `tag="group/name"` clause to EVERY
 * query: generation unions the queries' results, so a clause on
 * only the primary query would let the variant queries re-admit
 * untagged maps. Everything is re-filtered client-side anyway for
 * the numeric/status filters — the tag clause is the filter, and
 * it is enforced upstream, not by matching mapper text.
 */
export function buildCandidateQueries(
  profile: SkillProfile,
  mode: GameMode,
  filters: RecFilters,
): string[] {
  // Mode travels as its own proxy param; the query text is mode-agnostic.
  void mode
  const base =
    `stars>=${filters.srMin.toFixed(1)} stars<=${filters.srMax.toFixed(1)} ` +
    `bpm>=${filters.bpmMin} bpm<=${filters.bpmMax}`
  // appendUserTagClause is the single construction site for the
  // clause (userTags.ts): `tag="group/name"`, or unchanged text
  // when no tag is selected.
  const queries = [appendUserTagClause(base, filters.userTag)]
  for (const tag of profile.playstyleTags.slice(0, 2)) {
    queries.push(appendUserTagClause(`${tag} ${base}`, filters.userTag))
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

/** Default size of the row-chip allowlist (see mostUsedEssentialTags). */
export const ROW_TAG_ALLOWLIST_LIMIT = 7

/**
 * The N most-used essential tags across a list of candidates
 * ("7 most use tags overall", 2026-10-29): each candidate
 * contributes its essentialTags() output once per tag (the
 * chips that would actually render, per-row cap + dedupe
 * already applied), most-used first. Ties break by vocabulary
 * order, so the result is deterministic for the same list.
 * The Recommendations screens narrow row chips to this set so
 * a list shows one shared handful of dominant skillsets
 * instead of a different scattering per row; Mirror / Welcome
 * Recs pass no allowlist and keep the full essential tags.
 */
export function mostUsedEssentialTags(
  candidates: ReadonlyArray<Pick<RecCandidate, 'tags'>>,
  limit: number = ROW_TAG_ALLOWLIST_LIMIT,
): string[] {
  if (limit <= 0) return []
  const counts = new Map<string, number>()
  for (const c of candidates) {
    for (const tag of essentialTags(c.tags ?? [])) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  const vocabOrder = new Map([...SKILLSET_TAG_VOCABULARY].map((tag, i) => [tag, i]))
  return [...counts.entries()]
    .sort(
      (a, b) =>
        b[1] - a[1] || (vocabOrder.get(a[0]) ?? 0) - (vocabOrder.get(b[0]) ?? 0),
    )
    .slice(0, limit)
    .map(([tag]) => tag)
}

/**
 * Narrow a row's essential tags to an allowlist (the list's
 * most-used tags). An undefined allowlist means no narrowing —
 * every essential tag shows, as before.
 */
export function applyTagAllowlist(
  tags: readonly string[],
  allowlist: readonly string[] | undefined,
): string[] {
  if (!allowlist) return [...tags]
  const allowed = new Set(allowlist)
  return tags.filter((tag) => allowed.has(tag))
}

/**
 * Hide downloaded and previously-seen maps from a rendered
 * recommendation list (2026-10-29): sets in the seen store's
 * `downloaded` list, or in the `seenBefore` snapshot (the served
 * set as of BEFORE the current window was generated), drop out
 * of the rows. Exhaustion fallback: when EVERY item in the
 * current window is hidden, the hidden items show again — with
 * their downloaded state visible — plus an honest note from the
 * caller. "All" means all of this rendered window, not the whole
 * pool: a fresh window or a new refill re-evaluates the rule
 * from its own items. The two fallback flags distinguish WHY
 * the list came back: every item downloaded (the downloaded
 * note) vs every item hidden for either reason (the seen note).
 * The Generated/Batches view calls this; Mirror / Welcome Recs
 * / Collections never do. Filtering happens at list level,
 * never inside BeatmapRow, and the engine's fetch-time
 * exclusion is untouched.
 */
export interface SeenVisibility<T> {
  visible: T[]
  /** True when the fallback is active because every item was downloaded. */
  showingDownloadedFallback: boolean
  /** True when the fallback is active because every item was hidden
   *  (downloaded or previously seen) but not every item was downloaded. */
  showingSeenFallback: boolean
}

/**
 * Visibility options: `showDownloaded` (the show-downloaded toggle,
 * §AE) reveals downloaded sets again with their downloaded state —
 * it overrides ONLY the downloaded rule; the served-before rule is
 * untouched.
 */
export interface SeenVisibilityOptions {
  showDownloaded?: boolean
}

export function applySeenVisibility<T extends { beatmapsetId: number }>(
  items: readonly T[],
  downloadedIds: ReadonlySet<number> | readonly number[],
  seenBeforeIds: ReadonlySet<number> | readonly number[],
  opts?: SeenVisibilityOptions,
): SeenVisibility<T> {
  // With the show-downloaded toggle ON, the downloaded set is
  // treated as empty for hiding AND for the downloaded fallback —
  // the toggle reveals those rows, so there is nothing to fall back
  // to. The served-before rule still applies in full.
  const downloaded = new Set(opts?.showDownloaded ? [] : downloadedIds)
  const seenBefore = new Set(seenBeforeIds)
  const visible = items.filter(
    (c) => !downloaded.has(c.beatmapsetId) && !seenBefore.has(c.beatmapsetId),
  )
  if (visible.length > 0 || items.length === 0) {
    return { visible, showingDownloadedFallback: false, showingSeenFallback: false }
  }
  const allDownloaded = items.every((c) => downloaded.has(c.beatmapsetId))
  return {
    visible: [...items],
    showingDownloadedFallback: allDownloaded,
    showingSeenFallback: !allDownloaded,
  }
}

export interface DownloadVisibility<T> {
  visible: T[]
  /** True when the fallback is active: every item was downloaded. */
  showingDownloadedFallback: boolean
}

/**
 * Downloaded-only entry point, kept for the Unlimited feed (which
 * does its seen-dedupe at fetch time and must NOT hide
 * previously-served rows here — its own rows ARE the served
 * set). Identical to the previous implementation: the
 * previously-seen set is empty, so only downloads hide.
 */
export function applyDownloadedVisibility<T extends { beatmapsetId: number }>(
  items: readonly T[],
  downloadedIds: readonly number[],
  opts?: SeenVisibilityOptions,
): DownloadVisibility<T> {
  const { visible, showingDownloadedFallback } = applySeenVisibility(
    items,
    downloadedIds,
    [],
    opts,
  )
  return { visible, showingDownloadedFallback }
}

/**
 * Unlimited-feed top-up guard (§AE): when hiding leaves the visible
 * list thin, the feed fetches the next window on its own instead of
 * waiting for the user to reach the bottom. Bounded — an
 * all-downloaded remainder must not loop forever.
 */
export const FEED_TOP_UP_THRESHOLD = 10
export const FEED_TOP_UP_MAX_CONSECUTIVE = 3

export function shouldTopUpFeed(args: {
  visibleCount: number
  totalCount: number
  ended: boolean
  loading: boolean
  showingFallback: boolean
  consecutiveTopUps: number
}): boolean {
  if (args.ended || args.loading || args.showingFallback) return false
  if (args.totalCount === 0) return false
  if (args.visibleCount >= FEED_TOP_UP_THRESHOLD) return false
  return args.consecutiveTopUps < FEED_TOP_UP_MAX_CONSECUTIVE
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
  // In-mode difficulties (same list pickDifficulty uses, minus the
  // finite-SR requirement — PP needs no star rating): the SR range
  // uses the finite-SR subset, the PP range uses every difficulty
  // with a numeric id.
  const inMode = (set.beatmaps ?? []).filter(
    (b): b is SearchDifficulty =>
      !!b && b.mode === mode && typeof b.id === 'number',
  )
  // SR range across the set's in-mode difficulties (same in-mode
  // list pickDifficulty uses, independent of the picked difficulty
  // and of any bounds): a set with 2.1★–6.8★ diffs must not be
  // presented as a single SR value.
  const inModeSrs = inMode
    .filter(
      (b) =>
        typeof b.difficulty_rating === 'number' && Number.isFinite(b.difficulty_rating),
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
    difficulties: inMode.map((b) => ({
      beatmapId: b.id,
      mode,
      checksum:
        typeof b.checksum === 'string' && b.checksum !== '' ? b.checksum : undefined,
      lastUpdated:
        typeof b.last_updated === 'string' && b.last_updated !== '' ? b.last_updated : undefined,
    })),
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
  return { ...filters, userTag: null }
}

/** Filters narrow the pool BEFORE scoring (§3) — they never re-sort.
 *  The user-tag filter is NOT applied here: it is enforced
 *  server-side by the `tag="..."` clause on every search query
 *  (buildCandidateQueries). Candidates carry no voted-tags field
 *  to check against — only mapper tags — so a client-side tag
 *  check would be mapper-text guessing, which batch 11 removed. */
export function applyFilters(
  candidates: RecCandidate[],
  filters: RecFilters,
  mode: GameMode,
): RecCandidate[] {
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
 * part 4 — downloaded/previously-seen hiding happens at list
 * level in the UI, not in this pool).
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
 * There is deliberately NO seen-set branch: Generated mode's
 * fetch-time exclusion is off (ignoreSeen), so the seen set can
 * never be what emptied this pool — downloaded/previously-seen
 * hiding happens at list level in the UI instead, with its own
 * exhaustion fallbacks (see applySeenVisibility).
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
     * always passes this (batch 6, part 4): the fetch-time
     * exclusion never applies here — downloaded and
     * previously-seen maps are hidden at list level by the UI
     * instead (applySeenVisibility), so the engine pool is
     * unaffected. The seen store itself is never touched by
     * this flag — the caller still marks served separately.
     * The Unlimited feed does NOT use this: its no-repeat
     * guarantee is its whole point. */
    ignoreSeen?: boolean
    /** Resume state from the previous window (see GenerationResume).
     * Ignored when `fresh` is set — a fresh run always restarts
     * from page 1. */
    resume?: GenerationResume
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

  return {
    items: ranked.slice(0, opts.count),
    totalMatched,
    poolSize,
    diagnostics,
    nextResume: { cursors: nextCursors },
  }
}

/** Max consecutive fetched windows skipped while hunting for an
 * unseen one (Renew-advance, 2026-10-29). Bounded so a spent pool
 * can never loop forever: after this many all-hidden windows the
 * last fetched window is returned and the caller shows it via
 * the exhaustion fallback with an honest note. */
export const MAX_UNSEEN_WINDOW_SKIPS = 5

export interface UnseenWindowResult {
  /** The window to display: the first with a visible item, or the
   * last fetched window when every window was hidden or the
   * cursor spent itself. */
  result: GenerateResult
  /** Fetched windows skipped because they yielded nothing visible. */
  skippedWindows: number
  /** True when the loop stopped at the skip cap with windows
   * still unfetched (the returned window may still be all-hidden). */
  hitSkipCap: boolean
}

/**
 * Renew-advance (2026-10-29): fetch windows until one yields a
 * visible map, instead of restarting from page 1. A window is
 * skipped only when it has items and EVERY one is hidden per
 * `isHidden` (downloaded or served before this press) — an
 * empty-items window is returned as-is so its diagnostics keep
 * driving the honest genuinely-empty state, and an exhausted
 * window is returned so the caller can show it via the
 * exhaustion fallback. `fresh` (restart) applies to the first
 * fetch only; continuation fetches always honour the resume.
 * The caller owns the `isHidden` snapshot (served-before plus
 * downloaded, captured before this press marks anything) and
 * marks only the returned window served — skipped windows were
 * fetched but never shown, so they must not count as appeared.
 */
export async function generateUnseenWindow(
  profile: SkillProfile,
  mode: GameMode,
  opts: Parameters<typeof generateRecommendations>[2],
  isHidden: (beatmapsetId: number) => boolean,
  maxSkips: number = MAX_UNSEEN_WINDOW_SKIPS,
): Promise<UnseenWindowResult> {
  let result = await generateRecommendations(profile, mode, opts)
  let skippedWindows = 0
  while (
    result.items.length > 0 &&
    result.items.every((c) => isHidden(c.beatmapsetId)) &&
    !result.diagnostics.windowExhausted &&
    skippedWindows < maxSkips
  ) {
    skippedWindows += 1
    result = await generateRecommendations(profile, mode, {
      ...opts,
      fresh: false,
      resume: result.nextResume,
    })
  }
  const hitSkipCap =
    skippedWindows >= maxSkips &&
    result.items.length > 0 &&
    result.items.every((c) => isHidden(c.beatmapsetId)) &&
    !result.diagnostics.windowExhausted
  return { result, skippedWindows, hitSkipCap }
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
