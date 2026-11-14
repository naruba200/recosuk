import type { GameMode } from './mode'

/**
 * osu! game modifiers for the Recommendations mod picker (§AY).
 *
 * Bit values are the LEGACY bitset from the rosu-mods crate —
 * the exact table rosu-pp converts a u32 into (GameModsLegacy):
 * https://github.com/MaxOhn/rosu-mods/blob/main/src/legacy.rs
 * Cross-checked against the osu! wiki .osr table, which lists
 * the same values (HD 8, HR 16, DT 64, NC "always used with DT:
 * 512 + 64 = 576"):
 * https://osu.ppy.sh/wiki/en/Client/File_formats/osr_%28file_format%29
 *
 * NC FINDING: Nightcore's constant INCLUDES the DoubleTime bit —
 * `Nightcore = (1 << 9) | DoubleTime` = 512 | 64 = 576. rosu-mods'
 * `clock_rate()` applies 1.5x only when the set `contains`
 * DoubleTime, so passing the bare 1<<9 bit (512) would compute
 * at 1.0x — the wrong speed. NC is therefore stored here as 576,
 * and `combineMods(['NC'])` returns 576. The same composite
 * pattern holds for Perfect: PF = (1 << 14) | SuddenDeath =
 * 16384 | 32 = 16416.
 *
 * Only the mods the picker offers are in this map. Relax (RX)
 * and Autoplay (AP) are deliberately excluded — they trivialise
 * the play and have no place in a recommendation.
 */

/** Acronym → legacy bit value, for every mod the picker offers. */
export const MOD_BITS: Record<string, number> = {
  NF: 1,
  EZ: 2,
  HD: 8,
  HR: 16,
  SD: 32,
  DT: 64,
  HT: 256,
  NC: 576,
  FL: 1024,
  SO: 4096,
  PF: 16416,
  FI: 1048576,
  '4K': 32768,
  '5K': 65536,
  '6K': 131072,
  '7K': 262144,
  '8K': 524288,
  '9K': 16777216,
}

/** The shared picker set (osu / taiko / catch). */
const BASE_MODS = ['HD', 'HR', 'DT', 'NC', 'HT', 'FL', 'NF', 'EZ', 'SO', 'SD', 'PF']

/** Mania-only additions: key-count mods + Fade In. */
const MANIA_EXTRA_MODS = ['4K', '5K', '6K', '7K', '8K', '9K', 'FI']

/** Mods the picker offers for one mode, in display order. */
export function modsForMode(mode: GameMode): string[] {
  return mode === 'mania' ? [...BASE_MODS, ...MANIA_EXTRA_MODS] : [...BASE_MODS]
}

/** Mods that cannot coexist with the given mod (standard osu! rules). */
const CONFLICTS: Record<string, string[]> = {
  DT: ['HT', 'NC'],
  NC: ['DT', 'HT'],
  HT: ['DT', 'NC'],
  HR: ['EZ'],
  EZ: ['HR'],
  SD: ['PF'],
  PF: ['SD'],
}

/** Key-count mods: only one at a time (standard osu! behaviour). */
const KEY_MODS = ['4K', '5K', '6K', '7K', '8K', '9K']

/**
 * Toggle one mod in a selection, enforcing the conflict rules:
 * picking a mod unpicks its conflicts (and any other key mod);
 * toggling an active mod off just removes it. Unrelated mods
 * are untouched. Unknown acronyms toggle plainly.
 */
export function applyModToggle(selected: readonly string[], toggled: string): string[] {
  if (selected.includes(toggled)) return selected.filter((m) => m !== toggled)
  const removed = new Set<string>(CONFLICTS[toggled] ?? [])
  if (KEY_MODS.includes(toggled)) {
    for (const k of KEY_MODS) removed.add(k)
  }
  return [...selected.filter((m) => !removed.has(m)), toggled]
}

/** Combine selected acronyms into one legacy bitmask (OR). Unknown acronyms are ignored. */
export function combineMods(acronyms: readonly string[]): number {
  let bits = 0
  for (const acronym of acronyms) {
    const value = MOD_BITS[acronym]
    if (typeof value === 'number') bits |= value
  }
  return bits
}
