import { useCallback, useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { isProxyConfigured, OsuServiceError, proxyCall, rateLimitMessage, type OsuScore, type OsuUser } from './osu'
import { SNAPSHOT_THROTTLE_MS } from './proxyLimits'
import { computeSkillProfile, type MostPlayedEntry, type SkillProfile } from './skillProfile'
import { createProfileWatcher, type ProfileWatcher } from './profileWatcher'
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
 * proxy configured the status is 'empty' and screens render an honest
 * empty state instead.
 */

export interface ProfileData {
  user: OsuUser
  topPlays: OsuScore[]
  recentPlays: OsuScore[]
  mostPlayed: MostPlayedEntry[]
  skillProfile: SkillProfile
}

export type ProfileStatus = 'loading' | 'ready' | 'empty' | 'error'

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

// Single-owner guard for the new-play watcher (§AK): useProfileData is
// mounted by seven screens, but only one instance may poll at a time.
// The owner is a requestKey (username:mode); navigating away releases
// it so the next screen's instance can take over.
let profileWatcherOwner: string | null = null

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
    // §AQ item 7: fetch once with limit 100 (the proxy clamps to
    // 100) so past days' plays are in the list — the section
    // reveals them 24 at a time instead of stopping at 24.
    proxyCall<OsuScore[]>('getRecentPlays', { userId: user.id, mode, limit: 100 }).catch(
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
 * `client` is an injection seam for tests (the lists service takes its
 * client the same way); callers omit it and the module client is used.
 */
export async function persistProfile(
  identity: Identity,
  mode: GameMode,
  data: ProfileData,
  opts: { snapshot?: boolean; client?: SupabaseClient | null } = {},
): Promise<boolean> {
  try {
    const guest = getGuestSession()
    if (guest && guest.osuUsername.toLowerCase() === identity.username.toLowerCase()) {
      useGuestStore.getState().setSkillProfile(mode, data.skillProfile)
      return true
    }
    const db = opts.client ?? supabase
    if (!db) return false
    const { data: authData } = await db.auth.getUser()
    const userId = authData.user?.id
    if (!userId) return false

    const { data: row } = await db
      .from('profiles')
      .select('skill_profiles')
      .eq('id', userId)
      .maybeSingle()
    const existing =
      (row?.skill_profiles as Partial<Record<GameMode, unknown>> | null) ?? {}
    await db.from('profiles').upsert(
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
      // Snapshot throttle (batch AP item 2d): at most one snapshot
      // per user per mode per hour. The DB trigger in migration 004
      // is the real enforcement; this pre-check keeps the common
      // case from hitting it — a rapid second "Sync now" simply
      // skips the insert instead of erroring. The latest row is
      // read (not a time-filtered query) so the check works with
      // the query shapes the fake DB in tests supports.
      const { data: latest } = await db
        .from('stat_snapshots')
        .select('created_at')
        .eq('user_id', userId)
        .eq('mode', mode)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const lastMs = latest?.created_at ? Date.parse(latest.created_at) : NaN
      if (!Number.isFinite(lastMs) || Date.now() - lastMs >= SNAPSHOT_THROTTLE_MS) {
        await db.from('stat_snapshots').insert({
          user_id: userId,
          mode,
          pp: data.skillProfile.pp,
          global_rank: data.skillProfile.globalRank,
          accuracy: data.skillProfile.accuracy,
          skill_profile: data.skillProfile,
        })
      }
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
  /** Per-mode stored skill profiles (`{ [mode]: SkillProfile }`),
   * written by persistProfile; read here so the sidebar pp needs
   * no second fetch and no osu! API call (batch 12, part 11). */
  skill_profiles: Record<string, unknown> | null
}

async function fetchAccountProfileRow(userId: string): Promise<AccountProfileRow | null> {
  if (!supabase) return null
  try {
    const { data } = await supabase
      .from('profiles')
      .select('osu_username, osu_user_id, selected_mode, skill_profiles')
      .eq('id', userId)
      .maybeSingle()
    return (data as AccountProfileRow | null) ?? null
  } catch {
    return null
  }
}

// Shared account-row fetch (batch 10): the profiles-row lookup used to
// live inside useProfileData only, so page shells that needed just the
// linked osu! name (Beatmaps/Collections/History/Lists) read the guest
// session alone and showed "Guest" for signed-in account users. This
// hook owns the row fetch; useProfileData consumes it, and the sidebar
// identity hook consumes it too. Concurrent instances share one
// in-flight request per user id; sequential mounts refetch, matching
// the previous per-hook behaviour.
const accountRowRequests = new Map<string, Promise<AccountProfileRow | null>>()

function fetchAccountProfileRowShared(userId: string): Promise<AccountProfileRow | null> {
  const pending = accountRowRequests.get(userId)
  if (pending) return pending
  const request = fetchAccountProfileRow(userId).finally(() => {
    if (accountRowRequests.get(userId) === request) accountRowRequests.delete(userId)
  })
  accountRowRequests.set(userId, request)
  return request
}

export function useAccountProfileRow(): {
  accountRow: AccountProfileRow | null
  loaded: boolean
} {
  const { user } = useAuth()
  const [accountRow, setAccountRow] = useState<AccountProfileRow | null>(null)
  const [loaded, setLoaded] = useState(false)

  // Account identity comes from the profiles row (written at link time
  // or by guest→account conversion).
  useEffect(() => {
    if (!user) {
      setAccountRow(null)
      setLoaded(true)
      return
    }
    let active = true
    // Clear any previous user's row immediately so a stale name never
    // flashes while the new user's row loads.
    setAccountRow(null)
    setLoaded(false)
    fetchAccountProfileRowShared(user.id).then((row) => {
      if (!active) return
      setAccountRow(row)
      if (row?.selected_mode && isGameMode(row.selected_mode)) {
        useModeStore.getState().initMode(row.selected_mode)
      }
      setLoaded(true)
    })
    return () => {
      active = false
    }
  }, [user])

  return { accountRow, loaded }
}

export interface SidebarIdentityInput {
  /** Canonical name from fetched profile data (useProfileData data.user.username). */
  profileUsername?: string | null
  /** Identity from useProfileData (guest session > account row > pending link). */
  identityUsername?: string | null
  /** Account profiles-row osu_username (useAccountProfileRow). */
  accountUsername?: string | null
  /** Guest session name. */
  guestUsername?: string | null
  /** Pending-link name (localStorage, pre-conversion). */
  pendingUsername?: string | null
  /** Signed-in user's email. */
  email?: string | null
  /** True while auth/account-row resolution is still pending. */
  resolving: boolean
}

/**
 * Sidebar display-name resolution (batch 10, single shared chain —
 * mirrors Settings). Priority: fetched profile name → profile-data
 * identity → account profiles row → guest session → pending link →
 * signed-in email → 'Guest'. Returns null ONLY while resolution is
 * still pending and no name is known yet, so callers render a neutral
 * placeholder instead of flashing 'Guest' for an account user whose
 * row hasn't loaded.
 */
export function resolveSidebarIdentity(input: SidebarIdentityInput): string | null {
  const candidates = [
    input.profileUsername,
    input.identityUsername,
    input.accountUsername,
    input.guestUsername,
    input.pendingUsername,
  ]
  for (const candidate of candidates) {
    const name = candidate?.trim()
    if (name) return name
  }
  if (input.resolving) return null
  const email = input.email?.trim()
  return email ? email : 'Guest'
}

/**
 * Sidebar identity for page shells that don't load full profile data
 * (Beatmaps/Collections/History/Lists): resolves the display name from
 * the account profiles row, guest session, and pending link, without
 * fetching osu! profile data. Returns null while resolution is still
 * pending — callers render a placeholder ('Loading…', matching
 * Dashboard/Stats) instead of flashing 'Guest'.
 */
export function useSidebarIdentity(): {
  username: string | null
  pp: number | null
  avatarUrl: string | null
  resolving: boolean
} {
  const { user, loading: authLoading, guestSession } = useAuth()
  const { accountRow, loaded: accountRowLoaded } = useAccountProfileRow()
  const mode = useModeStore((s) => s.mode)
  const pending = readPendingLink()
  const pendingUsername = pending?.osuUsername ?? null
  const guestUsername = guestSession?.osuUsername ?? null
  const resolving =
    authLoading || (!!user && !accountRowLoaded && !pendingUsername && !guestUsername)
  const username = resolveSidebarIdentity({
    accountUsername: accountRow?.osu_username ?? null,
    guestUsername,
    pendingUsername,
    email: user?.email ?? null,
    resolving,
  })
  // pp/avatar resolve from STORED sources only (same single row
  // fetch for accounts, the local guest session for guests) — no
  // osu! API call on these pages. While the name is still
  // resolving, pp/avatar stay null too, so shells never flash
  // "0 pp" or an avatar built from a missing id.
  const details = resolveSidebarPpAvatar({
    accountSkillProfiles: accountRow?.skill_profiles ?? null,
    guestSkillProfile: guestSession?.skillProfiles?.[mode] ?? null,
    accountUserId: accountRow?.osu_user_id ?? null,
    guestUserId: guestSession?.osuUserId ?? null,
    pendingUserId: pending?.osuUserId ?? null,
    mode,
  })
  if (username === null) {
    return { username: null, pp: null, avatarUrl: null, resolving: true }
  }
  return { username, pp: details.pp, avatarUrl: details.avatarUrl, resolving: false }
}

/** pp from one stored skill-profile value (unknown-shaped JSONB /
 * local-store payload). Only a finite, non-negative numeric `pp`
 * counts — a stored profile with pp 0 is a real 0, not "unknown". */
export function storedSkillProfilePp(stored: unknown): number | null {
  const rec =
    stored && typeof stored === 'object' && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : null
  const pp = rec?.pp
  return typeof pp === 'number' && Number.isFinite(pp) && pp >= 0 ? pp : null
}

/** Avatar URL for an osu! user id, or null when no usable id is
 * known. Never build a URL from a missing id (a `…/null` avatar
 * would render broken). */
export function avatarUrlForUserId(userId: number | null | undefined): string | null {
  return typeof userId === 'number' && Number.isFinite(userId) && userId > 0
    ? `https://a.ppy.sh/${userId}`
    : null
}

export interface SidebarPpAvatarInput {
  /** Account profiles-row `skill_profiles` map (all modes). */
  accountSkillProfiles?: unknown
  /** Guest session's stored profile for the current mode. */
  guestSkillProfile?: unknown
  accountUserId?: number | null
  guestUserId?: number | null
  pendingUserId?: number | null
  mode: GameMode
}

/**
 * Sidebar pp + avatar resolution (batch 12, part 11), sharing the
 * name chain's source priority: account stored profile first, then
 * the guest session, then the pending link (avatar id only — a
 * pending link carries no skill profile). No fetch: every input is
 * already in hand on the calling shell. `countryCode` is
 * deliberately NOT resolved here — no stored source carries it,
 * and fetching for it alone is not worth it.
 */
export function resolveSidebarPpAvatar(
  input: SidebarPpAvatarInput,
): { pp: number | null; avatarUrl: string | null } {
  const profiles =
    input.accountSkillProfiles &&
    typeof input.accountSkillProfiles === 'object' &&
    !Array.isArray(input.accountSkillProfiles)
      ? (input.accountSkillProfiles as Record<string, unknown>)
      : null
  const pp =
    storedSkillProfilePp(profiles?.[input.mode]) ??
    storedSkillProfilePp(input.guestSkillProfile)
  const avatarUrl =
    avatarUrlForUserId(input.accountUserId) ??
    avatarUrlForUserId(input.guestUserId) ??
    avatarUrlForUserId(input.pendingUserId)
  return { pp, avatarUrl }
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
  const { accountRow } = useAccountProfileRow()
  const [data, setData] = useState<ProfileData | null>(null)
  const [status, setStatus] = useState<ProfileStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const runRef = useRef(0)
  // True while a profile fetch is in flight — lets the auto-refresh
  // skip a redundant refetch instead of stacking on a manual one.
  const loadInFlightRef = useRef(false)

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
    async (
      force: boolean,
      snapshot: boolean,
      quiet = false,
    ): Promise<ProfileData | null> => {
      if (!username || !isProxyConfigured) return null
      const run = ++runRef.current
      const cached = getCachedProfile(username, mode)
      if (cached && !force) {
        setData(cached)
        setStatus(cached.skillProfile.isStarter ? 'empty' : 'ready')
        return cached
      }
      // Uncached load (new mode, or explicit refresh): clear the old
      // mode's data so the loading state shows instead of stale rows.
      // A quiet (background) load keeps the current data on screen
      // instead — the user never asked for it, so the page must not
      // blank to a spinner, and a failed background load must not
      // flip the screen to the error panel either.
      if (!quiet) {
        setData(null)
        setStatus('loading')
        setError(null)
      }
      loadInFlightRef.current = true
      try {
        const fresh = await fetchProfileData(username, mode, force)
        if (runRef.current !== run) return null
        setData(fresh)
        setStatus(fresh.skillProfile.isStarter ? 'empty' : 'ready')
        if (identity) void persistProfile(identity, mode, fresh, { snapshot })
        return fresh
      } catch (err) {
        if (runRef.current !== run) return null
        if (!quiet) {
          setStatus('error')
          // A rate-limited load shows the proxy's honest limit
          // message (batch AP item 2a); anything else keeps the
          // existing generic line.
          setError(
            rateLimitMessage(err) ??
              'Could not load your osu! data just now — the proxy or osu! may be unreachable.',
          )
        }
        return null
      } finally {
        loadInFlightRef.current = false
      }
    },
    // identity is derived per render; username+tier capture what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [username, tier, mode],
  )

  useEffect(() => {
    if (!isProxyConfigured || !username) {
      // Still waiting on auth/account-row resolution is not "empty".
      if (authLoading || (user && !accountRow && !pending?.osuUsername)) {
        setStatus('loading')
        return
      }
      setStatus('empty')
      setData(null)
      return
    }
    void load(false, false)
  }, [load, username, authLoading, user, accountRow, pending?.osuUsername])

  const refresh = useCallback(() => {
    void load(true, true)
  }, [load])

  // Auto-refresh on new plays (§AK). The watcher is a stable,
  // framework-free instance per hook mount; user id / mode / refresh
  // are read through refs so it never needs recreating, and the
  // owner guard above keeps exactly one instance polling.
  const autoRefresh = useCallback(() => {
    // LOAD-BEARING: snapshot=false. Auto-refresh must NEVER write a
    // stat_snapshots row — snapshots stay explicit ("Sync now" /
    // generation) so the Dashboard recent-plays total keeps its
    // baseline. Pinned by src/lib/__tests__/profileService.test.ts
    // (persistProfile with snapshot:false inserts no row).
    if (loadInFlightRef.current) return
    void load(true, false, true)
  }, [load])

  const userIdRef = useRef<number | null>(null)
  const modeRef = useRef(mode)
  const autoRefreshRef = useRef(autoRefresh)
  const ownsWatcherRef = useRef(false)
  const watcherRef = useRef<ProfileWatcher | null>(null)
  if (watcherRef.current === null) {
    watcherRef.current = createProfileWatcher({
      getUserId: () => userIdRef.current,
      getMode: () => modeRef.current,
      probeRecentPlays: (uid, m) =>
        proxyCall<OsuScore[]>('getRecentPlays', { userId: uid, mode: m }),
      onNewPlay: () => autoRefreshRef.current(),
    })
  }
  useEffect(() => {
    userIdRef.current = data?.user.id ?? identity?.osuUserId ?? null
    modeRef.current = mode
    autoRefreshRef.current = autoRefresh
  })

  useEffect(() => {
    const watcher = watcherRef.current
    if (!watcher || !isProxyConfigured || !username || !data || !requestKey) return
    if (profileWatcherOwner !== null && profileWatcherOwner !== requestKey) return
    profileWatcherOwner = requestKey
    ownsWatcherRef.current = true
    watcher.setKnownPlays(data.recentPlays, requestKey)
    watcher.start()
    return () => {
      if (ownsWatcherRef.current && profileWatcherOwner === requestKey) {
        watcher.stop()
        profileWatcherOwner = null
        ownsWatcherRef.current = false
      }
    }
    // Re-running on data change restarts the watcher (and its 5-minute
    // cadence) from the fresh data — a refetch just happened, so the
    // next probe is a full interval away.
  }, [username, mode, data, requestKey])

  // Focus / visibility return: check once when the user comes back to
  // the tab (covers "played maps, came back"). The watcher's own
  // cooldown + in-flight guards keep this from spamming the proxy.
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) watcherRef.current?.checkNow()
    }
    const onFocus = () => {
      watcherRef.current?.checkNow()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

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
