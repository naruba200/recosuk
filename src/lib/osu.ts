import type { GameMode } from './mode'
import { getSupabaseConfig, supabase } from './supabase'

/**
 * osu! data service — talks to the `osu-proxy` Supabase Edge Function,
 * never to osu! directly (the client secret lives in the function).
 * Works for both tiers: signed-in users send their session token, guests
 * send the anon key (the function is deployed --no-verify-jwt and only
 * returns public data).
 */

// ---------------------------------------------------------------------------
// Minimal typed shapes (only the fields RecOsuk actually reads)
// ---------------------------------------------------------------------------

export interface OsuUserStatistics {
  pp?: number
  global_rank?: number | null
  country_rank?: number | null
  hit_accuracy?: number
  play_count?: number
  play_time?: number
  level?: { current?: number; progress?: number }
  grade_counts?: { ss?: number; s?: number; a?: number }
  maximum_combo?: number
}

export interface OsuUser {
  id: number
  username: string
  /** API mode string ('osu' | 'taiko' | 'fruits' | 'mania'). */
  playmode: string
  country_code?: string
  avatar_url?: string
  statistics?: OsuUserStatistics
}

export interface BeatmapsetSummary {
  id: number
  title: string
  artist: string
  creator: string
  status: string
  play_count?: number
  favourite_count?: number
  covers?: { card?: string; cover?: string; list?: string }
}

export interface OsuScore {
  id?: number
  accuracy: number
  pp: number | null
  max_combo: number
  mods: string[]
  passed?: boolean
  rank?: string
  created_at?: string
  beatmap?: {
    id: number
    beatmapset_id: number
    difficulty_rating: number
    version: string
    bpm?: number
    total_length?: number
    cs?: number
    ar?: number
    od?: number
  }
  beatmapset?: BeatmapsetSummary
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type OsuErrorKind = 'not-configured' | 'not-found' | 'upstream'

export class OsuServiceError extends Error {
  kind: OsuErrorKind
  status?: number
  constructor(kind: OsuErrorKind, message: string, status?: number) {
    super(message)
    this.kind = kind
    this.status = status
  }
}

export interface OsuResult<T> {
  data: T | null
  error: OsuServiceError | null
}

function ok<T>(data: T): OsuResult<T> {
  return { data, error: null }
}

function fail(error: OsuServiceError): OsuResult<never> {
  return { data: null, error }
}

// ---------------------------------------------------------------------------
// Client (factory so tests can inject base URL + fetch)
// ---------------------------------------------------------------------------

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

export interface OsuClientDeps {
  supabaseUrl: string | null
  anonKey: string | null
  fetchFn?: FetchFn
  /** Extra bearer token (the signed-in user's session token), if any. */
  getAuthToken?: () => Promise<string | null>
}

export interface OsuClient {
  isConfigured: boolean
  proxyCall: <T = unknown>(action: string, params?: Record<string, unknown>) => Promise<T>
  getOsuUser: (username: string, mode: GameMode) => Promise<OsuResult<OsuUser>>
}

export function createOsuClient(deps: OsuClientDeps): OsuClient {
  const fetchFn: FetchFn = deps.fetchFn ?? ((input, init) => fetch(input, init))
  const isConfigured = Boolean(deps.supabaseUrl && deps.anonKey)
  const functionUrl = deps.supabaseUrl
    ? `${deps.supabaseUrl.replace(/\/$/, '')}/functions/v1/osu-proxy`
    : null

  async function proxyCall<T = unknown>(
    action: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    if (!isConfigured || !functionUrl || !deps.anonKey) {
      throw new OsuServiceError(
        'not-configured',
        'osu-proxy is not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see docs/M1-SETUP.md).',
      )
    }

    const sessionToken = deps.getAuthToken ? await deps.getAuthToken() : null
    let res: Response
    try {
      res = await fetchFn(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: deps.anonKey,
          Authorization: `Bearer ${sessionToken ?? deps.anonKey}`,
        },
        body: JSON.stringify({ action, ...params }),
      })
    } catch {
      throw new OsuServiceError('upstream', 'Could not reach the osu-proxy function.')
    }

    let payload: { data?: T; error?: string; status?: number } | null = null
    try {
      payload = (await res.json()) as { data?: T; error?: string; status?: number }
    } catch {
      payload = null
    }

    if (!res.ok) {
      const status = payload?.status ?? res.status
      if (status === 404 || res.status === 404) {
        throw new OsuServiceError('not-found', payload?.error ?? 'Not found on osu!', status)
      }
      throw new OsuServiceError(
        'upstream',
        payload?.error ?? `osu-proxy request failed (${res.status})`,
        status,
      )
    }
    return payload?.data as T
  }

  async function getOsuUser(
    username: string,
    mode: GameMode,
  ): Promise<OsuResult<OsuUser>> {
    try {
      const user = await proxyCall<OsuUser>('getUser', { username, mode })
      return ok(user)
    } catch (err) {
      if (err instanceof OsuServiceError) return fail(err)
      return fail(new OsuServiceError('upstream', 'Unexpected error while contacting osu!'))
    }
  }

  return { isConfigured, proxyCall, getOsuUser }
}

// ---------------------------------------------------------------------------
// Default client (env-based) + module-level service used by the app
// ---------------------------------------------------------------------------

const { url, anonKey } = getSupabaseConfig()

export const osuClient: OsuClient = createOsuClient({
  supabaseUrl: url,
  anonKey,
  getAuthToken: async () => {
    if (!supabase) return null
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  },
})

export const isProxyConfigured: boolean = osuClient.isConfigured

export function proxyCall<T = unknown>(
  action: string,
  params?: Record<string, unknown>,
): Promise<T> {
  return osuClient.proxyCall<T>(action, params)
}

export function getOsuUser(
  username: string,
  mode: GameMode,
): Promise<OsuResult<OsuUser>> {
  return osuClient.getOsuUser(username, mode)
}

export interface ValidatedOsuUser {
  user: OsuUser
  /** The user's real osu user id. */
  osuUserId: number
  /** The user's actual main mode, mapped through the mode guard. */
  playmode: GameMode
}

/**
 * Validate an osu! username for the link flow (both tiers use this).
 * Returns the user id + playmode on success, or a typed error:
 * 'not-configured' (demo mode), 'not-found' (no such osu! user), or
 * 'upstream' (proxy/osu! failure).
 */
export async function validateOsuUsername(
  username: string,
  mode: GameMode = 'osu',
): Promise<OsuResult<ValidatedOsuUser>> {
  const trimmed = username.trim()
  if (trimmed === '') {
    return fail(new OsuServiceError('not-found', 'Enter an osu! username.'))
  }
  const result = await getOsuUser(trimmed, mode)
  if (result.error || !result.data) {
    return fail(result.error ?? new OsuServiceError('upstream', 'Unknown error.'))
  }
  const user = result.data
  const playmode = (['osu', 'taiko', 'fruits', 'mania'] as const).includes(
    user.playmode as GameMode,
  )
    ? (user.playmode as GameMode)
    : mode
  return ok({ user, osuUserId: user.id, playmode })
}
