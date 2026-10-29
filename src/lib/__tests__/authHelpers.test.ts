// Phase A tests: the runtime-agnostic helpers shared by the Edge Function
// (Deno) and vitest (Node). Network + storage are injected fakes; the
// real WebCrypto path runs in both runtimes.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PROBE_BEATMAPSET_ID,
  OSU_AUTH_EXPIRED_CODE,
  OSU_CONFIG_MISSING_CODE,
  OsuAuthError,
  buildOsuAuthorizeUrl,
  decryptToken,
  encryptToken,
  exchangeAuthorizationCode,
  fetchOsuMe,
  getValidAccessToken,
  isTokenExpired,
  isValidOsuRedirectUri,
  officialDownloadUrl,
  probeDownloadVariant,
  probeVerdict,
  refreshAccessToken,
  type TokenRow,
  type TokenStore,
} from '../../../supabase/functions/osu-proxy/authHelpers'

function makeKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
}

const KEY_A = makeKey()
const KEY_B = makeKey()

type FetchHandler = (url: string, init?: RequestInit) => Promise<Response>

function fakeFetch(handler: FetchHandler): typeof fetch {
  return (async (input: unknown, init?: unknown) =>
    handler(String(input), init as RequestInit)) as unknown as typeof fetch
}

function tokenResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function encRow(overrides: Partial<TokenRow> = {}): Promise<TokenRow> {
  return {
    user_id: 'user-1',
    access_token_enc: await encryptToken('access-1', KEY_A),
    refresh_token_enc: await encryptToken('refresh-1', KEY_A),
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    osu_user_id: 123,
    osu_username: 'sora_playz',
    ...overrides,
  }
}

function memoryStore(initial: TokenRow | null): {
  store: TokenStore
  rows: Map<string, TokenRow>
  removed: string[]
  upserts: TokenRow[]
} {
  const rows = new Map<string, TokenRow>()
  if (initial) rows.set(initial.user_id, initial)
  const removed: string[] = []
  const upserts: TokenRow[] = []
  return {
    rows,
    removed,
    upserts,
    store: {
      get: async (userId) => rows.get(userId) ?? null,
      upsert: async (row) => {
        rows.set(row.user_id, row)
        upserts.push(row)
      },
      remove: async (userId) => {
        rows.delete(userId)
        removed.push(userId)
      },
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('encrypt/decrypt (AES-GCM)', () => {
  it('round-trips a token', async () => {
    const blob = await encryptToken('sekrit-token-value', KEY_A)
    expect(blob).not.toBe('sekrit-token-value')
    await expect(decryptToken(blob, KEY_A)).resolves.toBe('sekrit-token-value')
  })

  it('produces a different blob each time (random IV) that still decrypts', async () => {
    const a = await encryptToken('same', KEY_A)
    const b = await encryptToken('same', KEY_A)
    expect(a).not.toBe(b)
    await expect(decryptToken(a, KEY_A)).resolves.toBe('same')
    await expect(decryptToken(b, KEY_A)).resolves.toBe('same')
  })

  it('fails with osu_token_corrupt under the wrong key', async () => {
    const blob = await encryptToken('sekrit', KEY_A)
    await expect(decryptToken(blob, KEY_B)).rejects.toMatchObject({
      code: 'osu_token_corrupt',
    })
  })

  it('fails with osu_token_corrupt on garbage / truncated blobs', async () => {
    await expect(decryptToken('not-base64!!!', KEY_A)).rejects.toMatchObject({
      code: 'osu_token_corrupt',
    })
    await expect(decryptToken(btoa('short'), KEY_A)).rejects.toMatchObject({
      code: 'osu_token_corrupt',
    })
  })

  it('fails with osu_config_missing when the key is not 32 bytes', async () => {
    const shortKey = btoa(String.fromCharCode(...new Uint8Array(16)))
    await expect(encryptToken('x', shortKey)).rejects.toMatchObject({
      code: OSU_CONFIG_MISSING_CODE,
      status: 500,
    })
    await expect(decryptToken('AAAA', shortKey)).rejects.toMatchObject({
      code: OSU_CONFIG_MISSING_CODE,
    })
  })
})

describe('redirect URI validation', () => {
  it('accepts the origin-derived callback URL (https + localhost)', () => {
    expect(isValidOsuRedirectUri('https://recosuk.vercel.app/auth/osu/callback')).toBe(true)
    expect(isValidOsuRedirectUri('http://localhost:5173/auth/osu/callback')).toBe(true)
    expect(isValidOsuRedirectUri('https://example.com:8443/auth/osu/callback')).toBe(true)
  })

  it('rejects anything that is not exactly <origin>/auth/osu/callback', () => {
    expect(isValidOsuRedirectUri('https://evil.com/auth/osu/callback?next=/steal')).toBe(false)
    expect(isValidOsuRedirectUri('https://evil.com/auth/osu/callback#frag')).toBe(false)
    expect(isValidOsuRedirectUri('https://evil.com/auth/osu/callback/')).toBe(false)
    expect(isValidOsuRedirectUri('https://evil.com/other/path')).toBe(false)
    expect(isValidOsuRedirectUri('https://user:pass@evil.com/auth/osu/callback')).toBe(false)
    expect(isValidOsuRedirectUri('javascript:alert(1)')).toBe(false)
    expect(isValidOsuRedirectUri('/auth/osu/callback')).toBe(false)
    expect(isValidOsuRedirectUri('not a url')).toBe(false)
    expect(isValidOsuRedirectUri('')).toBe(false)
  })
})

describe('authorize URL', () => {
  it('builds the osu! authorize URL with client_id, redirect, scopes, state', () => {
    const url = new URL(
      buildOsuAuthorizeUrl({
        clientId: '12345',
        redirectUri: 'https://app.example.com/auth/osu/callback',
        state: 'state-value-123',
      }),
    )
    expect(`${url.origin}${url.pathname}`).toBe('https://osu.ppy.sh/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('12345')
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example.com/auth/osu/callback')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('identify public')
    expect(url.searchParams.get('state')).toBe('state-value-123')
  })
})

describe('exchangeAuthorizationCode', () => {
  it('posts the authorization_code grant and returns the tokens', async () => {
    const seen: Array<{ url: string; body: string }> = []
    const fetchFn = fakeFetch(async (url, init) => {
      seen.push({ url, body: String(init?.body ?? '') })
      return tokenResponse({
        access_token: 'at-1',
        refresh_token: 'rt-1',
        expires_in: 86400,
        token_type: 'Bearer',
      })
    })
    const grant = await exchangeAuthorizationCode(
      { fetchFn, env: { clientId: 'cid', clientSecret: 'csecret' } },
      { code: 'auth-code', redirectUri: 'https://app.example.com/auth/osu/callback' },
    )
    expect(grant).toEqual({ accessToken: 'at-1', refreshToken: 'rt-1', expiresIn: 86400 })
    expect(seen).toHaveLength(1)
    expect(seen[0].url).toBe('https://osu.ppy.sh/oauth/token')
    const form = new URLSearchParams(seen[0].body)
    expect(form.get('grant_type')).toBe('authorization_code')
    expect(form.get('code')).toBe('auth-code')
    expect(form.get('redirect_uri')).toBe('https://app.example.com/auth/osu/callback')
    expect(form.get('client_id')).toBe('cid')
  })

  it('maps a redirect_uri rejection to osu_redirect_uri_mismatch', async () => {
    const fetchFn = fakeFetch(async () =>
      tokenResponse(
        {
          error: 'invalid_request',
          error_description: 'The redirect_uri parameter does not match.',
        },
        400,
      ),
    )
    await expect(
      exchangeAuthorizationCode(
        { fetchFn, env: { clientId: 'cid', clientSecret: 'csecret' } },
        { code: 'bad', redirectUri: 'https://app.example.com/auth/osu/callback' },
      ),
    ).rejects.toMatchObject({ code: 'osu_redirect_uri_mismatch', status: 400 })
  })

  it('maps other token-endpoint failures to osu_exchange_failed', async () => {
    const fetchFn = fakeFetch(async () =>
      tokenResponse({ error: 'invalid_grant', error_description: 'The code is invalid.' }, 400),
    )
    await expect(
      exchangeAuthorizationCode(
        { fetchFn, env: { clientId: 'cid', clientSecret: 'csecret' } },
        { code: 'used-code', redirectUri: 'https://app.example.com/auth/osu/callback' },
      ),
    ).rejects.toMatchObject({ code: 'osu_exchange_failed', status: 502 })
  })

  it('rejects a token response without access/refresh tokens', async () => {
    const fetchFn = fakeFetch(async () => tokenResponse({ access_token: 'only-one' }))
    await expect(
      exchangeAuthorizationCode(
        { fetchFn, env: { clientId: 'cid', clientSecret: 'csecret' } },
        { code: 'x', redirectUri: 'https://app.example.com/auth/osu/callback' },
      ),
    ).rejects.toMatchObject({ code: 'osu_exchange_failed' })
  })
})

describe('refreshAccessToken', () => {
  it('posts the refresh_token grant', async () => {
    const fetchFn = fakeFetch(async (_url, init) => {
      const form = new URLSearchParams(String(init?.body ?? ''))
      expect(form.get('grant_type')).toBe('refresh_token')
      expect(form.get('refresh_token')).toBe('rt-old')
      return tokenResponse({ access_token: 'at-2', refresh_token: 'rt-2', expires_in: 1000 })
    })
    await expect(
      refreshAccessToken(
        { fetchFn, env: { clientId: 'cid', clientSecret: 'csecret' } },
        { refreshToken: 'rt-old' },
      ),
    ).resolves.toEqual({ accessToken: 'at-2', refreshToken: 'rt-2', expiresIn: 1000 })
  })

  it('maps a rejected refresh to osu_auth_expired', async () => {
    const fetchFn = fakeFetch(async () =>
      tokenResponse({ error: 'invalid_grant', error_description: 'Refresh token expired.' }, 400),
    )
    await expect(
      refreshAccessToken(
        { fetchFn, env: { clientId: 'cid', clientSecret: 'csecret' } },
        { refreshToken: 'rt-dead' },
      ),
    ).rejects.toMatchObject({ code: OSU_AUTH_EXPIRED_CODE, status: 401 })
  })
})

describe('fetchOsuMe', () => {
  it('returns id + username on 200', async () => {
    const fetchFn = fakeFetch(async () =>
      tokenResponse({ id: 456, username: 'peppy', country_code: 'AU' }),
    )
    await expect(fetchOsuMe(fetchFn, 'at-1')).resolves.toEqual({ id: 456, username: 'peppy' })
  })

  it('returns null on non-OK, bad shape, or network failure', async () => {
    const notOk = fakeFetch(async () => tokenResponse({ error: 'x' }, 401))
    await expect(fetchOsuMe(notOk, 'at-1')).resolves.toBeNull()
    const badShape = fakeFetch(async () => tokenResponse({ id: 'nope' }))
    await expect(fetchOsuMe(badShape, 'at-1')).resolves.toBeNull()
    const throwing = fakeFetch(async () => {
      throw new Error('down')
    })
    await expect(fetchOsuMe(throwing, 'at-1')).resolves.toBeNull()
  })
})

describe('getValidAccessToken', () => {
  const env = { clientId: 'cid', clientSecret: 'csecret', encryptionKeyB64: KEY_A }

  it('throws osu_auth_expired when no row exists (and deletes nothing)', async () => {
    const { store, removed } = memoryStore(null)
    const fetchFn = fakeFetch(async () => tokenResponse({}))
    await expect(
      getValidAccessToken({ store, fetchFn, env, userId: 'user-1' }),
    ).rejects.toMatchObject({ code: OSU_AUTH_EXPIRED_CODE, status: 401 })
    expect(removed).toEqual([])
  })

  it('returns the stored token untouched when fresh (no network, no write)', async () => {
    const row = await encRow()
    const { store, upserts } = memoryStore(row)
    const fetchFn = fakeFetch(async () => {
      throw new Error('must not be called')
    })
    const out = await getValidAccessToken({ store, fetchFn, env, userId: 'user-1' })
    expect(out).toEqual({ accessToken: 'access-1', osuUserId: 123 })
    expect(upserts).toEqual([])
  })

  it('refreshes an expired token, re-encrypts, and updates the row', async () => {
    const row = await encRow({ expires_at: new Date(Date.now() - 1000).toISOString() })
    const { store, rows, upserts } = memoryStore(row)
    const fetchFn = fakeFetch(async () =>
      tokenResponse({ access_token: 'at-new', refresh_token: 'rt-new', expires_in: 7200 }),
    )
    const out = await getValidAccessToken({ store, fetchFn, env, userId: 'user-1' })
    expect(out).toEqual({ accessToken: 'at-new', osuUserId: 123 })
    expect(upserts).toHaveLength(1)
    const saved = rows.get('user-1')!
    await expect(decryptToken(saved.access_token_enc, KEY_A)).resolves.toBe('at-new')
    await expect(decryptToken(saved.refresh_token_enc, KEY_A)).resolves.toBe('rt-new')
    expect(Date.parse(saved.expires_at)).toBeGreaterThan(Date.now() + 7000_000)
  })

  it('treats a token inside the 60s leeway as expired', async () => {
    const row = await encRow({ expires_at: new Date(Date.now() + 30_000).toISOString() })
    const { store } = memoryStore(row)
    const fetchFn = fakeFetch(async () =>
      tokenResponse({ access_token: 'at-new', refresh_token: 'rt-new', expires_in: 7200 }),
    )
    const out = await getValidAccessToken({ store, fetchFn, env, userId: 'user-1' })
    expect(out.accessToken).toBe('at-new')
  })

  it('deletes the row and throws osu_auth_expired when refresh fails', async () => {
    const row = await encRow({ expires_at: new Date(Date.now() - 1000).toISOString() })
    const { store, rows, removed, upserts } = memoryStore(row)
    const fetchFn = fakeFetch(async () =>
      tokenResponse({ error: 'invalid_grant' }, 400),
    )
    await expect(
      getValidAccessToken({ store, fetchFn, env, userId: 'user-1' }),
    ).rejects.toMatchObject({ code: OSU_AUTH_EXPIRED_CODE, status: 401 })
    expect(removed).toEqual(['user-1'])
    expect(rows.has('user-1')).toBe(false)
    expect(upserts).toEqual([])
  })

  it('deletes the row and throws osu_auth_expired on undecryptable stored tokens', async () => {
    const row = await encRow({ access_token_enc: 'garbage-not-encrypted' })
    const { store, removed } = memoryStore(row)
    const fetchFn = fakeFetch(async () => {
      throw new Error('must not be called')
    })
    await expect(
      getValidAccessToken({ store, fetchFn, env, userId: 'user-1' }),
    ).rejects.toMatchObject({ code: OSU_AUTH_EXPIRED_CODE, status: 401 })
    expect(removed).toEqual(['user-1'])
  })

  it('leaves the row alone and surfaces osu_config_missing when the key is misconfigured', async () => {
    const row = await encRow()
    const { store, removed } = memoryStore(row)
    const badEnv = {
      ...env,
      encryptionKeyB64: btoa(String.fromCharCode(...new Uint8Array(16))),
    }
    const fetchFn = fakeFetch(async () => tokenResponse({}))
    await expect(
      getValidAccessToken({ store, fetchFn, env: badEnv, userId: 'user-1' }),
    ).rejects.toMatchObject({ code: OSU_CONFIG_MISSING_CODE, status: 500 })
    expect(removed).toEqual([])
  })
})

describe('isTokenExpired', () => {
  it('applies the 60s leeway', () => {
    const now = 1_000_000
    expect(isTokenExpired(now + 61_000, now)).toBe(false)
    expect(isTokenExpired(now + 60_000, now)).toBe(true)
    expect(isTokenExpired(now - 1, now)).toBe(true)
  })
})

describe('officialDownloadUrl', () => {
  it('builds the plain and no-video URLs', () => {
    expect(officialDownloadUrl(1, false)).toBe('https://osu.ppy.sh/beatmapsets/1/download')
    expect(officialDownloadUrl(1, true)).toBe('https://osu.ppy.sh/beatmapsets/1/download?noVideo=1')
  })
})

describe('probe verdict + header-only probe', () => {
  it('passes only 200 + archive content-type + attachment disposition', () => {
    expect(
      probeVerdict(200, {
        contentType: 'application/octet-stream',
        contentDisposition: 'attachment; filename="1.osz"',
      }),
    ).toBe(true)
    expect(
      probeVerdict(200, {
        contentType: 'application/zip',
        contentDisposition: 'attachment; filename="1.osz"',
      }),
    ).toBe(true)
    expect(
      probeVerdict(200, { contentType: 'application/octet-stream', contentDisposition: null }),
    ).toBe(false)
    expect(
      probeVerdict(200, {
        contentType: 'text/html; charset=utf-8',
        contentDisposition: 'attachment; filename="1.osz"',
      }),
    ).toBe(false)
    expect(
      probeVerdict(302, {
        contentType: 'text/html',
        contentDisposition: null,
      }),
    ).toBe(false)
    expect(probeVerdict(401, { contentType: null, contentDisposition: null })).toBe(false)
  })

  it('reads only status + headers and cancels the body without consuming it', async () => {
    const cancel = vi.fn(async () => {})
    const fakeRes = {
      status: 200,
      headers: new Headers({
        'content-type': 'application/octet-stream',
        'content-length': '123456',
        'content-disposition': 'attachment; filename="1.osz"',
      }),
      body: { cancel },
    } as unknown as Response
    const fetchFn = fakeFetch(async () => fakeRes)
    const out = await probeDownloadVariant({
      fetchFn,
      url: officialDownloadUrl(DEFAULT_PROBE_BEATMAPSET_ID, false),
      accessToken: 'at-1',
    })
    expect(out).toEqual({
      status: 200,
      contentType: 'application/octet-stream',
      contentLength: '123456',
      contentDisposition: 'attachment; filename="1.osz"',
      pass: true,
    })
    // The body must never be consumed in Phase A — cancel, not read.
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('reports a login-page response as FAIL and still cancels the body', async () => {
    const cancel = vi.fn(async () => {})
    const fakeRes = {
      status: 200,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      body: { cancel },
    } as unknown as Response
    const fetchFn = fakeFetch(async () => fakeRes)
    const out = await probeDownloadVariant({
      fetchFn,
      url: officialDownloadUrl(1, false),
      accessToken: 'at-1',
    })
    expect(out.pass).toBe(false)
    expect(out.contentType).toBe('text/html; charset=utf-8')
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('sends the user Bearer token (never the guest app token)', async () => {
    const seen: Array<Record<string, string>> = []
    const fetchFn = fakeFetch(async (_url, init) => {
      seen.push({ ...(init?.headers as Record<string, string>) })
      return new Response(null, { status: 403, headers: { 'content-type': 'text/html' } })
    })
    await probeDownloadVariant({
      fetchFn,
      url: officialDownloadUrl(1, true),
      accessToken: 'user-token-abc',
    })
    expect(seen[0].Authorization).toBe('Bearer user-token-abc')
  })

  it('throws a typed error (not a probe result) when the network fails', async () => {
    const fetchFn = fakeFetch(async () => {
      throw new Error('socket hangup')
    })
    await expect(
      probeDownloadVariant({ fetchFn, url: officialDownloadUrl(1, false), accessToken: 'x' }),
    ).rejects.toBeInstanceOf(Error)
  })
})

describe('OsuAuthError', () => {
  it('carries code + status', () => {
    const err = new OsuAuthError('osu_auth_expired', 'expired', 401)
    expect(err.code).toBe('osu_auth_expired')
    expect(err.status).toBe(401)
    expect(err.message).toBe('expired')
  })
})
