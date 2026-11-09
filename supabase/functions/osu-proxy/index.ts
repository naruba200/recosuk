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
  getUserAccessTokenBestEffort,
  getValidAccessToken,
  isTokenExpired,
  isValidOsuRedirectUri,
  officialDownloadUrl,
  probeDownloadVariant,
  type TokenRow,
  type TokenStore,
  type UserTokenEnv,
} from './authHelpers.ts'
import {
  CACHE_TTL_BEATMAP_MS,
  MAX_DB_CACHE_BODY_BYTES,
  RATE_LIMIT_USER_PER_MIN,
  cacheTtlMsForPath,
  clientIpFromHeaders,
  formatRateLimitMessage,
  isAllowedOrigin,
  parseAllowedOrigins,
  rateLimitForCaller,
  rateLimitKeyForGuest,
  rateLimitKeyForUser,
  sha256Hex,
} from './proxyHelpers.ts'
import {
  PackListError,
  buildBeatmapPackDetailPath,
  buildBeatmapPacksPath,
  resolvePackListType,
} from './packHelpers.ts'
import {
  checkRefreshToken,
  compileRefreshCompilation,
  resolveRefreshInterval,
  type RefreshScanPage,
  type RefreshSet,
} from './rankedRefresh.ts'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const OSU_API = 'https://osu.ppy.sh/api/v2'
const OSU_TOKEN_URL = 'https://osu.ppy.sh/oauth/token'
const VALID_MODES = ['osu', 'taiko', 'fruits', 'mania'] as const
type GameMode = (typeof VALID_MODES)[number]

const MIN_UPSTREAM_GAP_MS = 350 // politeness throttle between osu! calls

// CORS (batch AP item 2b): the proxy answers the app's own domain
// plus localhost for dev — see proxyHelpers.isAllowedOrigin.
// Requests with NO Origin header are server-to-server (the nightly
// job, curl, tests) and are always allowed; the browser is the
// enforcement point, so a disallowed Origin simply gets no
// Access-Control-Allow-Origin back and the browser blocks the read.
// ALLOWED_ORIGINS (comma-separated) overrides the default when the
// deployment domain changes. `x-refresh-token` stays allowed —
// the nightly job authenticates with it.
const ALLOWED_ORIGINS = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS'))

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-refresh-token',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  }
  if (origin && isAllowedOrigin(origin, ALLOWED_ORIGINS)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Vary'] = 'Origin'
  }
  return headers
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
// Shared DB cache (batch AP item 1b): the in-memory Map above is L1
// (per-instance); proxy_cache (migration 004) is L2, shared across
// instances, read/written with the service-role client. Same keys
// as L1, TTLs from proxyHelpers.cacheTtlMsForPath. Everything here
// is best-effort: a missing table (migration not run yet) or a DB
// error just means "cache miss" — the request still goes upstream.
// Bodies over 1 MB are never stored (the 500 MB free-tier DB must
// never fill with single files).
// ---------------------------------------------------------------------------

type DbCacheDeps = { service: SupabaseClient | null }

async function dbCacheGet(
  deps: DbCacheDeps,
  key: string,
): Promise<{ body: unknown; expiresAt: number } | undefined> {
  if (!deps.service) return undefined
  try {
    const { data, error } = await deps.service
      .from('proxy_cache')
      .select('body, expires_at')
      .eq('key', key)
      .maybeSingle()
    if (error || !data) return undefined
    const expiresAt = Date.parse((data as { expires_at: string }).expires_at)
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return undefined
    return { body: (data as { body: unknown }).body, expiresAt }
  } catch {
    return undefined
  }
}

async function dbCacheSet(
  deps: DbCacheDeps,
  key: string,
  body: unknown,
  ttlMs: number,
): Promise<void> {
  if (!deps.service) return
  let encoded: string
  try {
    encoded = JSON.stringify(body)
  } catch {
    return
  }
  if (encoded.length > MAX_DB_CACHE_BODY_BYTES) return
  try {
    await deps.service.from('proxy_cache').upsert(
      {
        key,
        body,
        expires_at: new Date(Date.now() + ttlMs).toISOString(),
      },
      { onConflict: 'key' },
    )
  } catch {
    // Best-effort: a failed write is a lost cache entry, never a
    // failed request.
  }
  void cleanupDbCache(deps.service)
}

// Expired-row cleanup, throttled to once a minute per instance so
// it never becomes per-request overhead. Logs the approximate
// table size when it runs (§AP item 3b).
let lastDbCacheCleanupAt = 0

async function cleanupDbCache(service: SupabaseClient): Promise<void> {
  const now = Date.now()
  if (now - lastDbCacheCleanupAt < 60_000) return
  lastDbCacheCleanupAt = now
  try {
    const { error } = await service
      .from('proxy_cache')
      .delete()
      .lt('expires_at', new Date(now).toISOString())
    if (error) return
    const { count } = await service
      .from('proxy_cache')
      .select('key', { count: 'exact', head: true })
    console.info('[RecOsuk proxy] cache size', {
      rows: typeof count === 'number' ? count : null,
    })
  } catch {
    // Best-effort housekeeping only.
  }
}

// In-flight coalescing (batch AP item 1c): identical upstream calls
// already in flight share one answer instead of hitting osu! twice.
// Per-instance only — Edge Functions are stateless across
// instances, so the DB cache is the cross-instance dedupe.
const inflight = new Map<string, Promise<unknown>>()

function coalesced<T>(key: string, run: () => Promise<T>): Promise<T> {
  const pending = inflight.get(key)
  if (pending) return pending as Promise<T>
  const promise = run()
  inflight.set(key, promise)
  return promise.finally(() => {
    if (inflight.get(key) === promise) inflight.delete(key)
  })
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

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, ...extraHeaders, 'Content-Type': 'application/json' },
  })
}

function errorJson(
  error: string,
  status: number,
  code?: string,
  headers: Record<string, string> = {},
  extraHeaders: Record<string, string> = {},
): Response {
  return json(code ? { error, status, code } : { error, status }, status, headers, extraHeaders)
}

// ---------------------------------------------------------------------------
// Upstream osu! calls
// ---------------------------------------------------------------------------

// Beatmap `.osu` files (PP feature): the website file endpoint, NOT
// the API — no client-credentials token is sent (it is a public
// website URL, not an API route, and the token buys nothing here).
// Throttled like every upstream call and cached 1h in-memory; the
// client caches per (beatmap, checksum, calculator version) itself,
// so a stale hour here only delays a freshly-updated map, never a
// wrong PP (the checksum key misses and the file is re-fetched).
// The first-line check is the real guard: a missing/redirected map
// lands on an HTML page, which must never be passed off as a .osu
// file. Deploy: supabase functions deploy osu-proxy --no-verify-jwt
const OSU_FILE_URL = 'https://osu.ppy.sh/osu'
const MAX_OSU_FILE_BYTES = 5 * 1024 * 1024

// ---------------------------------------------------------------------------
// Per-request proxy context (batch AP item 1a): who is calling, which
// osu! token their calls ride, and the cache counters the structured
// log line reports. Resolved once per request in Deno.serve — never
// per upstream call.
// ---------------------------------------------------------------------------

interface ProxyCtx {
  /** Service-role client for the DB cache + rate limiter; null when
   *  the service-role secret is missing (DB features degrade to
   *  in-memory only, the request still succeeds). */
  service: SupabaseClient | null
  /** The caller's own osu! token when signed in + linked; null means
   *  the shared client token (guests, or signed-in users with no
   *  osu! link). Never logged, never returned to the browser. */
  userToken: string | null
  callerKind: 'user' | 'guest' | 'service'
  /** Supabase user id for signed-in callers; null for guests. */
  userId: string | null
  cache: { mem: number; db: number; miss: number }
}

async function fetchBeatmapFile(
  beatmapId: number,
  ctx?: ProxyCtx,
): Promise<{ beatmapId: number; osuFile: string }> {
  const cacheKey = `GET osu-file ${beatmapId}`
  const hit = cacheGet(cacheKey)
  if (hit && typeof hit === 'object' && typeof (hit as { osuFile?: unknown }).osuFile === 'string') {
    if (ctx) ctx.cache.mem++
    return hit as { beatmapId: number; osuFile: string }
  }
  if (ctx?.service) {
    const dbHit = await dbCacheGet(ctx, cacheKey)
    if (
      dbHit &&
      typeof dbHit.body === 'object' &&
      typeof (dbHit.body as { osuFile?: unknown }).osuFile === 'string'
    ) {
      cacheSet(cacheKey, dbHit.body, Math.max(0, dbHit.expiresAt - Date.now()))
      ctx.cache.db++
      return dbHit.body as { beatmapId: number; osuFile: string }
    }
  }

  return coalesced(cacheKey, async () => {
    await throttle()
    const res = await fetch(`${OSU_FILE_URL}/${beatmapId}`, {
      headers: { Accept: 'text/plain, */*' },
    })
    if (res.status === 404) throw new ProxyError('Beatmap file not found on osu!', 404)
    if (!res.ok) throw new ProxyError(`osu! beatmap file request failed (${res.status})`, 502)
    const text = await res.text()
    if (text.length > MAX_OSU_FILE_BYTES) {
      throw new ProxyError('Beatmap file is too large', 502)
    }
    if (!text.startsWith('osu file format v')) {
      throw new ProxyError('osu! did not return a beatmap file', 502)
    }
    const body = { beatmapId, osuFile: text }
    cacheSet(cacheKey, body, CACHE_TTL_BEATMAP_MS)
    if (ctx) {
      ctx.cache.miss++
      await dbCacheSet(ctx, cacheKey, body, CACHE_TTL_BEATMAP_MS)
    }
    return body
  })
}

async function osuFetch(path: string, init?: RequestInit, ctx?: ProxyCtx): Promise<unknown> {
  const cacheKey = `${init?.method ?? 'GET'} ${path} ${init?.body ?? ''}`
  const ttl = cacheTtlMsForPath(path)
  const hit = cacheGet(cacheKey)
  if (hit !== undefined) {
    if (ctx) ctx.cache.mem++
    return hit
  }
  if (ctx?.service) {
    const dbHit = await dbCacheGet(ctx, cacheKey)
    if (dbHit !== undefined) {
      cacheSet(cacheKey, dbHit.body, Math.max(0, dbHit.expiresAt - Date.now()))
      ctx.cache.db++
      return dbHit.body
    }
  }

  return coalesced(cacheKey, async () => {
    await throttle()
    // Per-user token when the caller is signed in + linked (batch AP
    // item 1a); the shared client token is the guest fallback — and
    // the fallback for signed-in users with no osu! link.
    const token = ctx?.userToken ?? (await getAccessToken())
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
    if (ctx) {
      ctx.cache.miss++
      await dbCacheSet(ctx, cacheKey, body, ttl)
    }
    return body
  })
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

// ---------------------------------------------------------------------------
// Nightly ranked refresh (§AO, refreshRanked action)
// ---------------------------------------------------------------------------

/** Only the env the refresh action needs: the service-role client
 *  for storing compilations. The osu! token-encryption key is
 *  NOT needed here (no user tokens are involved). */
function requireRefreshEnv(): { supabaseUrl: string; serviceRoleKey: string } {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl) throw new ProxyError('osu-proxy is not configured (missing SUPABASE_URL)', 500)
  if (!serviceRoleKey) {
    throw new ProxyError(
      'osu-proxy is not configured (missing SUPABASE_SERVICE_ROLE_KEY). ' +
        'Set it with: supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...',
      500,
    )
  }
  return { supabaseUrl, serviceRoleKey }
}

/** One ranked-search page, newest-ranked-first — the same paging
 *  the client's fetchRankedPage does (status=ranked,
 *  sort=ranked_desc, cursor passthrough). */
async function fetchRankedSearchPage(
  mode: GameMode,
  cursor: string | null | undefined,
  ctx?: ProxyCtx,
): Promise<RefreshScanPage<RefreshSet>> {
  const search = new URLSearchParams()
  search.set('mode', mode)
  search.set('s', 'ranked')
  search.set('sort', 'ranked_desc')
  if (cursor) search.set('cursor_string', cursor)
  const body = (await osuFetch(`/beatmapsets/search?${search.toString()}`, undefined, ctx)) as {
    beatmapsets?: unknown
    cursor_string?: unknown
  }
  return {
    beatmapsets: Array.isArray(body.beatmapsets) ? (body.beatmapsets as RefreshSet[]) : [],
    cursor_string: typeof body.cursor_string === 'string' ? body.cursor_string : null,
  }
}

async function runAction(params: Params, req: Request, ctx: ProxyCtx): Promise<unknown> {
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
    // Beatmap .osu file fetch (PP feature): website endpoint, mode-free.
    'getBeatmapFile',
  ])
  const mode = MODE_FREE_ACTIONS.has(action) ? undefined : requireMode(params)

  switch (action) {
    case 'getUser': {
      const username = encodeURIComponent(requireString(params, 'username'))
      return osuFetch(`/users/${username}/${mode}`, undefined, ctx)
    }
    case 'getTopPlays': {
      const userId = requireId(params, 'userId')
      const limit = typeof params.limit === 'number' ? Math.min(Math.max(params.limit, 1), 100) : 50
      return osuFetch(`/users/${userId}/scores/best?mode=${mode}&limit=${limit}`, undefined, ctx)
    }
    case 'getRecentPlays': {
      const userId = requireId(params, 'userId')
      const limit = typeof params.limit === 'number' ? Math.min(Math.max(params.limit, 1), 100) : 24
      return osuFetch(`/users/${userId}/scores/recent?mode=${mode}&limit=${limit}&include_fails=0`, undefined, ctx)
    }
    case 'getMostPlayed': {
      const userId = requireId(params, 'userId')
      const limit = typeof params.limit === 'number' ? Math.min(Math.max(params.limit, 1), 100) : 20
      return osuFetch(`/users/${userId}/beatmapsets/most_played?limit=${limit}`, undefined, ctx)
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
      return osuFetch(`/beatmapsets/search?${search.toString()}`, undefined, ctx)
    }
    case 'getBeatmap': {
      const beatmapId = requireId(params, 'beatmapId')
      return osuFetch(`/beatmaps/${beatmapId}`, undefined, ctx)
    }
    // Beatmap .osu file (PP feature): raw file text for one
    // difficulty, fetched server-side from the public website
    // endpoint so the browser never touches osu! directly. The
    // client computes max PP from this with rosu-pp-js and
    // caches per (beatmap, checksum, calculator version).
    // Mode-free; needs the same redeploy as any function change:
    // supabase functions deploy osu-proxy --no-verify-jwt
    case 'getBeatmapFile': {
      const raw = params.beatmapId
      if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0) {
        throw new ProxyError('beatmapId is required and must be a positive integer', 400)
      }
      return fetchBeatmapFile(raw, ctx)
    }
    // Single beatmapset lookup (M5): list detail, Tried & Rated
    // rows, and rating enrichment need titles/covers/tags/SR
    // ranges the list/feedback tables do not store. Mode-free: a
    // set spans modes; the client filters difficulties itself.
    case 'getBeatmapset': {
      const beatmapsetId = requireId(params, 'beatmapsetId')
      return osuFetch(`/beatmapsets/${beatmapsetId}`, undefined, ctx)
    }
    case 'getDifficultyAttributes': {
      const beatmapId = requireId(params, 'beatmapId')
      const body: Record<string, unknown> = { ruleset: mode }
      if (Array.isArray(params.mods)) body.mods = params.mods
      return osuFetch(
        `/beatmaps/${beatmapId}/attributes`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
        ctx,
      )
    }
    // Beatmap packs (Collections page): osu!'s public pack listing.
    // BeatConnect's own pack API needs a supporter key, so RecOsuk
    // lists the public osu! packs instead and never fabricates pack
    // metadata. Mode-free: packs span all modes (mode comes from
    // each pack's `ruleset_id`, read client-side).
    //
    // `type` is a BeatmapPackType NAME (standard, featured,
    // tournament, loved, chart, theme, artist) and defaults to
    // `standard` upstream when omitted — the client always sends it.
    // `cursor_string` passes through for pagination; the upstream
    // body is returned verbatim, so a response cursor reaches the
    // client untouched.
    case 'getBeatmapPacks': {
      let path: string
      try {
        path = buildBeatmapPacksPath(
          resolvePackListType(params.type),
          params.cursor_string,
        )
      } catch (err) {
        if (err instanceof PackListError) throw new ProxyError(err.message, 400)
        throw err
      }
      return osuFetch(path, undefined, ctx)
    }
    case 'getBeatmapPack': {
      // The tag reaches osu! VERBATIM: encodeURIComponent only
      // escapes reserved characters, so `ST445` stays `ST445`.
      // Never normalize, lowercase, or split the tag here.
      const pack = requireString(params, 'pack')
      return osuFetch(buildBeatmapPackDetailPath(pack), undefined, ctx)
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
      return osuFetch('/tags', undefined, ctx)
    }
    // Nightly ranked refresh (§AO): compile ONE ranked card and
    // store it in ranked_compilations with the SERVICE-ROLE
    // client. Authenticated ONLY by the shared RANKED_REFRESH_TOKEN
    // (header `x-refresh-token`) — never by a caller-supplied
    // service-role key, and no user JWT is involved (the job runs
    // while nobody is signed in). Wrong or missing token = 401.
    // The scan uses the same rules as the client compile (20-page
    // cap, partial flag, reached-start logic — see rankedRefresh.ts
    // and the cross-check tests in rankedRefresh.test.ts).
    // Deploy: supabase functions deploy osu-proxy --no-verify-jwt
    // Secret:  supabase secrets set RANKED_REFRESH_TOKEN=<token>
    case 'refreshRanked': {
      const expected = Deno.env.get('RANKED_REFRESH_TOKEN')
      const provided = req.headers.get('x-refresh-token')
      if (!checkRefreshToken(provided, expected)) {
        throw new ProxyError('refreshRanked requires a valid refresh token.', 401, 'refresh_token_invalid')
      }
      const granularity = params.granularity
      if (
        typeof granularity !== 'string' ||
        !['week', 'month', 'year'].includes(granularity)
      ) {
        throw new ProxyError('granularity is required and must be one of: week, month, year', 400)
      }
      const period = requireString(params, 'period')
      const interval = resolveRefreshInterval(granularity, period, Date.now())
      if (!interval) {
        throw new ProxyError(`Unknown period for granularity ${granularity}: ${period}`, 400)
      }
      const compiled = await compileRefreshCompilation({
        mode: mode as GameMode,
        startMs: interval.startMs,
        endMs: interval.endMs,
        fetchPage: (cursor) => fetchRankedSearchPage(mode as GameMode, cursor, ctx),
      })
      // Same diagnostic line as the client scan (function logs in
      // the Supabase dashboard, not the browser console).
      console.info('[RecOsuk ranked scan]', {
        mode,
        granularity,
        period,
        windowStart: new Date(interval.startMs).toISOString(),
        windowEnd: new Date(interval.endMs).toISOString(),
        seeded: compiled.seeded,
        seedIgnored: compiled.seedIgnored,
        scanned: compiled.scanned,
        collected: compiled.entries.length,
        partial: compiled.partial,
      })
      if (compiled.seedIgnored) {
        console.warn(
          '[RecOsuk ranked scan] the seeded cursor was ignored — the scan fell back to paging from the newest set. ' +
            'Check whether the search API still accepts a fabricated cursor.',
        )
      }
      const env = requireRefreshEnv()
      const service = createClient(env.supabaseUrl, env.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const { error } = await service.from('ranked_compilations').upsert(
        {
          mode,
          granularity,
          period,
          entries: compiled.entries,
          partial: compiled.partial,
          scanned: compiled.scanned,
          window_start: compiled.windowStart,
          compiled_at: new Date().toISOString(),
        },
        { onConflict: 'mode,granularity,period' },
      )
      if (error) {
        throw new ProxyError(`Could not store the ranked compilation: ${error.message}`, 500)
      }
      return {
        mode,
        granularity,
        period,
        entries: compiled.entries,
        partial: compiled.partial,
        scanned: compiled.scanned,
        stored: true,
        compiledAt: new Date().toISOString(),
      }
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

// ---------------------------------------------------------------------------
// Per-request caller + rate limit (batch AP items 1a + 2a)
//
// The browser already sends the signed-in user's Supabase session
// token as the Bearer (osu.ts proxyCall); guests send the anon key.
// A Bearer that verifies via auth.getUser is a signed-in user —
// their calls ride their own osu! token (best-effort) and count
// against the 60/min per-user bucket. Anything else is a guest:
// shared token, 10/min per-IP bucket (IP stored as a SHA-256 hash,
// never raw).
//
// Verification is cached per token hash for 5 minutes (in-memory,
// this instance only) so a burst of calls from one session does
// not pay an Auth round-trip each time. Only the hash is stored,
// never the token.
//
// The rate limit is enforced by the check_proxy_rate_limit()
// SQL function (migration 004) — atomic, so it survives across
// Edge Function instances. When the DB is unavailable (migration
// not run yet, or a DB error) the request is ALLOWED and a warning
// is logged: the app must keep working before the user runs the
// migration, and the limiter starts enforcing once it lands.
// The nightly job (refreshRanked) and the auth actions never pass
// through here — the job has its own token, the auth actions are
// already JWT-gated and code-bound.
// ---------------------------------------------------------------------------

interface ProxyEnv {
  supabaseUrl: string | null
  anonKey: string | null
  serviceRoleKey: string | null
  encryptionKeyB64: string | null
}

function readProxyEnv(): ProxyEnv {
  return {
    supabaseUrl: Deno.env.get('SUPABASE_URL') ?? null,
    anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? null,
    serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? null,
    encryptionKeyB64: Deno.env.get('OSU_TOKEN_ENCRYPTION_KEY') ?? null,
  }
}

let warnedMissingServiceRole = false

function serviceClientFor(env: ProxyEnv): SupabaseClient | null {
  if (!env.supabaseUrl || !env.serviceRoleKey) {
    if (!warnedMissingServiceRole) {
      warnedMissingServiceRole = true
      console.warn(
        '[RecOsuk proxy] SUPABASE_SERVICE_ROLE_KEY is not set — DB cache + rate limit are off (in-memory cache only). ' +
          'Set it with: supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...',
      )
    }
    return null
  }
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const JWT_VERIFY_TTL_MS = 5 * 60 * 1000
const verifiedJwtCache = new Map<string, { userId: string; expiresAt: number }>()

/** Verifies a Bearer token as a Supabase user session. Returns the
 *  user id, or null for the anon key / missing / invalid tokens. */
async function verifyUserJwt(
  token: string,
  env: ProxyEnv,
): Promise<string | null> {
  if (!env.supabaseUrl || !env.anonKey) return null
  if (token === env.anonKey) return null
  const key = await sha256Hex(token)
  const cached = verifiedJwtCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.userId
  const authClient = createClient(env.supabaseUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data.user) {
    verifiedJwtCache.delete(key)
    return null
  }
  verifiedJwtCache.set(key, { userId: data.user.id, expiresAt: Date.now() + JWT_VERIFY_TTL_MS })
  return data.user.id
}

async function resolveProxyCtx(req: Request): Promise<ProxyCtx> {
  const env = readProxyEnv()
  const service = serviceClientFor(env)
  const ctx: ProxyCtx = {
    service,
    userToken: null,
    callerKind: 'guest',
    userId: null,
    cache: { mem: 0, db: 0, miss: 0 },
  }
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!bearer) return ctx
  const userId = await verifyUserJwt(bearer, env)
  if (!userId) return ctx
  ctx.callerKind = 'user'
  ctx.userId = userId
  if (service && env.encryptionKeyB64) {
    try {
      ctx.userToken = await getUserAccessTokenBestEffort({
        store: supabaseTokenStore(service),
        fetchFn: fetch,
        env: {
          clientId: Deno.env.get('OSU_CLIENT_ID') ?? '',
          clientSecret: Deno.env.get('OSU_CLIENT_SECRET') ?? '',
          encryptionKeyB64: env.encryptionKeyB64,
        },
        userId,
      })
    } catch {
      ctx.userToken = null
    }
    if (!ctx.userToken) {
      console.warn('[RecOsuk proxy] signed-in caller has no usable osu! token — using the shared token.')
    }
  }
  return ctx
}

interface RateLimitOutcome {
  allowed: boolean
  retryAfterSeconds: number
  key: string
  limit: number
}

async function checkProxyRateLimit(
  ctx: ProxyCtx,
  req: Request,
): Promise<RateLimitOutcome> {
  // Service callers (the nightly job, auth actions) never pass
  // through the limiter — this guard is the belt to the
  // Deno.serve routing's braces; it also narrows callerKind to
  // 'user' | 'guest' for the limit lookup below.
  if (ctx.callerKind === 'service') {
    return { allowed: true, retryAfterSeconds: 0, key: 'service', limit: RATE_LIMIT_USER_PER_MIN }
  }
  const limit = rateLimitForCaller(ctx.callerKind)
  let key: string
  if (ctx.callerKind === 'user') {
    key = rateLimitKeyForUser(ctx.userId ?? 'unknown')
  } else {
    const ip = clientIpFromHeaders((name) => req.headers.get(name))
    key = rateLimitKeyForGuest(ip ? await sha256Hex(ip) : 'unknown')
  }
  if (!ctx.service) {
    return { allowed: true, retryAfterSeconds: 0, key, limit }
  }
  try {
    const { data, error } = await ctx.service.rpc('check_proxy_rate_limit', {
      p_key: key,
      p_limit: limit,
    })
    if (error || !Array.isArray(data) || data.length === 0) {
      console.warn(
        '[RecOsuk proxy] rate-limit check failed (migration 004 not run yet?) — allowing the request.',
        error?.message ?? '',
      )
      return { allowed: true, retryAfterSeconds: 0, key, limit }
    }
    const row = data[0] as { allowed: boolean; retry_after_seconds: number }
    return {
      allowed: row.allowed === true,
      retryAfterSeconds:
        typeof row.retry_after_seconds === 'number' && row.retry_after_seconds > 0
          ? Math.ceil(row.retry_after_seconds)
          : 0,
      key,
      limit,
    }
  } catch (err) {
    console.warn('[RecOsuk proxy] rate-limit check threw — allowing the request.', String(err))
    return { allowed: true, retryAfterSeconds: 0, key, limit }
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
    // Diagnostic probe: does osu! accept this user token for the
    // official download endpoint? Manual redirects (a 302-to-login is
    // reported, not followed), status + headers, and — for HTML pages
    // only — at most 300 chars of body as a diagnostic snippet. No
    // bytes are downloaded, no bytes are streamed to the browser. No
    // retry, no mirror fallback: the probe answers exactly one
    // question, and Phase B is gated on it.
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
        location: full.location,
        redirected: full.redirected,
        snippet: full.snippet,
        diagnosis: full.diagnosis,
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
//
// Flow for a public data call (batch AP): resolve the caller (their
// own osu! token when signed in + linked, shared token otherwise),
// enforce the per-user / per-IP rate limit, then run the action.
// The nightly job (refreshRanked) and the auth actions skip the
// rate limit — the job has its own token, the auth actions are
// already JWT-gated and code-bound — but still get a service ctx
// so their scan pages can use the DB cache.
//
// Structured log (batch AP item 3b): one compact line per request
// in the function logs — action, caller kind, which token rode
// the call, cache hits/misses, status, elapsed ms. 429s get a
// warning line of their own. No token or IP is ever logged.
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const startedAt = Date.now()
  const headers = corsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers })
  }

  // A ctx is needed even on the error paths (the structured log
  // line); the service caller ctx is the cheapest safe default.
  let ctx: ProxyCtx = {
    service: null,
    userToken: null,
    callerKind: 'service',
    userId: null,
    cache: { mem: 0, db: 0, miss: 0 },
  }
  let action = ''

  try {
    let params: Params = {}
    if (req.method === 'POST') {
      const text = await req.text()
      if (text.trim() !== '') {
        try {
          params = JSON.parse(text) as Params
        } catch {
          return errorJson('Request body must be valid JSON', 400, undefined, headers)
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

    action = typeof params.action === 'string' ? params.action : ''
    const isAuthAction = [
      'getOsuAuthorizeUrl',
      'exchangeOsuCode',
      'osuAuthStatus',
      'disconnectOsu',
      'probeOsuDownload',
    ].includes(action)
    if (isAuthAction || action === 'refreshRanked') {
      // No rate limit here (see the header comment) — but the
      // service client is still built so scan pages use the DB
      // cache. The auth actions verify their own JWTs inside
      // runAuthAction; refreshRanked checks its token inside
      // runAction.
      const env = readProxyEnv()
      ctx = {
        service: serviceClientFor(env),
        userToken: null,
        callerKind: 'service',
        userId: null,
        cache: { mem: 0, db: 0, miss: 0 },
      }
    } else {
      ctx = await resolveProxyCtx(req)
      const limit = await checkProxyRateLimit(ctx, req)
      if (!limit.allowed) {
        const message = formatRateLimitMessage(limit.limit, limit.retryAfterSeconds)
        console.warn('[RecOsuk proxy] rate limited', {
          action,
          caller: ctx.callerKind,
          limit: limit.limit,
          retryAfterSeconds: limit.retryAfterSeconds,
        })
        return errorJson(message, 429, 'rate_limited', headers, {
          'Retry-After': String(Math.max(1, limit.retryAfterSeconds)),
        })
      }
    }

    const data = await runAction(params, req, ctx)
    console.info('[RecOsuk proxy]', {
      action,
      caller: ctx.callerKind,
      token: ctx.userToken ? 'user' : 'shared',
      cache: ctx.cache,
      status: 200,
      ms: Date.now() - startedAt,
    })
    return json({ data }, 200, headers)
  } catch (err) {
    const status = err instanceof ProxyError || err instanceof OsuAuthError ? err.status : 500
    console.info('[RecOsuk proxy]', {
      action,
      caller: ctx.callerKind,
      token: ctx.userToken ? 'user' : 'shared',
      cache: ctx.cache,
      status,
      ms: Date.now() - startedAt,
    })
    if (err instanceof OsuAuthError) {
      return errorJson(err.message, err.status, err.code, headers)
    }
    if (err instanceof ProxyError) {
      return errorJson(err.message, err.status, err.code, headers)
    }
    return errorJson('osu-proxy internal error', 500, undefined, headers)
  }
})
