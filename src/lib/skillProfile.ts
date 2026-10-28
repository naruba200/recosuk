import type { GameMode } from './mode'
import type { BeatmapsetSummary, OsuScore, OsuUser } from './osu'

/**
 * skillProfile() — the pure, mode-parameterised engine core (PLAN-v2
 * §2.1/§4). Turns raw osu! API payloads (user + top plays + recent plays
 * + most-played) into the SkillProfile every screen renders. No I/O, no
 * Date.now except the generatedAt stamp — fully unit-testable with
 * fixtures.
 *
 * Honesty rules baked in:
 * - A mode with no top plays returns a *starter* profile (isStarter)
 *   built from conservative global medians — never fake personal stats.
 * - Playstyle tags are derived only from data actually present in the
 *   plays (beatmapset tags, BPM, length, accuracy) — nothing invented.
 */

export interface MostPlayedEntry {
  count: number
  beatmap?: {
    id: number
    beatmapset_id?: number
    difficulty_rating?: number
    version?: string
  }
  beatmapset?: BeatmapsetSummary & { tags?: string }
}

/** Average accuracy for top plays inside one 0.5★-wide SR band. */
export interface AccuracyBand {
  min: number
  max: number
  avgAccuracy: number
  count: number
}

export interface SkillProfile {
  mode: GameMode
  pp: number
  globalRank: number | null
  countryRank: number | null
  /** Overall hit accuracy from the user's statistics (0–100). */
  accuracy: number
  playCount: number
  /** SR range (25th–75th percentile of top plays) the player is comfortable in. */
  comfortSrMin: number
  comfortSrMax: number
  /** Mean accuracy of top plays inside the comfort band. */
  comfortAccuracy: number
  /** SR where accuracy falls off a cliff (first band ≥4pts below comfort). */
  srCeiling: number
  /** Mean accuracy of top plays at/above the ceiling, if any exist. */
  ceilingAccuracy: number | null
  bpmSweetMin: number
  bpmSweetMax: number
  bpmMean: number
  /** Mean approach rate of top plays (drives Catch's ar_fit term); 0 when unknown. */
  avgAr: number
  /** Mania only: histogram of top plays by key count (rounded CS). */
  keyCounts: Partial<Record<number, number>>
  mainKeyCount: number | null
  /** Share (0–100) of top plays in the main key count, mania only. */
  keySharePct: number | null
  accuracyBands: AccuracyBand[]
  modUsage: { mod: string; count: number }[]
  playstyleTags: string[]
  /** Mean accuracy across recent plays, if any. */
  recentAccuracy: number | null
  topPlayCount: number
  /** True when the mode has no top plays — values are starter defaults. */
  isStarter: boolean
  generatedAt: string
}

/**
 * Starter defaults for the empty-mode case (PLAN-v2 §2.2). These are
 * conservative "typical ranked player" medians, chosen to aim the
 * recommendation engine at approachable Ranked maps — flagged in the UI
 * as starter picks, never presented as the player's real stats.
 * APPROXIMATION: hardcoded medians, not live global statistics.
 */
const STARTER_DEFAULTS: Record<
  GameMode,
  { comfortSrMin: number; comfortSrMax: number; srCeiling: number; bpmSweetMin: number; bpmSweetMax: number }
> = {
  osu: { comfortSrMin: 3.0, comfortSrMax: 4.0, srCeiling: 4.5, bpmSweetMin: 150, bpmSweetMax: 180 },
  taiko: { comfortSrMin: 3.0, comfortSrMax: 4.0, srCeiling: 4.5, bpmSweetMin: 150, bpmSweetMax: 180 },
  fruits: { comfortSrMin: 3.0, comfortSrMax: 4.0, srCeiling: 4.5, bpmSweetMin: 150, bpmSweetMax: 180 },
  mania: { comfortSrMin: 3.5, comfortSrMax: 4.5, srCeiling: 5.0, bpmSweetMin: 150, bpmSweetMax: 180 },
}

/** Pattern tags we know how to read out of beatmapset tag strings. */
const KNOWN_PATTERN_TAGS = [
  'stream',
  'jumpstream',
  'chordjack',
  'jack',
  'technical',
  'tech',
  'speed',
  'stamina',
  'ln',
  'long notes',
  'accuracy',
  'hybrid',
  'density',
] as const

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** Group top plays into 0.5★ bands and average their accuracy. */
export function accuracyBandsBySr(plays: OsuScore[]): AccuracyBand[] {
  const withSr = plays.filter(
    (p) => p.beatmap && typeof p.beatmap.difficulty_rating === 'number',
  )
  if (withSr.length === 0) return []
  const buckets = new Map<number, number[]>()
  for (const play of withSr) {
    const sr = play.beatmap!.difficulty_rating
    const bandMin = Math.floor(sr * 2) / 2
    const list = buckets.get(bandMin) ?? []
    list.push(play.accuracy * 100)
    buckets.set(bandMin, list)
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([min, accs]) => ({
      min,
      max: min + 0.5,
      avgAccuracy: round1(mean(accs) * 10) / 10,
      count: accs.length,
    }))
}

function derivePlaystyleTags(
  topPlays: OsuScore[],
  comfortAccuracy: number,
  bpmSweetMax: number,
): string[] {
  const tags: string[] = []
  // 1) Mapper/community tags attached to the beatmapsets of top plays.
  const tagCounts = new Map<string, number>()
  let taggedSets = 0
  for (const play of topPlays) {
    const raw = (play.beatmapset as (BeatmapsetSummary & { tags?: string }) | undefined)?.tags
    if (!raw) continue
    taggedSets += 1
    const words = raw.toLowerCase().split(/\s+/)
    for (const known of KNOWN_PATTERN_TAGS) {
      if (words.some((w) => w === known || w.startsWith(known))) {
        tagCounts.set(known, (tagCounts.get(known) ?? 0) + 1)
      }
    }
  }
  if (taggedSets >= 3) {
    for (const [tag, count] of tagCounts) {
      if (count / taggedSets >= 0.25) tags.push(tag === 'ln' ? 'long notes' : tag)
    }
  }
  // 2) Tempo: a sweet spot that reaches 200+ BPM is a speed profile.
  if (bpmSweetMax >= 200 && !tags.includes('speed')) tags.push('speed')
  // 3) Length: long maps dominating top plays signals stamina.
  const lengths = topPlays
    .map((p) => p.beatmap?.total_length ?? 0)
    .filter((n) => n > 0)
  if (lengths.length >= 3 && mean(lengths) >= 240 && !tags.includes('stamina')) {
    tags.push('stamina')
  }
  // 4) Precision: near-perfect accuracy inside the comfort band.
  if (comfortAccuracy >= 98 && !tags.includes('accuracy')) tags.push('accuracy')
  return tags.slice(0, 5)
}

export function computeSkillProfile(
  user: OsuUser,
  topPlays: OsuScore[],
  recentPlays: OsuScore[],
  _mostPlayed: MostPlayedEntry[],
  mode: GameMode,
  now: Date = new Date(),
): SkillProfile {
  const stats = user.statistics ?? {}
  const base = {
    mode,
    pp: stats.pp ?? 0,
    globalRank: stats.global_rank ?? null,
    countryRank: stats.country_rank ?? null,
    accuracy: stats.hit_accuracy ?? 0,
    playCount: stats.play_count ?? 0,
    generatedAt: now.toISOString(),
  }

  const plays = (topPlays ?? []).filter((p) => p && p.beatmap)
  if (plays.length === 0) {
    const d = STARTER_DEFAULTS[mode]
    return {
      ...base,
      comfortSrMin: d.comfortSrMin,
      comfortSrMax: d.comfortSrMax,
      comfortAccuracy: 0,
      srCeiling: d.srCeiling,
      ceilingAccuracy: null,
      bpmSweetMin: d.bpmSweetMin,
      bpmSweetMax: d.bpmSweetMax,
      bpmMean: Math.round((d.bpmSweetMin + d.bpmSweetMax) / 2),
      avgAr: 0,
      keyCounts: {},
      mainKeyCount: null,
      keySharePct: null,
      accuracyBands: [],
      modUsage: [],
      playstyleTags: [],
      recentAccuracy: null,
      topPlayCount: 0,
      isStarter: true,
    }
  }

  // Calibration needs star ratings. Plays whose beatmap lacks a finite
  // difficulty_rating carry no calibration signal — a malformed
  // top-plays payload used to poison every band with NaN. When no
  // play has one, fall back to the starter band values while keeping
  // the real play count, tags, and stats, so the profile stays honest
  // about what it actually knows.
  const srPlays = plays.filter(
    (p) =>
      typeof p.beatmap!.difficulty_rating === 'number' &&
      Number.isFinite(p.beatmap!.difficulty_rating),
  )
  const srs = srPlays.map((p) => p.beatmap!.difficulty_rating).sort((a, b) => a - b)
  const comfortSrMin =
    srs.length > 0 ? round1(percentile(srs, 0.25)) : STARTER_DEFAULTS[mode].comfortSrMin
  const comfortSrMax =
    srs.length > 0 ? round1(percentile(srs, 0.75)) : STARTER_DEFAULTS[mode].comfortSrMax

  const inComfort = plays.filter(
    (p) =>
      p.beatmap!.difficulty_rating >= comfortSrMin &&
      p.beatmap!.difficulty_rating <= comfortSrMax,
  )
  const comfortAccuracy = round1(mean(inComfort.map((p) => p.accuracy * 100)) * 10) / 10

  const bands = accuracyBandsBySr(plays)
  // Ceiling: first band above the comfort range whose accuracy falls at
  // least 4 points below the comfort-band accuracy.
  let srCeiling =
    srs.length > 0 ? round1(comfortSrMax + 0.3) : STARTER_DEFAULTS[mode].srCeiling
  for (const band of bands) {
    if (band.min >= comfortSrMax && band.avgAccuracy <= comfortAccuracy - 4) {
      srCeiling = band.min
      break
    }
  }
  const aboveCeiling = plays.filter((p) => p.beatmap!.difficulty_rating >= srCeiling)
  const ceilingAccuracy =
    aboveCeiling.length > 0
      ? round1(mean(aboveCeiling.map((p) => p.accuracy * 100)) * 10) / 10
      : null

  // BPM sweet spot: 25th–75th percentile of BPM across the top half of
  // plays by pp (best-performing plays), falling back to all plays.
  const byPp = [...plays].sort((a, b) => (b.pp ?? 0) - (a.pp ?? 0))
  const bestHalf = byPp.slice(0, Math.max(1, Math.ceil(byPp.length / 2)))
  const bpms = bestHalf
    .map((p) => p.beatmap?.bpm ?? 0)
    .filter((n) => n > 0)
    .sort((a, b) => a - b)
  const allBpms = plays.map((p) => p.beatmap?.bpm ?? 0).filter((n) => n > 0)
  const bpmSweetMin = bpms.length ? Math.round(percentile(bpms, 0.25)) : 0
  const bpmSweetMax = bpms.length ? Math.round(percentile(bpms, 0.75)) : 0
  const bpmMean = allBpms.length ? Math.round(mean(allBpms)) : 0
  const ars = plays.map((p) => p.beatmap?.ar ?? 0).filter((n) => n > 0)
  const avgAr = ars.length ? Math.round(mean(ars) * 10) / 10 : 0

  // Mania key counts: CS on a mania beatmap IS the key count (§10 risk).
  const keyCounts: Partial<Record<number, number>> = {}
  let mainKeyCount: number | null = null
  let keySharePct: number | null = null
  if (mode === 'mania') {
    let counted = 0
    for (const play of plays) {
      const cs = play.beatmap?.cs
      if (typeof cs !== 'number') continue
      const keys = Math.round(cs)
      keyCounts[keys] = (keyCounts[keys] ?? 0) + 1
      counted += 1
    }
    let best = 0
    for (const [keys, rawCount] of Object.entries(keyCounts)) {
      const count = rawCount ?? 0
      if (count > best) {
        best = count
        mainKeyCount = Number(keys)
      }
    }
    if (counted > 0 && mainKeyCount !== null) {
      keySharePct = Math.round((best / counted) * 100)
    }
  }

  const modCounts = new Map<string, number>()
  for (const play of [...plays, ...(recentPlays ?? [])]) {
    for (const mod of play.mods ?? []) {
      modCounts.set(mod, (modCounts.get(mod) ?? 0) + 1)
    }
  }
  const modUsage = [...modCounts.entries()]
    .map(([mod, count]) => ({ mod, count }))
    .sort((a, b) => b.count - a.count)

  const recent = (recentPlays ?? []).filter((p) => typeof p.accuracy === 'number')
  const recentAccuracy =
    recent.length > 0 ? round1(mean(recent.map((p) => p.accuracy * 100)) * 10) / 10 : null

  return {
    ...base,
    comfortSrMin,
    comfortSrMax,
    comfortAccuracy,
    srCeiling,
    ceilingAccuracy,
    bpmSweetMin,
    bpmSweetMax,
    bpmMean,
    avgAr,
    keyCounts,
    mainKeyCount,
    keySharePct,
    accuracyBands: bands,
    modUsage,
    playstyleTags: derivePlaystyleTags(plays, comfortAccuracy, bpmSweetMax),
    recentAccuracy,
    topPlayCount: plays.length,
    isStarter: false,
  }
}
