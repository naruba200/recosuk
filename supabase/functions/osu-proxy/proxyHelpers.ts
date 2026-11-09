// RecOsuk batch AP — proxy helpers shared by the Edge Function (Deno)
// and vitest (Node).
//
// PURE + RUNTIME-AGNOSTIC: no Deno APIs, no imports, only WebCrypto.
// This module is imported by the Edge Function AND by vitest, so
// everything that touches the network or the database is injected
// by the caller (index.ts). Keep it that way.
//
// What this covers: the CORS allowlist, the per-user / per-IP rate
// limits, the shared-cache key/TTL rules, and the write-throttle
// constants. The DB-backed enforcement lives in migration 004
// (proxy_cache, proxy_rate_limits, check_proxy_rate_limit) and in
// index.ts, which calls it through the service-role client.

// ---------------------------------------------------------------------------
// Rate limits (batch AP item 2a, owner cap batch AW): 60/min per
// signed-in user, 10/min per guest IP, 600/min for the owner — the
// Supabase user UUID in the OWNER_USER_ID function secret. Window
// is a rolling 60 seconds, enforced atomically by the
// check_proxy_rate_limit() SQL function (migration 004), which
// takes the limit as a parameter, so the numbers live here only.
// ---------------------------------------------------------------------------

export const RATE_LIMIT_USER_PER_MIN = 60
export const RATE_LIMIT_GUEST_PER_MIN = 10
export const RATE_LIMIT_OWNER_PER_MIN = 600
export const RATE_LIMIT_WINDOW_SECONDS = 60

export function rateLimitForCaller(kind: 'user' | 'guest'): number {
  return kind === 'user' ? RATE_LIMIT_USER_PER_MIN : RATE_LIMIT_GUEST_PER_MIN
}

/** Per-user limit (batch AW): the owner — `ownerUserId` from the
 *  OWNER_USER_ID secret — gets 600/min; every other signed-in
 *  user gets 60/min. An unset or empty owner id never matches, so
 *  the exemption can never turn on by accident. */
export function rateLimitForUser(userId: string, ownerUserId: string | undefined): number {
  return ownerUserId !== undefined && ownerUserId !== '' && userId === ownerUserId
    ? RATE_LIMIT_OWNER_PER_MIN
    : RATE_LIMIT_USER_PER_MIN
}

export function rateLimitKeyForUser(userId: string): string {
  return `user:${userId}`
}

export function rateLimitKeyForGuest(ipHash: string): string {
  return `ip:${ipHash}`
}

/** Honest 429 message — the same text the function returns in the
 *  error body and the client shows. Never a fake success. */
export function formatRateLimitMessage(limit: number, retryAfterSeconds: number): string {
  const wait =
    retryAfterSeconds > 0
      ? ` Try again in ${retryAfterSeconds} second${retryAfterSeconds === 1 ? '' : 's'}.`
      : ''
  return `Too many requests — you're at the ${limit}-calls-a-minute limit for RecOsuk's osu! proxy.${wait}`
}

// ---------------------------------------------------------------------------
// CORS allowlist (batch AP item 2b): the proxy answers the app's own
// domain plus localhost for dev. Requests with NO Origin header are
// server-to-server (the nightly job, curl, tests) and are always
// allowed — the browser is the enforcement point, so a disallowed
// Origin simply gets no Access-Control-Allow-Origin header back
// and the browser blocks the read. ALLOWED_ORIGINS (comma-separated)
// overrides the default when the deployment domain changes.
// ---------------------------------------------------------------------------

export const DEFAULT_ALLOWED_ORIGINS = ['https://recosuk.vercel.app']

export function parseAllowedOrigins(envValue: string | undefined): string[] {
  const raw = (envValue ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
  return raw.length > 0 ? raw : [...DEFAULT_ALLOWED_ORIGINS]
}

/** True when the Origin may read proxy responses. Localhost (any
 *  port, http or https) is always allowed for local dev. */
export function isAllowedOrigin(origin: string, allowed: readonly string[]): boolean {
  if (!origin) return false
  if (allowed.includes(origin)) return true
  try {
    const u = new URL(origin)
    return (
      (u.protocol === 'http:' || u.protocol === 'https:') &&
      (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
    )
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Caller identity (batch AP item 1a)
// ---------------------------------------------------------------------------

/** First address in X-Forwarded-For (the real client; later entries
 *  are proxies). Falls back to the connecting-IP headers. Null when
 *  the request carries no IP at all (then the guest bucket is one
 *  shared bucket — the rate limit still applies). */
export function clientIpFromHeaders(
  get: (name: string) => string | null,
): string | null {
  const forwarded = get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  const direct = get('cf-connecting-ip') ?? get('x-real-ip')
  const trimmed = direct?.trim()
  return trimmed ? trimmed : null
}

/** SHA-256 hex of a value — cache keys and stored IP buckets are
 *  hashes, never the raw token or IP. */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ---------------------------------------------------------------------------
// Shared cache (batch AP item 1b): the DB cache (proxy_cache,
// migration 004) reuses the same keys as the in-memory cache, so
// one key scheme covers both layers. TTLs per data type: searches
// and user/scores data go stale fast (5 min); beatmap lookups and
// .osu files are 1h (a stale hour only delays a freshly-updated
// map — the client keys PP by checksum, so it never computes from
// the wrong file); packs 6h; the tag vocabulary 24h.
// ---------------------------------------------------------------------------

export const CACHE_TTL_USER_MS = 5 * 60 * 1000
export const CACHE_TTL_BEATMAP_MS = 60 * 60 * 1000
export const CACHE_TTL_PACKS_MS = 6 * 60 * 60 * 1000
export const CACHE_TTL_TAGS_MS = 24 * 60 * 60 * 1000

/** Max response body the DB cache stores (1 MB). Bigger bodies
 *  (very large .osu files) stay in-memory only, so the 500 MB
 *  free-tier database never fills with single files. */
export const MAX_DB_CACHE_BODY_BYTES = 1_000_000

export function cacheTtlMsForPath(path: string): number {
  if (path === '/tags') return CACHE_TTL_TAGS_MS
  // Searches go stale fast (newly-ranked maps must appear) — 5 min,
  // even though other /beatmapsets/ lookups are 1h.
  if (path.startsWith('/beatmapsets/search')) return CACHE_TTL_USER_MS
  if (path.startsWith('/beatmapsets/packs')) return CACHE_TTL_PACKS_MS
  if (path.includes('/beatmaps/')) return CACHE_TTL_BEATMAP_MS
  if (path.startsWith('/beatmapsets/')) return CACHE_TTL_BEATMAP_MS
  return CACHE_TTL_USER_MS
}

// ---------------------------------------------------------------------------
// Write throttles (batch AP item 2d)
// ---------------------------------------------------------------------------

/** One stat snapshot per user per mode per hour. Enforced twice:
// the client pre-checks in persistProfile (skips the insert) and
// the DB trigger in migration 004 rejects anything that slips
// through — the trigger is the real enforcement. */
export const SNAPSHOT_THROTTLE_MS = 60 * 60 * 1000

/** Max maps in one list. Enforced in lists.ts (addToList counts
 *  first) with an honest message at the cap. */
export const LIST_MAX_ITEMS = 500

/** Max NEW feedback rows per user per rolling hour. Re-rating a map
 *  the user already rated is an update, not a new row, and is
 *  always allowed — only bulk new ratings are throttled. */
export const FEEDBACK_NEW_PER_HOUR = 60

export function isWithinThrottleWindow(
  lastMs: number,
  nowMs: number,
  windowMs: number,
): boolean {
  return nowMs - lastMs < windowMs
}
