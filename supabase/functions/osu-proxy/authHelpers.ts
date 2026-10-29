// RecOsuk batch 15, Phase A — osu! user-OAuth helpers.
//
// PURE + RUNTIME-AGNOSTIC: no Deno APIs, no imports, only WebCrypto and
// fetch globals. This module is imported by the Edge Function (Deno) AND
// by vitest (Node), so everything that touches the network or the
// database is injected (fetchFn / TokenStore). Keep it that way.
//
// What this covers: AES-GCM token encryption, the authorization-code
// grant + refresh grant against https://osu.ppy.sh/oauth/token, the
// cheap /me lookup at exchange time, refresh-on-expiry orchestration
// (getValidAccessToken), redirect-URI validation, and the header-only
// download probe. Phase A NEVER streams a beatmap to the browser —
// that is Phase B, gated on the probe passing live first.
//
// No PKCE: the code exchange happens server-side with the client secret,
// and the browser never sees a token. `state` (crypto-random, checked
// against sessionStorage on the callback page) is the CSRF protection
// for this flow — a deliberate, documented choice.

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Typed auth error. `code` is what the client keys off; `status` is the HTTP status. */
export class OsuAuthError extends Error {
  code: string
  status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'OsuAuthError'
    this.code = code
    this.status = status
  }
}

export const OSU_AUTH_EXPIRED_CODE = 'osu_auth_expired'
export const OSU_CONFIG_MISSING_CODE = 'osu_config_missing'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Refresh this many ms before the access token actually expires. */
export const TOKEN_REFRESH_LEEWAY_MS = 60_000

/**
 * Default beatmapset probed by probeOsuDownload when no id is given.
 * Id 1 is the oldest public beatmapset id on osu.ppy.sh — any public
 * set works, because the probe only reads status + headers and never
 * downloads bytes. A 404 here means THIS id is gone, not that auth
 * failed; the probe action accepts any beatmapsetId to re-check.
 */
export const DEFAULT_PROBE_BEATMAPSET_ID = 1

/** Scopes requested at sign-in. `identify` = who the user is; `public` = public profile data. */
export const OSU_AUTH_SCOPES = ['identify', 'public'] as const

// ---------------------------------------------------------------------------
// Base64 helpers (atob/btoa exist in Deno and in Node >= 16)
// ---------------------------------------------------------------------------

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length) as Uint8Array<ArrayBuffer>
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// ---------------------------------------------------------------------------
// Encryption: AES-GCM, 256-bit key, random 12-byte IV prepended.
// Stored form: base64(iv || ciphertext). One key, from the secret
// OSU_TOKEN_ENCRYPTION_KEY (base64, 32 bytes; `openssl rand -base64 32`).
// ---------------------------------------------------------------------------

async function importEncryptionKey(keyB64: string): Promise<CryptoKey> {
  let raw: Uint8Array<ArrayBuffer>
  try {
    raw = base64ToBytes(keyB64)
  } catch {
    throw new OsuAuthError(
      OSU_CONFIG_MISSING_CODE,
      'OSU_TOKEN_ENCRYPTION_KEY is not valid base64. Set it to the output of: openssl rand -base64 32',
      500,
    )
  }
  if (raw.length !== 32) {
    throw new OsuAuthError(
      OSU_CONFIG_MISSING_CODE,
      'OSU_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (the output of: openssl rand -base64 32).',
      500,
    )
  }
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptToken(plaintext: string, keyB64: string): Promise<string> {
  const key = await importEncryptionKey(keyB64)
  // ArrayBuffer-backed (not ArrayBufferLike): TS 6's WebCrypto typings
  // require BufferSource, which the inferred getRandomValues result
  // does not satisfy. The cast is type-only — the bytes are identical.
  const iv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  const combined = new Uint8Array(12 + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), 12)
  return bytesToBase64(combined)
}

export async function decryptToken(blob: string, keyB64: string): Promise<string> {
  const key = await importEncryptionKey(keyB64)
  let combined: Uint8Array
  try {
    combined = base64ToBytes(blob)
  } catch {
    throw new OsuAuthError(
      'osu_token_corrupt',
      'Stored osu! tokens are not valid encrypted data. Sign in with osu! again.',
      401,
    )
  }
  if (combined.length <= 12) {
    throw new OsuAuthError(
      'osu_token_corrupt',
      'Stored osu! tokens are truncated. Sign in with osu! again.',
      401,
    )
  }
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
    return new TextDecoder().decode(plaintext)
  } catch {
    throw new OsuAuthError(
      'osu_token_corrupt',
      'Stored osu! tokens could not be decrypted (wrong OSU_TOKEN_ENCRYPTION_KEY or tampered data). Sign in with osu! again.',
      401,
    )
  }
}

// ---------------------------------------------------------------------------
// Redirect URI validation + authorize URL
// ---------------------------------------------------------------------------

/**
 * The redirect_uri is origin-derived on the client
 * (`${window.location.origin}/auth/osu/callback`) so it works on the
 * Vercel deploy and on localhost with no env config. The server must
 * never accept an arbitrary redirect_uri (open-redirect / code-theft
 * vector): it has to be exactly this path, on an http(s) origin, with
 * no query, fragment, or embedded credentials.
 */
export function isValidOsuRedirectUri(uri: string): boolean {
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (url.username !== '' || url.password !== '') return false
  if (url.hostname === '') return false
  if (url.pathname !== '/auth/osu/callback') return false
  if (url.search !== '' || url.hash !== '') return false
  return true
}

export function buildOsuAuthorizeUrl(args: {
  clientId: string
  redirectUri: string
  state: string
  scopes?: readonly string[]
}): string {
  const url = new URL('https://osu.ppy.sh/oauth/authorize')
  url.searchParams.set('client_id', args.clientId)
  url.searchParams.set('redirect_uri', args.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', [...(args.scopes ?? OSU_AUTH_SCOPES)].join(' '))
  url.searchParams.set('state', args.state)
  return url.toString()
}

// ---------------------------------------------------------------------------
// osu! token endpoint (authorization_code + refresh_token grants)
// ---------------------------------------------------------------------------

export interface OAuthClientEnv {
  clientId: string
  clientSecret: string
}

export interface TokenGrant {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

type FetchFn = typeof fetch

async function postTokenGrant(
  fetchFn: FetchFn,
  body: Record<string, string>,
): Promise<TokenGrant> {
  const res = await fetchFn('https://osu.ppy.sh/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(body),
  })
  if (!res.ok) {
    let description = ''
    try {
      const errBody = (await res.json()) as { error_description?: string; error?: string }
      description = errBody.error_description ?? errBody.error ?? ''
    } catch {
      // Non-JSON error body: fall through with the status only.
    }
    if (/redirect_uri/i.test(description)) {
      throw new OsuAuthError(
        'osu_redirect_uri_mismatch',
        'osu! rejected the redirect URI — it is not registered in the osu! OAuth app settings. ' +
          'Add the redirect URI shown in Settings (osu! account connection) to the app at osu.ppy.sh/home/account/edit#oauth, then try again.',
        400,
      )
    }
    throw new OsuAuthError(
      'osu_exchange_failed',
      `osu! refused the token request (HTTP ${res.status})${description ? `: ${description}` : ''}. ` +
        'If this keeps happening, check the osu! OAuth app settings (client id/secret and redirect URIs).',
      502,
    )
  }
  const json = (await res.json()) as {
    access_token?: unknown
    refresh_token?: unknown
    expires_in?: unknown
  }
  if (typeof json.access_token !== 'string' || typeof json.refresh_token !== 'string') {
    throw new OsuAuthError(
      'osu_exchange_failed',
      'osu! returned a token response without access/refresh tokens.',
      502,
    )
  }
  const expiresIn = typeof json.expires_in === 'number' && json.expires_in > 0 ? json.expires_in : 86400
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresIn }
}

export async function exchangeAuthorizationCode(
  deps: { fetchFn: FetchFn; env: OAuthClientEnv },
  args: { code: string; redirectUri: string },
): Promise<TokenGrant> {
  return postTokenGrant(deps.fetchFn, {
    grant_type: 'authorization_code',
    client_id: deps.env.clientId,
    client_secret: deps.env.clientSecret,
    code: args.code,
    redirect_uri: args.redirectUri,
  })
}

export async function refreshAccessToken(
  deps: { fetchFn: FetchFn; env: OAuthClientEnv },
  args: { refreshToken: string },
): Promise<TokenGrant> {
  try {
    return await postTokenGrant(deps.fetchFn, {
      grant_type: 'refresh_token',
      client_id: deps.env.clientId,
      client_secret: deps.env.clientSecret,
      refresh_token: args.refreshToken,
    })
  } catch (err) {
    // A rejected refresh means the osu! session is dead — the caller
    // deletes the stored row and the UI prompts a re-sign-in.
    if (err instanceof OsuAuthError && err.code === OSU_CONFIG_MISSING_CODE) throw err
    throw new OsuAuthError(
      OSU_AUTH_EXPIRED_CODE,
      'The osu! connection has expired (osu! rejected the refresh token). Sign in with osu! again.',
      401,
    )
  }
}

// ---------------------------------------------------------------------------
// /me lookup (once, at exchange time — status reads storage only)
// ---------------------------------------------------------------------------

export async function fetchOsuMe(
  fetchFn: FetchFn,
  accessToken: string,
): Promise<{ id: number; username: string } | null> {
  try {
    const res = await fetchFn('https://osu.ppy.sh/api/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    })
    if (!res.ok) return null
    const body = (await res.json()) as { id?: unknown; username?: unknown }
    if (typeof body.id !== 'number' || typeof body.username !== 'string') return null
    return { id: body.id, username: body.username }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Token storage orchestration
// ---------------------------------------------------------------------------

export interface TokenRow {
  user_id: string
  access_token_enc: string
  refresh_token_enc: string
  expires_at: string // ISO timestamp
  osu_user_id: number | null
  osu_username: string | null
}

export interface TokenStore {
  get(userId: string): Promise<TokenRow | null>
  upsert(row: TokenRow): Promise<void>
  remove(userId: string): Promise<void>
}

export interface UserTokenEnv extends OAuthClientEnv {
  encryptionKeyB64: string
}

export function isTokenExpired(expiresAtMs: number, nowMs: number, leewayMs = TOKEN_REFRESH_LEEWAY_MS): boolean {
  return expiresAtMs - leewayMs <= nowMs
}

/**
 * Returns a usable user access token for this RecOsuk account, refreshing
 * first when expired (60s leeway). Refresh failure — or undecryptable
 * stored tokens — deletes the row and throws `osu_auth_expired` so the
 * UI prompts a re-sign-in. A missing/misconfigured encryption key is a
 * server config error (500): the row is left alone, never deleted.
 */
export async function getValidAccessToken(deps: {
  store: TokenStore
  fetchFn: FetchFn
  env: UserTokenEnv
  userId: string
  nowMs?: number
}): Promise<{ accessToken: string; osuUserId: number | null }> {
  const row = await deps.store.get(deps.userId)
  if (!row) {
    throw new OsuAuthError(
      OSU_AUTH_EXPIRED_CODE,
      'No osu! connection for this account. Sign in with osu! to enable in-page official downloads.',
      401,
    )
  }
  let accessToken: string
  let refreshToken: string
  try {
    accessToken = await decryptToken(row.access_token_enc, deps.env.encryptionKeyB64)
    refreshToken = await decryptToken(row.refresh_token_enc, deps.env.encryptionKeyB64)
  } catch (err) {
    if (err instanceof OsuAuthError && err.code === OSU_CONFIG_MISSING_CODE) throw err
    await deps.store.remove(deps.userId)
    throw new OsuAuthError(
      OSU_AUTH_EXPIRED_CODE,
      'Stored osu! tokens could not be decrypted. Sign in with osu! again.',
      401,
    )
  }
  const nowMs = deps.nowMs ?? Date.now()
  if (!isTokenExpired(Date.parse(row.expires_at), nowMs)) {
    return { accessToken, osuUserId: row.osu_user_id }
  }
  let grant: TokenGrant
  try {
    grant = await refreshAccessToken(
      { fetchFn: deps.fetchFn, env: deps.env },
      { refreshToken },
    )
  } catch (err) {
    if (err instanceof OsuAuthError && err.code === OSU_CONFIG_MISSING_CODE) throw err
    await deps.store.remove(deps.userId)
    throw err
  }
  const expiresAt = new Date(nowMs + grant.expiresIn * 1000).toISOString()
  await deps.store.upsert({
    ...row,
    access_token_enc: await encryptToken(grant.accessToken, deps.env.encryptionKeyB64),
    refresh_token_enc: await encryptToken(grant.refreshToken, deps.env.encryptionKeyB64),
    expires_at: expiresAt,
  })
  return { accessToken: grant.accessToken, osuUserId: row.osu_user_id }
}

// ---------------------------------------------------------------------------
// Download probe (header-only — the body is cancelled, never read)
// ---------------------------------------------------------------------------

/** Client-side twin: src/lib/mirrors.ts builds the same official URL. */
export function officialDownloadUrl(beatmapsetId: number, noVideo: boolean): string {
  const base = `https://osu.ppy.sh/beatmapsets/${beatmapsetId}/download`
  return noVideo ? `${base}?noVideo=1` : base
}

export interface ProbeVariantResult {
  status: number
  contentType: string | null
  contentLength: string | null
  contentDisposition: string | null
  /** True only for 200 + octet-stream/zip + attachment disposition. */
  pass: boolean
}

export function probeVerdict(
  status: number,
  headers: { contentType: string | null; contentDisposition: string | null },
): boolean {
  if (status !== 200) return false
  const ct = (headers.contentType ?? '').toLowerCase()
  const cd = (headers.contentDisposition ?? '').toLowerCase()
  const isArchive =
    ct.includes('application/octet-stream') || ct.includes('application/zip') || ct.includes('application/x-zip')
  return isArchive && cd.includes('attachment')
}

/**
 * One header-only probe of the official download URL with the user's
 * Bearer token. Reads status + headers, then CANCELS the body without
 * downloading a single byte. No retry, no mirror fallback — the probe
 * answers exactly one question: does osu! accept this user token for
 * downloads?
 */
export async function probeDownloadVariant(deps: {
  fetchFn: FetchFn
  url: string
  accessToken: string
}): Promise<ProbeVariantResult> {
  const res = await deps.fetchFn(deps.url, {
    headers: { Authorization: `Bearer ${deps.accessToken}` },
    redirect: 'follow',
  })
  const result: ProbeVariantResult = {
    status: res.status,
    contentType: res.headers.get('content-type'),
    contentLength: res.headers.get('content-length'),
    contentDisposition: res.headers.get('content-disposition'),
    pass: false,
  }
  // Cancel immediately: the body must never be consumed in Phase A.
  try {
    await res.body?.cancel()
  } catch {
    // Body already gone — nothing to cancel.
  }
  result.pass = probeVerdict(result.status, {
    contentType: result.contentType,
    contentDisposition: result.contentDisposition,
  })
  return result
}
