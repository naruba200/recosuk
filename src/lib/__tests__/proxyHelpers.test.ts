// Batch AP tests: the pure proxy helpers shared by the Edge Function
// (Deno) and vitest (Node). No network, no database — every rule is
// exercised in-process.
import { describe, expect, it } from 'vitest'
import {
  CACHE_TTL_BEATMAP_MS,
  CACHE_TTL_PACKS_MS,
  CACHE_TTL_TAGS_MS,
  CACHE_TTL_USER_MS,
  FEEDBACK_NEW_PER_HOUR,
  LIST_MAX_ITEMS,
  RATE_LIMIT_GUEST_PER_MIN,
  RATE_LIMIT_OWNER_PER_MIN,
  RATE_LIMIT_USER_PER_MIN,
  RATE_LIMIT_WINDOW_SECONDS,
  SNAPSHOT_THROTTLE_MS,
  cacheTtlMsForPath,
  clientIpFromHeaders,
  formatRateLimitMessage,
  isAllowedOrigin,
  isRateLimitExemptAction,
  isWithinThrottleWindow,
  parseAllowedOrigins,
  rateLimitError,
  rateLimitForCaller,
  rateLimitForUser,
  rateLimitIdentityForGuest,
  rateLimitIdentityForUser,
  rateLimitKeyForGuest,
  rateLimitKeyForUser,
  sha256Hex,
} from '../../../supabase/functions/osu-proxy/proxyHelpers'

describe('rate limits (batch AP item 2a)', () => {
  it('caps signed-in users at 60/min and guests at 10/min', () => {
    expect(RATE_LIMIT_USER_PER_MIN).toBe(60)
    expect(RATE_LIMIT_GUEST_PER_MIN).toBe(10)
    expect(RATE_LIMIT_WINDOW_SECONDS).toBe(60)
    expect(rateLimitForCaller('user')).toBe(60)
    expect(rateLimitForCaller('guest')).toBe(10)
  })

  it('builds distinct bucket keys per user and per IP hash', () => {
    expect(rateLimitKeyForUser('uuid-1')).toBe('user:uuid-1')
    expect(rateLimitKeyForUser('uuid-2')).not.toBe(rateLimitKeyForUser('uuid-1'))
    expect(rateLimitKeyForGuest('abc123')).toBe('ip:abc123')
    expect(rateLimitKeyForGuest('abc123')).not.toBe(rateLimitKeyForUser('abc123'))
  })

  it('formats an honest 429 message with the wait in seconds', () => {
    expect(formatRateLimitMessage(60, 17)).toBe(
      "Too many requests — you're at the 60-calls-a-minute limit for RecOsuk's osu! proxy. Try again in 17 seconds.",
    )
    expect(formatRateLimitMessage(10, 1)).toContain('Try again in 1 second.')
    expect(formatRateLimitMessage(60, 0)).not.toContain('Try again')
  })
})

describe('owner high cap (batch AW)', () => {
  const OWNER = '11111111-1111-1111-1111-111111111111'
  const OTHER_USER = '22222222-2222-2222-2222-222222222222'

  it('caps the owner at 600/min', () => {
    expect(RATE_LIMIT_OWNER_PER_MIN).toBe(600)
    expect(rateLimitForUser(OWNER, OWNER)).toBe(600)
  })

  it('keeps every other signed-in user at 60/min', () => {
    expect(rateLimitForUser(OTHER_USER, OWNER)).toBe(60)
    expect(rateLimitForUser(OWNER, OTHER_USER)).toBe(60)
  })

  it('never exempts anyone when the owner id is unset or empty', () => {
    expect(rateLimitForUser(OWNER, undefined)).toBe(60)
    expect(rateLimitForUser(OWNER, '')).toBe(60)
    expect(rateLimitForUser(OTHER_USER, undefined)).toBe(60)
  })

  it('keeps guests at 10/min', () => {
    expect(rateLimitForCaller('guest')).toBe(10)
  })

  it('quotes the real limit in the 429 message — 600 for the owner', () => {
    expect(formatRateLimitMessage(600, 5)).toContain('600-calls-a-minute')
  })
})

describe('rate-limit exemption + miss-path limiter (§AZ)', () => {
  const OWNER = '11111111-1111-1111-1111-111111111111'
  const OTHER_USER = '22222222-2222-2222-2222-222222222222'

  it('exempts file fetches, auth actions, and the nightly job — nothing else', () => {
    // Item 1: .osu files come from the website endpoint, not the
    // API, so the API's 60/min ask never covered them.
    expect(isRateLimitExemptAction('getBeatmapFile')).toBe(true)
    for (const action of [
      'getOsuAuthorizeUrl',
      'exchangeOsuCode',
      'osuAuthStatus',
      'disconnectOsu',
      'probeOsuDownload',
      'refreshRanked',
    ]) {
      expect(isRateLimitExemptAction(action)).toBe(true)
    }
    for (const action of [
      'getUser',
      'getTopPlays',
      'getRecentPlays',
      'getMostPlayed',
      'searchBeatmapsets',
      'getBeatmap',
      'getBeatmapset',
      'getDifficultyAttributes',
      'getBeatmapPacks',
      'getBeatmapPack',
      'getBeatmapUserTags',
    ]) {
      expect(isRateLimitExemptAction(action)).toBe(false)
    }
  })

  it('resolves the owner identity to 600 and everyone else to 60 (values unchanged)', () => {
    expect(rateLimitIdentityForUser(OWNER, OWNER)).toEqual({
      key: 'user:11111111-1111-1111-1111-111111111111',
      limit: 600,
    })
    expect(rateLimitIdentityForUser(OTHER_USER, OWNER)).toEqual({
      key: 'user:22222222-2222-2222-2222-222222222222',
      limit: 60,
    })
    expect(rateLimitIdentityForUser(OWNER, undefined)).toEqual({
      key: 'user:11111111-1111-1111-1111-111111111111',
      limit: 60,
    })
  })

  it('resolves guests to their hashed-IP bucket at 10', () => {
    expect(rateLimitIdentityForGuest('abc123')).toEqual({ key: 'ip:abc123', limit: 10 })
  })

  it('builds the exact 429 descriptor: message, status, code, Retry-After', () => {
    const err = rateLimitError(60, 17)
    expect(err.status).toBe(429)
    expect(err.code).toBe('rate_limited')
    expect(err.message).toBe(
      "Too many requests — you're at the 60-calls-a-minute limit for RecOsuk's osu! proxy. Try again in 17 seconds.",
    )
    expect(err.headers).toEqual({ 'Retry-After': '17' })
  })

  it('clamps Retry-After to at least 1 second', () => {
    expect(rateLimitError(60, 0).headers).toEqual({ 'Retry-After': '1' })
    expect(rateLimitError(10, -5).headers).toEqual({ 'Retry-After': '1' })
  })
})

describe('CORS allowlist (batch AP item 2b)', () => {
  it('defaults to the production domain only', () => {
    expect(parseAllowedOrigins(undefined)).toEqual(['https://recosuk.vercel.app'])
    expect(parseAllowedOrigins('')).toEqual(['https://recosuk.vercel.app'])
  })

  it('parses a comma-separated ALLOWED_ORIGINS override', () => {
    expect(parseAllowedOrigins('https://recosuk.vercel.app, https://staging.example.com'))
      .toEqual(['https://recosuk.vercel.app', 'https://staging.example.com'])
    expect(parseAllowedOrigins('  https://a.example.com ,, https://b.example.com '))
      .toEqual(['https://a.example.com', 'https://b.example.com'])
  })

  it('allows the production domain and any localhost origin, nothing else', () => {
    const allowed = parseAllowedOrigins(undefined)
    expect(isAllowedOrigin('https://recosuk.vercel.app', allowed)).toBe(true)
    expect(isAllowedOrigin('http://localhost:5173', allowed)).toBe(true)
    expect(isAllowedOrigin('http://127.0.0.1:3000', allowed)).toBe(true)
    expect(isAllowedOrigin('https://localhost:5173', allowed)).toBe(true)
    expect(isAllowedOrigin('https://evil.example.com', allowed)).toBe(false)
    expect(isAllowedOrigin('https://recosuk.vercel.app.evil.com', allowed)).toBe(false)
    expect(isAllowedOrigin('https://recosuk-vercel.app', allowed)).toBe(false)
    expect(isAllowedOrigin('', allowed)).toBe(false)
    expect(isAllowedOrigin('not-a-url', allowed)).toBe(false)
  })

  it('allows a domain listed in the override', () => {
    const allowed = parseAllowedOrigins('https://staging.example.com')
    expect(isAllowedOrigin('https://staging.example.com', allowed)).toBe(true)
    expect(isAllowedOrigin('https://recosuk.vercel.app', allowed)).toBe(false)
  })
})

describe('caller identity helpers (batch AP item 1a)', () => {
  it('takes the first address from X-Forwarded-For', () => {
    const get = (name: string) =>
      name === 'x-forwarded-for' ? '203.0.113.7, 198.51.100.2, 192.0.2.1' : null
    expect(clientIpFromHeaders(get)).toBe('203.0.113.7')
  })

  it('falls back to the connecting-IP headers, then null', () => {
    const cf = (name: string) => (name === 'cf-connecting-ip' ? '203.0.113.9' : null)
    expect(clientIpFromHeaders(cf)).toBe('203.0.113.9')
    expect(clientIpFromHeaders(() => null)).toBeNull()
    expect(clientIpFromHeaders(() => '   ')).toBeNull()
  })

  it('sha256Hex hashes deterministically and never returns the input', async () => {
    const hash = await sha256Hex('203.0.113.7')
    expect(hash).toHaveLength(64)
    expect(hash).not.toContain('203.0.113.7')
    expect(await sha256Hex('203.0.113.7')).toBe(hash)
    expect(await sha256Hex('203.0.113.8')).not.toBe(hash)
  })
})

describe('cache TTLs (batch AP item 1b)', () => {
  it('gives searches 5 min, beatmap lookups 1h, packs 6h, tags 24h', () => {
    expect(CACHE_TTL_USER_MS).toBe(5 * 60 * 1000)
    expect(CACHE_TTL_BEATMAP_MS).toBe(60 * 60 * 1000)
    expect(CACHE_TTL_PACKS_MS).toBe(6 * 60 * 60 * 1000)
    expect(CACHE_TTL_TAGS_MS).toBe(24 * 60 * 60 * 1000)
  })

  it('picks the TTL by path, with searches staying short', () => {
    expect(cacheTtlMsForPath('/beatmapsets/search?mode=osu')).toBe(CACHE_TTL_USER_MS)
    expect(cacheTtlMsForPath('/users/123/osu')).toBe(CACHE_TTL_USER_MS)
    expect(cacheTtlMsForPath('/beatmapsets/123')).toBe(CACHE_TTL_BEATMAP_MS)
    expect(cacheTtlMsForPath('/beatmaps/456')).toBe(CACHE_TTL_BEATMAP_MS)
    expect(cacheTtlMsForPath('/beatmaps/456/attributes')).toBe(CACHE_TTL_BEATMAP_MS)
    expect(cacheTtlMsForPath('/beatmapsets/packs?type=standard')).toBe(CACHE_TTL_PACKS_MS)
    expect(cacheTtlMsForPath('/tags')).toBe(CACHE_TTL_TAGS_MS)
  })
})

describe('write-throttle constants (batch AP item 2d)', () => {
  it('pins the snapshot / list / feedback limits', () => {
    expect(SNAPSHOT_THROTTLE_MS).toBe(60 * 60 * 1000)
    expect(LIST_MAX_ITEMS).toBe(500)
    expect(FEEDBACK_NEW_PER_HOUR).toBe(60)
  })

  it('isWithinThrottleWindow compares against the window', () => {
    const now = 1_000_000_000
    expect(isWithinThrottleWindow(now - 59 * 60 * 1000, now, SNAPSHOT_THROTTLE_MS)).toBe(true)
    expect(isWithinThrottleWindow(now - 60 * 60 * 1000, now, SNAPSHOT_THROTTLE_MS)).toBe(false)
    expect(isWithinThrottleWindow(now - 61 * 60 * 1000, now, SNAPSHOT_THROTTLE_MS)).toBe(false)
  })
})
