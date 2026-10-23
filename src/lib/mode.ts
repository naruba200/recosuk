/**
 * The single source of truth for osu! game modes (PLAN-v2 §2/§8).
 * API strings come from osu! API v2 — note Catch is `fruits` in the API
 * and must never be shown to the user as "fruits".
 */
export type GameMode = 'osu' | 'taiko' | 'fruits' | 'mania'

export const GAME_MODES: readonly GameMode[] = ['osu', 'taiko', 'fruits', 'mania']

export const MODE_LABELS: Record<GameMode, string> = {
  osu: 'Standard',
  taiko: 'Taiko',
  fruits: 'Catch',
  mania: 'Mania',
}

export function isGameMode(value: unknown): value is GameMode {
  return (
    typeof value === 'string' &&
    (GAME_MODES as readonly string[]).includes(value)
  )
}

/** Label for UI display; falls back to the raw value for unknown modes. */
export function modeLabel(mode: string): string {
  return isGameMode(mode) ? MODE_LABELS[mode] : mode
}
