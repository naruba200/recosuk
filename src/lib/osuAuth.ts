// RecOsuk batch 15, Phase A — client helpers for the osu! sign-in flow.
//
// The browser NEVER sees a token value: the Edge Function returns only
// {osuUsername, osuUserId, expiresAt} at exchange time, {connected,
// osuUsername, expiresAt, expired} for status, and probe headers. All
// calls go through the existing proxyCall (which sends the Supabase
// session JWT as the Bearer token when signed in — the server verifies
// it before touching the token table).
//
// Account users ONLY. Guests never reach these helpers: the Settings
// row renders locked for them (LockedButton pattern, same as M5).

import { OsuServiceError, proxyCall } from './osu'

/** Signature of the proxy caller, injectable so tests can fake the server. */
export type ProxyCaller = <T = unknown>(
  action: string,
  params?: Record<string, unknown>,
) => Promise<T>

/** sessionStorage key for the OAuth `state` value (CSRF protection). */
export const OSU_AUTH_STATE_KEY = 'recosuk-osu-auth-state'

/** Scopes requested at sign-in: identity (who the user is) + public (public profile data). */
export const OSU_AUTH_SCOPES = ['identify', 'public'] as const

/**
 * Default beatmapset probed by the header-only download probe. Id 1 is
 * the oldest public beatmapset id — any public set works, because the
 * probe only reads status + headers and never downloads bytes. A 404
 * here means this id is gone, not that auth failed.
 */
export const PROBE_BEATMAPSET_ID = 1

// ---------------------------------------------------------------------------
// Redirect URI + state
// ---------------------------------------------------------------------------

export function osuCallbackUri(origin: string): string {
  return `${origin.replace(/\/$/, '')}/auth/osu/callback`
}

/** The exact redirect URI that must be registered in the osu! OAuth app settings. */
export function getOsuRedirectUri(): string {
  return osuCallbackUri(globalThis.location?.origin ?? '')
}

/** 32 crypto-random bytes, hex-encoded (64 chars) — the OAuth `state` value. */
export function newOsuAuthState(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// ---------------------------------------------------------------------------
// Callback parsing / validation (pure — the screen does the storage IO)
// ---------------------------------------------------------------------------

export interface OsuCallbackParams {
  code: string | null
  state: string | null
  error: string | null
  errorDescription: string | null
}

export function parseOsuCallback(search: string): OsuCallbackParams {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  return {
    code: q.get('code'),
    state: q.get('state'),
    error: q.get('error'),
    errorDescription: q.get('error_description'),
  }
}

/** The returned `state` must exactly match the one stored before redirect. */
export function isCallbackStateValid(returned: string | null, stored: string | null): boolean {
  return returned !== null && stored !== null && returned !== '' && returned === stored
}

// ---------------------------------------------------------------------------
// Server calls
// ---------------------------------------------------------------------------

export interface OsuAuthStatus {
  connected: boolean
  osuUsername: string | null
  osuUserId: number | null
  expiresAt: string | null
  /** Access token past its leeway-adjusted expiry (refresh may still renew it). */
  expired: boolean
}

export interface ProbeVariantResult {
  status: number
  contentType: string | null
  contentLength: string | null
  contentDisposition: string | null
  pass: boolean
}

export interface ProbeOsuDownloadResult {
  ok: boolean
  beatmapsetId: number
  status: number
  contentType: string | null
  contentLength: string | null
  contentDisposition: string | null
  pass: boolean
  noVideoVariant: ProbeVariantResult
}

export interface ExchangeOsuCodeResult {
  osuUsername: string | null
  osuUserId: number | null
  expiresAt: string
}

export async function getOsuAuthStatus(
  call: ProxyCaller = proxyCall,
): Promise<OsuAuthStatus> {
  return call<OsuAuthStatus>('osuAuthStatus', {})
}

export async function disconnectOsu(call: ProxyCaller = proxyCall): Promise<void> {
  await call<{ ok: boolean }>('disconnectOsu', {})
}

export async function probeOsuDownload(
  beatmapsetId: number,
  call: ProxyCaller = proxyCall,
): Promise<ProbeOsuDownloadResult> {
  return call<ProbeOsuDownloadResult>('probeOsuDownload', { beatmapsetId })
}

/**
 * Validates the callback `state`, then exchanges the code server-side.
 * Throws a plain Error with a user-facing message on state mismatch
 * (no exchange attempted, no token stored). The caller supplies the
 * stored state it read from sessionStorage.
 */
export async function exchangeOsuCode(
  code: string,
  returnedState: string | null,
  storedState: string | null,
  call: ProxyCaller = proxyCall,
): Promise<ExchangeOsuCodeResult> {
  if (!isCallbackStateValid(returnedState, storedState)) {
    throw new Error(
      'Security check failed: the sign-in response did not match this browser session. ' +
        'Please try signing in with osu! again — no tokens were stored.',
    )
  }
  return call<ExchangeOsuCodeResult>('exchangeOsuCode', {
    code,
    redirectUri: getOsuRedirectUri(),
  })
}

/**
 * Starts sign-in: asks the server for the authorize URL (the client_id
 * is public but stays server-side — no VITE_ env contract), stores the
 * `state`, then navigates. The state is stored only AFTER the server
 * answers, so a failed fetch leaves no stale state behind.
 */
export async function beginOsuSignIn(call: ProxyCaller = proxyCall): Promise<void> {
  const state = newOsuAuthState()
  const redirectUri = getOsuRedirectUri()
  const { authorizeUrl } = await call<{ authorizeUrl: string }>('getOsuAuthorizeUrl', {
    redirectUri,
    state,
  })
  try {
    sessionStorage.setItem(OSU_AUTH_STATE_KEY, state)
  } catch {
    // Private mode / storage blocked: the callback's state check will
    // fail cleanly and show the error screen instead of exchanging.
  }
  globalThis.location.assign(authorizeUrl)
}

/** True when the server says the stored osu! connection is dead — the UI should prompt a re-sign-in. */
export function isOsuAuthExpiredError(err: unknown): boolean {
  return err instanceof OsuServiceError && err.code === 'osu_auth_expired'
}
