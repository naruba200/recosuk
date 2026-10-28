import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { isProxyConfigured, OsuServiceError, proxyCall, type OsuScore, type OsuUser } from './osu'
import { computeSkillProfile, type MostPlayedEntry, type SkillProfile } from './skillProfile'
import { getGuestSession, useGuestStore } from './guestStore'
import { useAuth } from './auth'
import { useModeStore } from './modeStore'
import { isGameMode, type GameMode } from './mode'
import type { AuthTier } from './capabilities'
import { seenStore } from './seenStore'
import type { RecCandidate } from './recommend'

// ---------------------------------------------------------------------------
// Welcome-recs handoff (M4): the Generating screen pre-generates the
// first recommendation set so /welcome-recs renders instantly (§5.3).
// ---------------------------------------------------------------------------

let welcomeCache: { username: string; mode: GameMode; items: RecCandidate[] } | null = null

export function setWelcomeRecs(username: string, mode: GameMode, items: RecCandidate[]): void {
  welcomeCache = { username: username.toLowerCase(), mode, items }
}

export function getWelcomeRecs(username: string, mode: GameMode): RecCandidate[] | null {
  if (!welcomeCache) return null
  if (welcomeCache.username !== username.toLowerCase() || welcomeCache.mode !== mode) return null
  return welcomeCache.items
}

/**
 * Feed the player's already-played beatmapset ids into the seen set
 * (from most-played + recent + top plays) so the recommendation engine
 * can penalise/exclude them (§13.2.4).
 */
export function seedPlayedSets(key: string, data: ProfileData | null | undefined): void {
  if (!data) return
  const ids = new Set<number>()
  for (const entry of data.mostPlayed ?? []) {
    if (entry?.beatmapset?.id) ids.add(entry.beatmapset.id)
    if (entry?.beatmap?.beatmapset_id) ids.add(entry.beatmap.beatmapset_id)
  }
  for (const play of [...(data.recentPlays ?? []), ...(data.topPlays ?? [])]) {
    if (play?.beatmap?.beatmapset_id) ids.add(play.beatmap.beatmapset_id)
  }
  if (ids.size > 0) seenStore.markMany(key, 'played', [...ids])
}

/**
 * Profile orchestration (PLAN-v2 §4/§8): (username, mode) → proxy calls
 * → SkillProfile, with persistence per tier:
 *   guest   → guestStore.skillProfiles[mode] (local only, §6)
 *   account → profiles.skill_profiles upsert + a stat_snapshots row
 *             (snapshots only on explicit generation/refresh, and all
 *             writes are best-effort — a failed write never breaks UI)
 *
 * Screens consume `useProfileData(mode)`. With no linked identity or no
 * proxy configured the status is 'demo' and screens render the Stitch
 * demo content instead.
 */

export interface ProfileData {
  user: OsuUser
  topPlays: OsuScore[]
  recentPlays: OsuScore[]
  mostPlayed: MostPlayedEntry[]
  skillProfile: SkillProfile
}

export type ProfileStatus = 'demo' | 'loading' | 'ready' | 'empty' | 'error'

export interface Identity {
  username: string
  osuUserId: number | null
  tier: AuthTier
}

interface PendingLink {
  osuUsername?: string
  osuUserId?: number | null
  playmode?: string
  selectedMode?: string
  accountLinked?: boolean
}

export function readPendingLink(): PendingLink | null {
  try {
    const raw = globalThis.localStorage?.getItem('recosuk-pending-link')
    return raw ? (JSON.parse(raw) as PendingLink) : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Fetch + compute (module-level cache so screens share one fetch per mode)
// ---------------------------------------------------------------------------

const cache = new Map<string, ProfileData>()
const inflight = new Map<string, Promise<ProfileData>>()

function cacheKey(username: string, mode: GameMode): string {
  return `${username.toLowerCase()}:${mode}`
}

export type GenerationStep = 'profile' | 'plays' | 'skill' | 'recs'

/**
 * The real generation pipeline, staged so the Generating screen can tie
 * its checklist to actual work (M4). Throws on proxy failure — callers
 * decide the fallback.
 */
export async function generateProfile(
  username: string,
  mode: GameMode,
  onStep?: (step: GenerationStep) => void,
): Promise<ProfileData> {
  onStep?.('profile')
  const user = await proxyCall<OsuUser>('getUser', { username, mode })
  // A 200 with no usable user must fail loudly here (as not-found),
  // never slide into `user.id` reads on undefined downstream.
  if (!user || typeof user.id !== 'number') {
    throw new OsuServiceError('not-found', 'osu! user not found')
  }
  onStep?.('plays')
  const [topPlays, recentPlays, mostPlayed] = await Promise.all([
    proxyCall<OsuScore[]>('getTopPlays', { userId: user.id, mode, limit: 100 }),
    proxyCall<OsuScore[]>('getRecentPlays', { userId: user.id, mode }).catch(
      () => [] as OsuScore[],
    ),
    // CRASH FIX (QA batch 2): this call used to omit `mode`, and the
    // Edge Function 400'd every profile generation (most-played was
    // always empty). The function no longer requires mode for this
    // action, but the client still sends it — correct either way.
    proxyCall<MostPlayedEntry[]>('getMostPlayed', { userId: user.id, mode }).catch(
      () => [] as MostPlayedEntry[],
    ),
  ])
  onStep?.('skill')
  const skillProfile = computeSkillProfile(user, topPlays, recentPlays, mostPlayed, mode)
  const data: ProfileData = { user, topPlays, recentPlays, mostPlayed, skillProfile }
  cache.set(cacheKey(username, mode), data)
  onStep?.('recs')
  return data
}

export function fetchProfileData(
  username: string,
  mode: GameMode,
  force = false,
): Promise<ProfileData> {
  const key = cacheKey(username, mode)
  if (!force) {
    const hit = cache.get(key)
    if (hit) return Promise.resolve(hit)
    const pending = inflight.get(key)
    if (pending) return pending
  }
  const promise = generateProfile(username, mode).finally(() => {
    inflight.delete(key)
  })
  inflight.set(key, promise)
  return promise
}

export function getCachedProfile(username: string, mode: GameMode): ProfileData | null {
  return cache.get(cacheKey(username, mode)) ?? null
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Persist a generated profile for the current tier. Best-effort:
 * resolves true when a write happened, false otherwise; never throws.
 * `snapshot` inserts a stat_snapshots row (accounts only) — pass it for
 * explicit generations/refreshes, not passive loads.
 */
export async function persistProfile(
  identity: Identity,
  mode: GameMode,
  data: ProfileData,
  opts: { snapshot?: boolean } = {},
): Promise<boolean> {
  try {
    const guest = getGuestSession()
    if (guest && guest.osuUsername.toLowerCase() === identity.username.toLowerCase()) {
      useGuestStore.getState().setSkillProfile(mode, data.skillProfile)
      return true
    }
    if (!supabase) return false
    const { data: authData } = await supabase.auth.getUser()
    const userId = authData.user?.id
    if (!userId) return false

    const { data: row } = await supabase
      .from('profiles')
      .select('skill_profiles')
      .eq('id', userId)
      .maybeSingle()
    const existing =
      (row?.skill_profiles as Partial<Record<GameMode, unknown>> | null) ?? {}
    await supabase.from('profiles').upsert(
      {
        id: userId,
        osu_username: identity.username,
        osu_user_id: data.user.id,
        selected_mode: mode,
        skill_profiles: { ...existing, [mode]: data.skillProfile },
      },
      { onConflict: 'id' },
    )
    if (opts.snapshot) {
      await supabase.from('stat_snapshots').insert({
        user_id: userId,
        mode,
        pp: data.skillProfile.pp,
        global_rank: data.skillProfile.globalRank,
        accuracy: data.skillProfile.accuracy,
        skill_profile: data.skillProfile,
      })
    }
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Identity + hook
// ---------------------------------------------------------------------------

interface AccountProfileRow {
  osu_username: string | null
  osu_user_id: number | null
  selected_mode: string | null
}

async function fetchAccountProfileRow(userId: string): Promise<AccountProfileRow | null> {
  if (!supabase) return null
  try {
    const { data } = await supabase
      .from('profiles')
      .select('osu_username, osu_user_id, selected_mode')
      .eq('id', userId)
      .maybeSingle()
    return (data as AccountProfileRow | null) ?? null
  } catch {
    return null
  }
}

export interface UseProfileData {
  status: ProfileStatus
  data: ProfileData | null
  error: string | null
  identity: Identity | null
  refresh: () => void
}

export function useProfileData(mode: GameMode): UseProfileData {
  const { user, tier, loading: authLoading } = useAuth()
  const guestSession = useGuestStore((s) => s.session)
  const [accountRow, setAccountRow] = useState<AccountProfileRow | null>(null)
  const [data, setData] = useState<ProfileData | null>(null)
  const [status, setStatus] = useState<ProfileStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const runRef = useRef(0)

  // Account identity comes from the profiles row (written at link time
  // or by guest→account conversion).
  useEffect(() => {
    if (!user) {
      setAccountRow(null)
      return
    }
    let active = true
    fetchAccountProfileRow(user.id).then((row) => {
      if (!active) return
      setAccountRow(row)
      if (row?.selected_mode && isGameMode(row.selected_mode)) {
        useModeStore.getState().initMode(row.selected_mode)
      }
    })
    return () => {
      active = false
    }
  }, [user])

  const pending = readPendingLink()
  const identity: Identity | null = (() => {
    if (guestSession) {
      return {
        username: guestSession.osuUsername,
        osuUserId: guestSession.osuUserId,
        tier: 'guest',
      }
    }
    if (user && accountRow?.osu_username) {
      return { username: accountRow.osu_username, osuUserId: accountRow.osu_user_id, tier: 'account' }
    }
    if (pending?.osuUsername) {
      return {
        username: pending.osuUsername,
        osuUserId: pending.osuUserId ?? null,
        tier: user ? 'account' : 'guest',
      }
    }
    return null
  })()

  const username = identity?.username ?? null

  // Mode-change loading (QA batch 2, item 5): when the requested
  // (username, mode) changes, drop the previous mode's data
  // SYNCHRONOUSLY (render-phase adjustment) so screens render the
  // loading state instead of showing stale data for a frame while
  // the new mode loads. A cached profile for the new key renders
  // immediately, with no fetch at all (see load() below).
  const requestKey = username ? cacheKey(username, mode) : null
  const [lastRequestKey, setLastRequestKey] = useState<string | null>(requestKey)
  if (requestKey !== lastRequestKey) {
    setLastRequestKey(requestKey)
    const cached = requestKey ? getCachedProfile(username as string, mode) : null
    setData(cached)
    setStatus(
      cached ? (cached.skillProfile.isStarter ? 'empty' : 'ready') : 'loading',
    )
    setError(null)
  }

  const load = useCallback(
    async (force: boolean, snapshot: boolean) => {
      if (!username || !isProxyConfigured) return
      const run = ++runRef.current
      const cached = getCachedProfile(username, mode)
      if (cached && !force) {
        setData(cached)
        setStatus(cached.skillProfile.isStarter ? 'empty' : 'ready')
        return
      }
      // Uncached load (new mode, or explicit refresh): clear the old
      // mode's data so the loading state shows instead of stale rows.
      setData(null)
      setStatus('loading')
      setError(null)
      try {
        const fresh = await fetchProfileData(username, mode, force)
        if (runRef.current !== run) return
        setData(fresh)
        setStatus(fresh.skillProfile.isStarter ? 'empty' : 'ready')
        if (identity) void persistProfile(identity, mode, fresh, { snapshot })
      } catch {
        if (runRef.current !== run) return
        setStatus('error')
        setError('Could not load your osu! data just now — the proxy or osu! may be unreachable.')
      }
    },
    // identity is derived per render; username+tier capture what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [username, tier, mode],
  )

  useEffect(() => {
    if (!isProxyConfigured || !username) {
      // Still waiting on auth/account-row resolution is not "demo".
      if (authLoading || (user && !accountRow && !pending?.osuUsername)) {
        setStatus('loading')
        return
      }
      setStatus('demo')
      setData(null)
      return
    }
    void load(false, false)
  }, [load, username, authLoading, user, accountRow, pending?.osuUsername])

  const refresh = useCallback(() => {
    void load(true, true)
  }, [load])

  return { status, data, error, identity, refresh }
}

// ---------------------------------------------------------------------------
// Snapshots (account only)
// ---------------------------------------------------------------------------

export interface StatSnapshot {
  id: string
  mode: string
  pp: number | null
  global_rank: number | null
  accuracy: number | null
  created_at: string
}

export function useSnapshots(mode: GameMode, refreshToken = 0): StatSnapshot[] | null {
  const { user } = useAuth()
  const [snapshots, setSnapshots] = useState<StatSnapshot[] | null>(null)

  useEffect(() => {
    if (!supabase || !user) {
      setSnapshots(null)
      return
    }
    let active = true
    supabase
      .from('stat_snapshots')
      .select('id, mode, pp, global_rank, accuracy, created_at')
      .eq('user_id', user.id)
      .eq('mode', mode)
      .order('created_at', { ascending: false })
      .limit(24)
      .then(({ data }) => {
        if (active) setSnapshots((data as StatSnapshot[] | null) ?? [])
      })
    return () => {
      active = false
    }
  }, [user, mode, refreshToken])

  return snapshots
}
