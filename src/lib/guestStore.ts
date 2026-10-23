import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type { GameMode } from './mode'

/**
 * Storage backend for the guest session. Resolves localStorage lazily on
 * every call (never captures a possibly-stale global) and falls back to
 * an in-memory map when localStorage is unavailable (private mode,
 * disabled storage, non-browser environments).
 */
const memoryFallback = new Map<string, string>()

const guestStateStorage: StateStorage = {
  getItem: (name) => {
    try {
      return globalThis.localStorage?.getItem(name) ?? memoryFallback.get(name) ?? null
    } catch {
      return memoryFallback.get(name) ?? null
    }
  },
  setItem: (name, value) => {
    memoryFallback.set(name, value)
    try {
      globalThis.localStorage?.setItem(name, value)
    } catch {
      /* in-memory copy above already holds it */
    }
  },
  removeItem: (name) => {
    memoryFallback.delete(name)
    try {
      globalThis.localStorage?.removeItem(name)
    } catch {
      /* ignore */
    }
  },
}

/**
 * Guest session — a linked osu! account with NO RecOsuk account
 * (PLAN-v2 §6). Lives in localStorage only; nothing reaches Postgres.
 * Guests get profile/stats/recommendations + preview/download, but
 * cannot save, create lists, or rate (see capabilities.ts).
 */
export interface GuestSession {
  osuUsername: string
  osuUserId: number | null
  /** The player's actual main mode, from the osu! API (`playmode`). */
  playmode: GameMode
  /** The mode the user is currently browsing in RecOsuk. */
  selectedMode: GameMode
  /** Per-mode skill profiles, keyed by GameMode (filled in M2). */
  skillProfiles: Partial<Record<GameMode, unknown>>
  generatedAt: string
}

export interface LinkGuestInput {
  osuUsername: string
  osuUserId?: number | null
  playmode?: GameMode
  selectedMode?: GameMode
  skillProfiles?: Partial<Record<GameMode, unknown>>
}

interface GuestState {
  session: GuestSession | null
  linkGuest: (input: LinkGuestInput) => void
  clearGuest: () => void
  setGuestMode: (mode: GameMode) => void
  /** Store a generated per-mode skill profile (M2, local only per §6). */
  setSkillProfile: (mode: GameMode, profile: unknown) => void
}

export const useGuestStore = create<GuestState>()(
  persist(
    (set) => ({
      session: null,

      linkGuest: (input) =>
        set({
          session: {
            osuUsername: input.osuUsername,
            osuUserId: input.osuUserId ?? null,
            playmode: input.playmode ?? input.selectedMode ?? 'osu',
            selectedMode: input.selectedMode ?? input.playmode ?? 'osu',
            skillProfiles: input.skillProfiles ?? {},
            generatedAt: new Date().toISOString(),
          },
        }),

      clearGuest: () => set({ session: null }),

      setGuestMode: (mode) =>
        set((state) =>
          state.session
            ? { session: { ...state.session, selectedMode: mode } }
            : state,
        ),

      setSkillProfile: (mode, profile) =>
        set((state) =>
          state.session
            ? {
                session: {
                  ...state.session,
                  skillProfiles: { ...state.session.skillProfiles, [mode]: profile },
                  generatedAt: new Date().toISOString(),
                },
              }
            : state,
        ),
    }),
    {
      name: 'recosuk-guest',
      storage: createJSONStorage(() => guestStateStorage),
      partialize: (state) => ({ session: state.session }),
    },
  ),
)

/** Non-hook accessor for the current guest session (may be null). */
export function getGuestSession(): GuestSession | null {
  return useGuestStore.getState().session
}
