import { useMemo } from 'react'
import { useAuth } from './auth'

/**
 * Auth tiers and what each tier may do (PLAN-v2 §6).
 * Gating is also enforced structurally by Supabase RLS — guests have no
 * auth user, so there is no row for them to write to. This hook is the
 * UI half: gated buttons render locked, never hidden.
 */
export type AuthTier = 'account' | 'guest' | 'none'

export interface TierCapabilities {
  /** Save beatmaps (e.g. from a recommendation card). */
  canSave: boolean
  /** Create / edit user lists. */
  canCreateLists: boolean
  /** Rate beatmaps / mark tried — feeds the learning loop. */
  canRate: boolean
  /** Ratings re-weight future recommendations. */
  canLearn: boolean
  /** Stat snapshots + progress-over-time history (account only). */
  canSnapshotHistory: boolean
  /** Download .osz files (Recommendations + Mirror). */
  canDownload: boolean
  /** Play beatmap audio previews. */
  canPreview: boolean
}

export function tierCapabilities(tier: AuthTier): TierCapabilities {
  switch (tier) {
    case 'account':
      return {
        canSave: true,
        canCreateLists: true,
        canRate: true,
        canLearn: true,
        canSnapshotHistory: true,
        canDownload: true,
        canPreview: true,
      }
    case 'guest':
      return {
        canSave: false,
        canCreateLists: false,
        canRate: false,
        canLearn: false,
        canSnapshotHistory: false,
        canDownload: true,
        canPreview: true,
      }
    case 'none':
      // No link at all: Mirror browsing only (preview + download there).
      return {
        canSave: false,
        canCreateLists: false,
        canRate: false,
        canLearn: false,
        canSnapshotHistory: false,
        canDownload: true,
        canPreview: true,
      }
  }
}

export interface Capabilities extends TierCapabilities {
  tier: AuthTier
  isAccount: boolean
  isGuest: boolean
}

/** The one hook every gated control should read (PLAN-v2 §6). */
export function useCapabilities(): Capabilities {
  const { tier } = useAuth()
  return useMemo(
    () => ({
      ...tierCapabilities(tier),
      tier,
      isAccount: tier === 'account',
      isGuest: tier === 'guest',
    }),
    [tier],
  )
}
