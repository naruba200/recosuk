import { modeLabel } from './mode'
import type { SkillProfile } from './skillProfile'

/**
 * The interpretation layer (PLAN-v2 §4.3) — RecOsuk's differentiator
 * over the osu! website. Every headline stat is rendered as:
 *   what it is → the user's value → why theirs is like that,
 * with the "why" computed from the user's own numbers. Pure template
 * functions over a SkillProfile: no I/O, fully unit-testable.
 */

export interface StatInterpretation {
  id: 'comfort' | 'ceiling' | 'bpm' | 'keys' | 'accuracy' | 'pp'
  /** Card heading, e.g. "Your comfort band". */
  title: string
  /** One plain sentence: what this stat represents. */
  what: string
  /** The user's value, formatted for the big metric slot. */
  value: string
  /** Short badge text for the card chip. */
  chip: string
  /** Why the user's value is like that — cites their actual numbers. */
  why: string
  /** 0–100 fill for the card's meter visual, where one makes sense. */
  meterPct?: number
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

export function fmtSr(n: number): string {
  return n.toFixed(1)
}

export function fmtAcc(n: number): string {
  return `${n.toFixed(1)}%`
}

export function interpretComfort(p: SkillProfile): StatInterpretation {
  if (p.isStarter) {
    return {
      id: 'comfort',
      title: 'Your comfort band',
      what: 'The star-rating range where your accuracy stays high and stable — maps here no longer train anything new.',
      value: `${fmtSr(p.comfortSrMin)}–${fmtSr(p.comfortSrMax)}★`,
      chip: 'Starter estimate',
      why: `You have no recorded top plays in ${modeLabel(p.mode)} yet, so this is a conservative starter range for the mode — it becomes personal after your first generated profile.`,
      meterPct: undefined,
    }
  }
  return {
    id: 'comfort',
    title: 'Your comfort band',
    what: 'The star-rating range where your accuracy stays high and stable — maps here no longer train anything new.',
    value: `${fmtSr(p.comfortSrMin)}–${fmtSr(p.comfortSrMax)}★`,
    chip: `${fmtAcc(p.comfortAccuracy)} avg accuracy • In the zone`,
    why: `You average ${fmtAcc(p.comfortAccuracy)} accuracy across your top plays between ${fmtSr(p.comfortSrMin)}★ and ${fmtSr(p.comfortSrMax)}★, so this band is where your skill is already consolidated.`,
    meterPct: Math.min(100, Math.max(0, p.comfortAccuracy)),
  }
}

export function interpretCeiling(p: SkillProfile): StatInterpretation {
  if (p.isStarter) {
    return {
      id: 'ceiling',
      title: 'Where it falls apart',
      what: 'The star rating where your accuracy drops sharply — the gap your recommendations are built to train.',
      value: `${fmtSr(p.srCeiling)}★`,
      chip: 'Starter estimate',
      why: `With no ${modeLabel(p.mode)} top plays yet we can't see your real ceiling; ${fmtSr(p.srCeiling)}★ is the typical first wall for this mode.`,
    }
  }
  if (p.ceilingAccuracy === null) {
    return {
      id: 'ceiling',
      title: 'Where it falls apart',
      what: 'The star rating where your accuracy drops sharply — the gap your recommendations are built to train.',
      value: `${fmtSr(p.srCeiling)}★`,
      chip: 'Not reached in top plays yet',
      why: `None of your top plays reach ${fmtSr(p.srCeiling)}★, so your ceiling is still unexplored — recommendations will probe just above your ${fmtSr(p.comfortSrMax)}★ comfort limit.`,
    }
  }
  const drop = Math.round((p.comfortAccuracy - p.ceilingAccuracy) * 10) / 10
  return {
    id: 'ceiling',
    title: 'Where it falls apart',
    what: 'The star rating where your accuracy drops sharply — the gap your recommendations are built to train.',
    value: fmtAcc(p.ceilingAccuracy),
    chip: `-${drop.toFixed(1)}% accuracy drop • Target gap`,
    why: `Your accuracy drops ${drop.toFixed(1)} points — from ${fmtAcc(p.comfortAccuracy)} in your comfort band to ${fmtAcc(p.ceilingAccuracy)} — once maps pass ${fmtSr(p.srCeiling)}★. This gap is what your recommendations target.`,
    meterPct: Math.min(100, Math.max(0, p.ceilingAccuracy)),
  }
}

export function interpretBpm(p: SkillProfile): StatInterpretation {
  if (p.isStarter || p.bpmSweetMax === 0) {
    return {
      id: 'bpm',
      title: 'Your best tempo',
      what: 'The BPM range where your best-performing plays cluster — your fingers are most precise at this speed.',
      value: `${p.bpmSweetMin}–${p.bpmSweetMax}`,
      chip: 'Starter estimate',
      why: `No tempo data yet for ${modeLabel(p.mode)} — ${p.bpmSweetMin}–${p.bpmSweetMax} BPM is the common training tempo for this mode.`,
    }
  }
  return {
    id: 'bpm',
    title: 'Your best tempo',
    what: 'The BPM range where your best-performing plays cluster — your fingers are most precise at this speed.',
    chip: 'Peak rhythm density • Sweet spot',
    value: `${p.bpmSweetMin}–${p.bpmSweetMax}`,
    why: `Your highest-pp plays cluster between ${p.bpmSweetMin} and ${p.bpmSweetMax} BPM (mean ${p.bpmMean} BPM across your top plays). Outside this range your accuracy and pp fall off.`,
    meterPct: undefined,
  }
}

export function interpretKeys(p: SkillProfile): StatInterpretation | null {
  if (p.mode !== 'mania') return null
  if (p.mainKeyCount === null || p.keySharePct === null) {
    return {
      id: 'keys',
      title: 'Your main key count',
      what: 'In Mania, a beatmap\'s circle size is its key count — this is the layout your hands know best.',
      value: '—',
      chip: 'No key data yet',
      why: 'Play some Mania maps and your key-count split will appear here.',
    }
  }
  return {
    id: 'keys',
    title: 'Your main key count',
    what: 'In Mania, a beatmap\'s circle size is its key count — this is the layout your hands know best.',
    value: `${p.mainKeyCount}K`,
    chip: `${p.keySharePct}% play distribution • Key preference`,
    why: `${p.keySharePct}% of your top plays are ${p.mainKeyCount}-key maps. Recommendations prioritise ${p.mainKeyCount}K practice maps, with other key counts mixed in as warmups.`,
    meterPct: p.keySharePct,
  }
}

export function interpretAccuracy(p: SkillProfile): StatInterpretation {
  const recent =
    p.recentAccuracy !== null
      ? ` Your recent plays average ${fmtAcc(p.recentAccuracy)}, ${
          p.recentAccuracy >= p.accuracy ? 'trending above' : 'just under'
        } your overall mark.`
      : ''
  return {
    id: 'accuracy',
    title: 'Overall accuracy',
    what: 'Your lifetime hit accuracy in this mode — how cleanly you hit notes across everything you have played.',
    value: fmtAcc(p.accuracy),
    chip: `${fmtInt(p.playCount)} plays counted`,
    why: `Across ${fmtInt(p.playCount)} plays your overall accuracy is ${fmtAcc(p.accuracy)}.${recent}`,
    meterPct: Math.min(100, Math.max(0, p.accuracy)),
  }
}

export function interpretPp(p: SkillProfile): StatInterpretation {
  const rankText =
    p.globalRank !== null ? `, ranked #${fmtInt(p.globalRank)} globally` : ''
  return {
    id: 'pp',
    title: 'Performance points',
    what: 'pp is osu!\'s skill score: your best plays count the most, and each new top play pushes the total up.',
    value: `${fmtInt(p.pp)}`,
    chip: p.globalRank !== null ? `Global #${fmtInt(p.globalRank)}` : 'Unranked',
    why: `Your ${fmtInt(p.pp)} pp comes mostly from your top ${p.topPlayCount} plays${rankText}. Because your accuracy holds to ${fmtSr(p.comfortSrMax)}★ and drops at ${fmtSr(p.srCeiling)}★, new pp will come from cleaning up plays in that gap band.`,
  }
}

/** The four cards of the onboarding stats reveal / Stats page, in order. */
export function interpretProfile(p: SkillProfile): StatInterpretation[] {
  const cards: StatInterpretation[] = [
    interpretComfort(p),
    interpretCeiling(p),
    interpretBpm(p),
  ]
  const keys = interpretKeys(p)
  if (keys) cards.push(keys)
  else cards.push(interpretAccuracy(p))
  return cards
}

/** One-line reason a recommendation trains this player's gap (§2.1 style). */
export function gapReason(p: SkillProfile, sr: number, bpm: number): string {
  if (sr >= p.srCeiling) {
    return `Your accuracy drops above ${fmtSr(p.srCeiling)}★ — this map trains that band at ${bpm} BPM.`
  }
  if (sr >= p.comfortSrMax) {
    return `Just past your ${fmtSr(p.comfortSrMax)}★ comfort limit — a stretch map at ${bpm} BPM, inside your ${p.bpmSweetMin}–${p.bpmSweetMax} tempo.`
  }
  return `Inside your ${fmtSr(p.comfortSrMin)}–${fmtSr(p.comfortSrMax)}★ comfort band at ${bpm} BPM — consolidation practice.`
}
