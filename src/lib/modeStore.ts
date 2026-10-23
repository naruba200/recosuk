import { create } from 'zustand'
import { GAME_MODES, isGameMode, type GameMode } from './mode'
import { getGuestSession, useGuestStore } from './guestStore'

/**
 * Global mode state (PLAN-v2 §2.2). One store, every screen reads it:
 * profile, stats, recommendations, filters and Mirror all follow the
 * chosen mode. Mode accents come from the `modes` tokens in
 * tailwind.config.js — screens set `data-mode={mode}` on a wrapper and
 * use `MODE_ACCENTS[mode]` / the `bg-modes-*` classes to re-tint.
 */
export const MODE_ACCENTS: Record<GameMode, string> = {
  osu: '#FF66AA',
  taiko: '#FF5C39',
  fruits: '#4CC3FF',
  mania: '#9D6BFF',
}

/** Short labels used by the circular header mode pills (Stitch shell). */
export const MODE_PILL_LABELS: Record<GameMode, string> = {
  osu: 'std',
  taiko: 'tai',
  fruits: 'ctb',
  mania: 'mna',
}

const MODE_STORAGE_KEY = 'recosuk-mode'

function readStoredMode(): GameMode | null {
  try {
    const raw = globalThis.localStorage?.getItem(MODE_STORAGE_KEY)
    return isGameMode(raw) ? raw : null
  } catch {
    return null
  }
}

function writeStoredMode(mode: GameMode): void {
  try {
    globalThis.localStorage?.setItem(MODE_STORAGE_KEY, mode)
  } catch {
    /* private mode — mode just won't persist */
  }
}

/**
 * Initial mode resolution order (PLAN-v2 §2.2 + build brief):
 *   1. an explicitly stored choice (recosuk-mode)
 *   2. the guest session's selected mode / playmode
 *   3. 'mania' — the demo persona's main, and the most sensible default
 *      for an unlinked first run of this app.
 * Account profiles are applied later by profileService via
 * `initMode()` once the profiles row has been read (and only when the
 * user hasn't already picked a mode this session).
 */
export function resolveInitialMode(): GameMode {
  const stored = readStoredMode()
  if (stored) return stored
  const guest = getGuestSession()
  if (guest) return guest.selectedMode ?? guest.playmode
  return 'mania'
}

interface ModeState {
  mode: GameMode
  /** True once the user has explicitly picked a mode (pill/tab click). */
  userPicked: boolean
  setMode: (mode: GameMode) => void
  /** Adopt a mode from an external source (account profile) unless the
   *  user already picked one themselves. */
  initMode: (mode: GameMode) => void
}

export const useModeStore = create<ModeState>()((set, get) => ({
  mode: resolveInitialMode(),
  userPicked: false,

  setMode: (mode) => {
    if (!isGameMode(mode)) return
    writeStoredMode(mode)
    // Guests persist their browsing mode in the guest session too (§6).
    if (getGuestSession()) useGuestStore.getState().setGuestMode(mode)
    set({ mode, userPicked: true })
  },

  initMode: (mode) => {
    if (!isGameMode(mode)) return
    if (get().userPicked) return
    if (readStoredMode()) return
    set({ mode })
  },
}))

/** Non-hook accessor (services, tests). */
export function getCurrentMode(): GameMode {
  return useModeStore.getState().mode
}

export { GAME_MODES }
