// RecOsuk osu-proxy — Supabase Edge Function (Deno).
//
// The ONLY place the osu! client secret exists. The browser (account and
// guest tiers alike) calls this function; it holds the client-credentials
// token, throttles upstream calls, caches responses, and returns public
// osu! API v2 data.
//
// Phase A (batch 15) adds the osu! USER-OAuth flow on top: sign-in,
// encrypted per-user token storage, and a header-only download probe.
// Those actions verify the caller's Supabase JWT first (the function
// runs --no-verify-jwt for the guest tier) and read/write the
// osu_user_tokens table through the SERVICE-ROLE client only. Token
// values are NEVER returned to the browser.
//
// Deploy:  supabase functions deploy osu-proxy --no-verify-jwt
// Secrets: supabase secrets set OSU_CLIENT_ID=... OSU_CLIENT_SECRET=...
//          (Phase A also needs OSU_TOKEN_ENCRYPTION_KEY — see
//          docs/OSU-SIGNIN.md; missing it 500s only the auth actions.)
// (--no-verify-jwt because the guest tier has no Supabase user JWT; the
// function only ever returns public data, and the anon key is still sent.)
//
// Request:  POST JSON { action, mode, ...params }  (GET with query params
//           works too: ?action=getUser&mode=osu&username=...)
// Response: 200 { data } on success, or { error, status } with a matching
//           HTTP status on failure. Auth actions add a stable `code`
//           (e.g. osu_auth_expired) the client keys its UI off.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0'
import {
  DEFAULT_PROBE_BEATMAPSET_ID,
  OsuAuthError,
  buildOsuAuthorizeUrl,
  encryptToken,
  exchangeAuthorizationCode,
  fetchOsuMe,
  getValidAccessToken,
  isTokenExpired,
  isValidOsuRedirectUri,
  officialDownloadUrl,
  probeDownloadVariant,
  type TokenRow,
  type TokenStore,
  type UserTokenEnv,
} from './authHelpers.ts'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const OSU_API = 'https://osu.ppy.sh/api/v2'
const OSU_TOKEN_URL = 'https://osu.ppy.sh/oauth/token'
const VALID_MODES = ['osu', 'taiko', 'fruits', 'mania'] as const
type GameMode = (typeof VALID_MODES)[number]

const MIN_UPSTREAM_GAP_MS = 350 // politeness throttle between osu! calls
const CACHE_TTL_USER_MS = 5 * 60 * 1000 // user / plays: 5 minutes
const CACHE_TTL_BEATMAP_MS = 60 * 60 * 1000 // beatmap lookups: 1 hour
const CACHE_TTL_TAGS_MS = 24 * 60 * 60 * 1000 // user-tag vocabulary: 24 hours (barely changes)

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

// ---------------------------------------------------------------------------
// Token cache (client-credentials grant; secret never leaves this function)
// ---------------------------------------------------------------------------

let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now) return cachedToken.value

  const clientId = Deno.env.get('OSU_CLIENT_ID')
  const clientSecret = Deno.env.get('OSU_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new ProxyError('osu-proxy is not configured (missing OSU_CLIENT_ID / OSU_CLIENT_SECRET)', 500)
  }

  const res = await fetch(OSU_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: Number(clientId),
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope: 'public',
    }),
  })
  if (!res.ok) {
    throw new ProxyError('osu! token request failed', 502)
  }
  const body = (await res.json()) as { access_token: string; expires_in: number }
  // Refresh ~60s before the token actually expires.
  cachedToken = {
    value: body.access_token,
    expiresAt: now + (body.expires_in - 60) * 1000,
  }
  return cachedToken.value
}

// ---------------------------------------------------------------------------
// Throttle + response cache
// ---------------------------------------------------------------------------

let lastUpstreamAt = 0
let throttleChain: Promise<void> = Promise.resolve()

/** Serialise upstream calls so at most one is in flight, ≥350ms apart. */
function throttle(): Promise<void> {
  const run = throttleChain.then(async () => {
    const wait = lastUpstreamAt + MIN_UPSTREAM_GAP_MS - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastUpstreamAt = Date.now()
  })
  // Keep the chain alive even if one waiter fails.
  throttleChain = run.catch(() => undefined)
  return run
}

const cache = new Map<string, { body: unknown; expiresAt: number }>()

function cacheGet(key: string): unknown | undefined {
  const hit = cache.get(key)
  if (!hit) return undefined
  if (hit.expiresAt < Date.now()) {
    cache.delete(key)
    return undefined
  }
  return hit.body
}

function cacheSet(key: string, body: unknown, ttlMs: number) {
  cache.set(key, { body, expiresAt: Date.now() + ttlMs })
}

// ---------------------------------------------------------------------------
// Errors / responses
// ---------------------------------------------------------------------------

class ProxyError extends Error {
  status: number
  /** Stable machine-readable code, returned alongside `error` when set (auth actions). */
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function errorJson(error: string, status: number, code?: string): Response {
  return json(code ? { error, status, code } : { error, status }, status)
}

// ---------------------------------------------------------------------------
// Upstream osu! calls
// ---------------------------------------------------------------------------

async function osuFetch(path: string, init?: RequestInit): Promise<unknown> {
  const cacheKey = `${init?.method ?? 'GET'} ${path} ${init?.body ?? ''}`
  const ttl =
    path === '/tags'
      ? CACHE_TTL_TAGS_MS
      : path.includes('/beatmaps/')
        ? CACHE_TTL_BEATMAP_MS
        : CACHE_TTL_USER_MS
  const hit = cacheGet(cacheKey)
  if (hit !== undefined) return hit

  await throttle()
  const token = await getAccessToken()
  const res = await fetch(`${OSU_API}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  })

  if (res.status === 404) throw new ProxyError('Not found on osu!', 404)
  if (res.status === 429) throw new ProxyError('osu! rate limit reached — try again in a moment', 429)
  if (!res.ok) throw new ProxyError(`osu! API error (${res.status})`, 502)

  const body = await res.json()
  cacheSet(cacheKey, body, ttl)
  return body
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type Params = Record<string, unknown>

function requireMode(params: Params): GameMode {
  const mode = params.mode
  if (typeof mode !== 'string' || !(VALID_MODES as readonly string[]).includes(mode)) {
    throw new ProxyError(`mode is required and must be one of: ${VALID_MODES.join(', ')}`, 400)
  }
  return mode as GameMode
}

function requireString(params: Params, key: string): string {
  const value = params[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ProxyError(`${key} is required`, 400)
  }
  return value
}

function requireId(params: Params, key: string): string {
  const value = params[key]
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new ProxyError(`${key} is required`, 400)
  }
  return encodeURIComponent(String(value))
}

async function runAction(params: Params, req: Request): Promise<unknown> {
  const action = requireString(params, 'action')
  // Auth actions (Phase A) are handled before the mode logic: they are
  // mode-free, JWT-verified, and never touch the public osu! API path.
  const AUTH_ACTIONS = new Set([
    'getOsuAuthorizeUrl',
    'exchangeOsuCode',
    'osuAuthStatus',
    'disconnectOsu',
    'probeOsuDownload',
  ])
  if (AUTH_ACTIONS.has(action)) {
    return runAuthAction(action, params, req)
  }
  // Mode is required ONLY by the actions whose upstream endpoint is
  // mode-scoped. `getMostPlayed` takes no mode upstream (the osu!
  // most_played endpoint has no mode parameter), the beatmap-pack
  // endpoints are mode-agnostic, and `getBeatmap`/`getBeatmapset`
  // are single-map/set lookups — requiring mode for them 400'd
  // every client call that (correctly) omitted it, which is how
  // most-played silently stayed empty in every profile generation.
  // The client still sends mode for getMostPlayed; the function
  // simply stops demanding it.
  const MODE_FREE_ACTIONS = new Set([
    'getMostPlayed',
    'getBeatmap',
    'getBeatmapset',
    'getBeatmapPacks',
    'getBeatmapPack',
    // The user-tag vocabulary is global (no mode scope).
    'getBeatmapUserTags',
  ])
  const mode = MODE_FREE_ACTIONS.has(action) ? undefined : requireMode(params)

  switch (action) {
    case 'getUser': {
      const username = encodeURIComponent(requireString(params, 'username'))
      return osuFetch(`/users/${username}/${mode}`)
    }
    case 'getTopPlays': {
      const userId = requireId(params, 'userId')
      const limit = typeof params.limit === 'number' ? Math.min(Math.max(params.limit, 1), 100) : 50
      return osuFetch(`/users/${userId}/scores/best?mode=${mode}&limit=${limit}`)
    }
    case 'getRecentPlays': {
      const userId = requireId(params, 'userId')
      const limit = typeof params.limit === 'number' ? Math.min(Math.max(params.limit, 1), 100) : 24
      return osuFetch(`/users/${userId}/scores/recent?mode=${mode}&limit=${limit}&include_fails=0`)
    }
    case 'getMostPlayed': {
      const userId = requireId(params, 'userId')
      const limit = typeof params.limit === 'number' ? Math.min(Math.max(params.limit, 1), 100) : 20
      return osuFetch(`/users/${userId}/beatmapsets/most_played?limit=${limit}`)
    }
    case 'searchBeatmapsets': {
      const search = new URLSearchParams()
      // `mode` is guaranteed present here: this action is not mode-free.
      search.set('mode', mode as GameMode)
      if (typeof params.query === 'string' && params.query.trim() !== '') {
        search.set('q', params.query)
      }
      if (typeof params.cursor_string === 'string' && params.cursor_string !== '') {
        search.set('cursor_string', params.cursor_string)
      }
      const filters = (params.filters ?? {}) as Record<string, unknown>
      // Pass through the documented beatmapsets/search filters only.
      if (typeof filters.status === 'string') search.set('s', filters.status)
      if (typeof filters.genre === 'number') search.set('g', String(filters.genre))
      if (typeof filters.language === 'number') search.set('l', String(filters.language))
      if (typeof filters.sort === 'string') search.set('sort', filters.sort)
      if (filters.nsfw === true) search.set('nsfw', 'true')
      return osuFetch(`/beatmapsets/search?${search.toString()}`)
    }
    case 'getBeatmap': {
      const beatmapId = requireId(params, 'beatmapId')
      return osuFetch(`/beatmaps/${beatmapId}`)
    }
    // Single beatmapset lookup (M5): list detail, Tried & Rated
    // rows, and rating enrichment need titles/covers/tags/SR
    // ranges the list/feedback tables do not store. Mode-free: a
    // set spans modes; the client filters difficulties itself.
    case 'getBeatmapset': {
      const beatmapsetId = requireId(params, 'beatmapsetId')
      return osuFetch(`/beatmapsets/${beatmapsetId}`)
    }
    case 'getDifficultyAttributes': {
      const beatmapId = requireId(params, 'beatmapId')
      const body: Record<string, unknown> = { ruleset: mode }
      if (Array.isArray(params.mods)) body.mods = params.mods
      return osuFetch(`/beatmaps/${beatmapId}/attributes`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
    }
    // Beatmap packs (Collections page): osu!'s public pack listing.
    // BeatConnect's own pack API needs a supporter key, so RecOsuk
    // lists the public osu! packs instead and never fabricates pack
    // metadata. Mode-free: packs span all modes.
    case 'getBeatmapPacks': {
      return osuFetch('/beatmaps/packs')
    }
    case 'getBeatmapPack': {
      const pack = encodeURIComponent(requireString(params, 'pack'))
      return osuFetch(`/beatmaps/packs/${pack}`)
    }
    // User-tag vocabulary (batch 11, part 4): lazer's fixed,
    // player-voted tag vocabulary, `GET /tags` with the app
    // (public) token — read-only, no user OAuth needed. Mode-free:
    // the vocabulary is global; per-mode applicability (if the
    // payload carries it) is read client-side.
    //
    // The response shape is NOT documented, so the function
    // returns the upstream body verbatim (same thunk/cache
    // pattern as the other actions, 24h cache) and the client
    // normalises it defensively, falling back to the bundled
    // wiki vocabulary when the shape is unrecognised. Until this
    // source is redeployed the proxy answers 400 for this
    // action and the client uses the bundled vocabulary.
    // Deploy: supabase functions deploy osu-proxy --no-verify-jwt
    case 'getBeatmapUserTags': {
      return osuFetch('/tags')
    }
    default:
      throw new ProxyError(`Unknown action: ${action}`, 400)
  }
}

// ---------------------------------------------------------------------------
// osu! user-OAuth actions (Phase A, batch 15)
//
// These run under --no-verify-jwt (the guest tier has no Supabase JWT),
// so every action verifies the caller's JWT itself via auth.getUser()
// before doing anything. Tokens live ONLY in the osu_user_tokens table
// (encrypted, service-role client) and are NEVER returned to the
// browser — exchange/status/probe responses carry usernames, expiry,
// and probe headers only.
//
// No PKCE: the code exchange happens server-side with the client
// secret, and the browser never sees a token. `state` (checked by the
// callback page against sessionStorage) is the CSRF protection.
// ---------------------------------------------------------------------------

interface UserAuthEnv extends UserTokenEnv {
  supabaseUrl: string
  anonKey: string
  serviceRoleKey: string
}

/** Reads every secret the auth actions need; names the missing one in the 500. */
function requireUserAuthEnv(): UserAuthEnv {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const clientId = Deno.env.get('OSU_CLIENT_ID')
  const clientSecret = Deno.env.get('OSU_CLIENT_SECRET')
  const encryptionKeyB64 = Deno.env.get('OSU_TOKEN_ENCRYPTION_KEY')
  if (!supabaseUrl) throw new ProxyError('osu-proxy is not configured (missing SUPABASE_URL)', 500)
  if (!anonKey) throw new ProxyError('osu-proxy is not configured (missing SUPABASE_ANON_KEY)', 500)
  if (!serviceRoleKey) {
    throw new ProxyError(
      'osu-proxy is not configured (missing SUPABASE_SERVICE_ROLE_KEY). ' +
        'Set it with: supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... (see docs/OSU-SIGNIN.md)',
      500,
    )
  }
  if (!clientId || !clientSecret) {
    throw new ProxyError('osu-proxy is not configured (missing OSU_CLIENT_ID / OSU_CLIENT_SECRET)', 500)
  }
  if (!encryptionKeyB64) {
    throw new ProxyError(
      'osu-proxy is not configured (missing OSU_TOKEN_ENCRYPTION_KEY). ' +
        'Generate one with: openssl rand -base64 32, then set it with: supabase secrets set OSU_TOKEN_ENCRYPTION_KEY=... (see docs/OSU-SIGNIN.md)',
      500,
    )
  }
  return { supabaseUrl, anonKey, serviceRoleKey, clientId, clientSecret, encryptionKeyB64 }
}

/**
 * Verifies the caller's Supabase JWT (Bearer) and returns their user id
 * plus a service-role client for the token table. No JWT / invalid JWT
 * = 401, and the action never runs. (An anon key passed as the Bearer
 * token fails getUser — only a real user session passes.)
 */
async function requireUserId(req: Request): Promise<{ userId: string; service: SupabaseClient }> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) {
    throw new ProxyError('A RecOsuk sign-in is required for this action.', 401, 'osu_auth_required')
  }
  const env = requireUserAuthEnv()
  const authClient = createClient(env.supabaseUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data.user) {
    throw new ProxyError(
      'A RecOsuk sign-in is required for this action (session invalid or expired).',
      401,
      'osu_auth_required',
    )
  }
  const service = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return { userId: data.user.id, service }
}

/** TokenStore backed by the osu_user_tokens table via the service-role client. */
function supabaseTokenStore(service: SupabaseClient): TokenStore {
  return {
    async get(userId: string): Promise<TokenRow | null> {
      const { data, error } = await service
        .from('osu_user_tokens')
        .select('user_id, access_token_enc, refresh_token_enc, expires_at, osu_user_id, osu_username')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw new ProxyError('Could not read the osu! connection.', 500)
      return (data as TokenRow | null) ?? null
    },
    async upsert(row: TokenRow): Promise<void> {
      const { error } = await service.from('osu_user_tokens').upsert(row, { onConflict: 'user_id' })
      if (error) throw new ProxyError('Could not save the osu! connection.', 500)
    },
    async remove(userId: string): Promise<void> {
      const { error } = await service.from('osu_user_tokens').delete().eq('user_id', userId)
      if (error) throw new ProxyError('Could not remove the osu! connection.', 500)
    },
  }
}

async function runAuthAction(action: string, params: Params, req: Request): Promise<unknown> {
  switch (action) {
    // Step 1 of the sign-in: the client generated a crypto-random
    // `state` and sends the origin-derived redirect_uri; the server
    // validates both and returns the authorize URL to navigate to.
    // The client_id is public by nature — returning it here keeps the
    // secret server-side and avoids inventing a VITE_ env contract.
    case 'getOsuAuthorizeUrl': {
      await requireUserId(req)
      const redirectUri = requireString(params, 'redirectUri')
      if (!isValidOsuRedirectUri(redirectUri)) {
        throw new ProxyError(
          'The redirect URI is not a valid RecOsuk callback URL (expected <origin>/auth/osu/callback).',
          400,
          'osu_redirect_uri_mismatch',
        )
      }
      const state = requireString(params, 'state')
      if (!/^[A-Za-z0-9_-]{16,128}$/.test(state)) {
        throw new ProxyError('The sign-in state value is invalid. Try signing in with osu! again.', 400)
      }
      const env = requireUserAuthEnv()
      return {
        authorizeUrl: buildOsuAuthorizeUrl({ clientId: env.clientId, redirectUri, state }),
      }
    }
    // Step 2: exchange the authorization code for tokens (server-side,
    // with the client secret). Returns ONLY the username/id/expiry —
    // never a token value.
    case 'exchangeOsuCode': {
      const { userId, service } = await requireUserId(req)
      if (req.method !== 'POST') {
        throw new ProxyError('exchangeOsuCode requires a POST request.', 405)
      }
      const code = requireString(params, 'code')
      const redirectUri = requireString(params, 'redirectUri')
      if (!isValidOsuRedirectUri(redirectUri)) {
        throw new ProxyError(
          'The redirect URI does not match the one used to start sign-in — it must be <origin>/auth/osu/callback. ' +
            'If osu! rejected it, the redirect URI is probably not registered in the osu! OAuth app settings (see docs/OSU-SIGNIN.md).',
          400,
          'osu_redirect_uri_mismatch',
        )
      }
      const env = requireUserAuthEnv()
      const grant = await exchangeAuthorizationCode(
        { fetchFn: fetch, env },
        { code, redirectUri },
      )
      // One /me call at exchange time; status reads storage only.
      // If it fails, the connection is still stored with a null name
      // and the UI shows "connected (name unknown)".
      const me = await fetchOsuMe(fetch, grant.accessToken)
      const expiresAt = new Date(Date.now() + grant.expiresIn * 1000).toISOString()
      await supabaseTokenStore(service).upsert({
        user_id: userId,
        access_token_enc: await encryptToken(grant.accessToken, env.encryptionKeyB64),
        refresh_token_enc: await encryptToken(grant.refreshToken, env.encryptionKeyB64),
        expires_at: expiresAt,
        osu_user_id: me?.id ?? null,
        osu_username: me?.username ?? null,
      })
      return { osuUsername: me?.username ?? null, osuUserId: me?.id ?? null, expiresAt }
    }
    // Status: storage read only — no osu! call per read. `expired`
    // means the access token is past its (leeway-adjusted) expiry;
    // the stored refresh token may still renew it transparently.
    case 'osuAuthStatus': {
      const { userId, service } = await requireUserId(req)
      const row = await supabaseTokenStore(service).get(userId)
      if (!row) {
        return { connected: false, osuUsername: null, osuUserId: null, expiresAt: null, expired: false }
      }
      return {
        connected: true,
        osuUsername: row.osu_username,
        osuUserId: row.osu_user_id,
        expiresAt: row.expires_at,
        expired: isTokenExpired(Date.parse(row.expires_at), Date.now()),
      }
    }
    // Disconnect: delete the stored row. (Revoking in osu!'s own
    // settings is a separate, user-side step — see docs/OSU-SIGNIN.md.)
    case 'disconnectOsu': {
      const { userId, service } = await requireUserId(req)
      await supabaseTokenStore(service).remove(userId)
      return { ok: true }
    }
    // Header-only probe: does osu! accept this user token for the
    // official download endpoint? Reads status + headers only and
    // cancels the body — no bytes are downloaded, no bytes are
    // streamed to the browser. No retry, no mirror fallback: the
    // probe answers exactly one question, and Phase B is gated on it.
    case 'probeOsuDownload': {
      const { userId, service } = await requireUserId(req)
      const env = requireUserAuthEnv()
      const { accessToken } = await getValidAccessToken({
        store: supabaseTokenStore(service),
        fetchFn: fetch,
        env,
        userId,
      })
      const rawId = params.beatmapsetId
      const beatmapsetId =
        typeof rawId === 'number' && Number.isInteger(rawId) && rawId > 0
          ? rawId
          : DEFAULT_PROBE_BEATMAPSET_ID
      const full = await probeDownloadVariant({
        fetchFn: fetch,
        url: officialDownloadUrl(beatmapsetId, false),
        accessToken,
      })
      const noVideo = await probeDownloadVariant({
        fetchFn: fetch,
        url: officialDownloadUrl(beatmapsetId, true),
        accessToken,
      })
      return {
        ok: true,
        beatmapsetId,
        status: full.status,
        contentType: full.contentType,
        contentLength: full.contentLength,
        contentDisposition: full.contentDisposition,
        pass: full.pass,
        noVideoVariant: noVideo,
      }
    }
    default:
      throw new ProxyError(`Unknown auth action: ${action}`, 400)
  }
}

// ---------------------------------------------------------------------------
// HTTP entrypoint
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    let params: Params = {}
    if (req.method === 'POST') {
      const text = await req.text()
      if (text.trim() !== '') {
        try {
          params = JSON.parse(text) as Params
        } catch {
          return errorJson('Request body must be valid JSON', 400)
        }
      }
    }
    if (req.method === 'GET' || Object.keys(params).length === 0) {
      // GET (or empty POST) fallback: read params from the query string.
      const url = new URL(req.url)
      const fromQuery: Params = {}
      url.searchParams.forEach((value, key) => {
        fromQuery[key] = value
      })
      params = { ...fromQuery, ...params }
      // Numeric coercion for the id/limit params that arrive as strings.
      for (const key of ['userId', 'beatmapId', 'beatmapsetId', 'limit']) {
        if (typeof params[key] === 'string' && params[key] !== '') {
          const n = Number(params[key])
          if (!Number.isNaN(n)) params[key] = n
        }
      }
    }

    const data = await runAction(params, req)
    return json({ data })
  } catch (err) {
    if (err instanceof OsuAuthError) {
      return errorJson(err.message, err.status, err.code)
    }
    if (err instanceof ProxyError) {
      return errorJson(err.message, err.status, err.code)
    }
    return errorJson('osu-proxy internal error', 500)
  }
})
