// Phase A client tests: callback parsing, state validation, and the
// proxy-call shapes for status / exchange / disconnect / probe.
// Browser globals (location, sessionStorage) are stubbed per test;
// no real network, no real Supabase.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OsuServiceError } from '../osu'
import {
  OSU_AUTH_STATE_KEY,
  beginOsuSignIn,
  disconnectOsu,
  exchangeOsuCode,
  getOsuAuthStatus,
  getOsuRedirectUri,
  isCallbackStateValid,
  isOsuAuthExpiredError,
  newOsuAuthState,
  osuCallbackUri,
  parseOsuCallback,
  probeOsuDownload,
  type ProxyCaller,
} from '../osuAuth'

function stubBrowser(origin: string) {
  const store = new Map<string, string>()
  const sessionStorageStub = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v))
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size
    },
  }
  const assign = vi.fn()
  vi.stubGlobal('sessionStorage', sessionStorageStub)
  vi.stubGlobal('location', { origin, assign })
  return { store, sessionStorageStub, assign }
}

/**
 * A mock proxy caller. `Mock<ProxyCaller>` is not assignable to the
 * generic `ProxyCaller` type, so tests assert on `mock` and pass `call`.
 */
function mockProxyCaller() {
  const mock = vi.fn<ProxyCaller>()
  const call = mock as unknown as ProxyCaller
  return { mock, call }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('osuCallbackUri / getOsuRedirectUri', () => {
  it('appends the callback path and strips a trailing slash', () => {
    expect(osuCallbackUri('https://app.example.com')).toBe(
      'https://app.example.com/auth/osu/callback',
    )
    expect(osuCallbackUri('https://app.example.com/')).toBe(
      'https://app.example.com/auth/osu/callback',
    )
    expect(osuCallbackUri('http://localhost:5173')).toBe(
      'http://localhost:5173/auth/osu/callback',
    )
  })

  it('derives the redirect URI from the current origin', () => {
    stubBrowser('https://recosuk.vercel.app')
    expect(getOsuRedirectUri()).toBe('https://recosuk.vercel.app/auth/osu/callback')
  })
})

describe('newOsuAuthState', () => {
  it('is 64 hex chars and unique per call', () => {
    const a = newOsuAuthState()
    const b = newOsuAuthState()
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(b).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
  })
})

describe('parseOsuCallback', () => {
  it('parses code + state', () => {
    expect(parseOsuCallback('?code=abc123&state=deadbeef')).toEqual({
      code: 'abc123',
      state: 'deadbeef',
      error: null,
      errorDescription: null,
    })
    expect(parseOsuCallback('code=abc123&state=deadbeef')).toEqual({
      code: 'abc123',
      state: 'deadbeef',
      error: null,
      errorDescription: null,
    })
  })

  it('parses a denied-access redirect', () => {
    expect(
      parseOsuCallback('?error=access_denied&error_description=The+user+denied'),
    ).toEqual({
      code: null,
      state: null,
      error: 'access_denied',
      errorDescription: 'The user denied',
    })
  })

  it('returns nulls for an empty query', () => {
    expect(parseOsuCallback('')).toEqual({
      code: null,
      state: null,
      error: null,
      errorDescription: null,
    })
  })
})

describe('isCallbackStateValid', () => {
  it('accepts only an exact, non-empty match', () => {
    expect(isCallbackStateValid('abc', 'abc')).toBe(true)
    expect(isCallbackStateValid('abc', 'abd')).toBe(false)
    expect(isCallbackStateValid('abc', null)).toBe(false)
    expect(isCallbackStateValid(null, 'abc')).toBe(false)
    expect(isCallbackStateValid('', '')).toBe(false)
    expect(isCallbackStateValid('ABC', 'abc')).toBe(false)
  })
})

describe('exchangeOsuCode', () => {
  it('refuses to call the server on a state mismatch (no exchange, no token stored)', async () => {
    stubBrowser('https://app.example.com')
    const { mock, call } = mockProxyCaller()
    await expect(exchangeOsuCode('code-1', 'returned-state', 'different-stored-state', call)).rejects.toThrow(
      /Security check failed/,
    )
    expect(mock).not.toHaveBeenCalled()
  })

  it('refuses when the stored state is missing (expired session)', async () => {
    stubBrowser('https://app.example.com')
    const { mock, call } = mockProxyCaller()
    await expect(exchangeOsuCode('code-1', 'returned-state', null, call)).rejects.toThrow(
      /Security check failed/,
    )
    expect(mock).not.toHaveBeenCalled()
  })

  it('calls exchangeOsuCode with the code + origin-derived redirect_uri on a match', async () => {
    stubBrowser('https://app.example.com')
    const { mock, call } = mockProxyCaller()
    mock.mockResolvedValue({
      osuUsername: 'sora_playz',
      osuUserId: 123,
      expiresAt: '2030-01-01T00:00:00.000Z',
    })
    const result = await exchangeOsuCode('code-1', 'state-9', 'state-9', call)
    expect(result.osuUsername).toBe('sora_playz')
    expect(mock).toHaveBeenCalledTimes(1)
    expect(mock).toHaveBeenCalledWith('exchangeOsuCode', {
      code: 'code-1',
      redirectUri: 'https://app.example.com/auth/osu/callback',
    })
    // The response must never carry a token value.
    expect(JSON.stringify(result)).not.toMatch(/token/i)
  })
})

describe('beginOsuSignIn', () => {
  it('fetches the authorize URL, stores state, then navigates', async () => {
    const { store, assign } = stubBrowser('https://app.example.com')
    const { mock, call } = mockProxyCaller()
    mock.mockResolvedValue({
      authorizeUrl: 'https://osu.ppy.sh/oauth/authorize?client_id=1',
    })
    await beginOsuSignIn(call)
    expect(mock).toHaveBeenCalledTimes(1)
    const [action, params] = mock.mock.calls[0]
    expect(action).toBe('getOsuAuthorizeUrl')
    expect(params?.redirectUri).toBe('https://app.example.com/auth/osu/callback')
    expect(params?.state).toMatch(/^[0-9a-f]{64}$/)
    expect(store.get(OSU_AUTH_STATE_KEY)).toBe(params?.state)
    expect(assign).toHaveBeenCalledTimes(1)
    expect(assign).toHaveBeenCalledWith('https://osu.ppy.sh/oauth/authorize?client_id=1')
  })

  it('stores no state and navigates nowhere when the server call fails', async () => {
    const { store, assign } = stubBrowser('https://app.example.com')
    const { mock, call } = mockProxyCaller()
    mock.mockRejectedValue(new OsuServiceError('upstream', 'proxy down'))
    await expect(beginOsuSignIn(call)).rejects.toThrow('proxy down')
    expect(store.has(OSU_AUTH_STATE_KEY)).toBe(false)
    expect(assign).not.toHaveBeenCalled()
  })
})

describe('status / disconnect / probe calls', () => {
  it('getOsuAuthStatus passes the action through and returns the shape', async () => {
    const { mock, call } = mockProxyCaller()
    mock.mockResolvedValue({
      connected: true,
      osuUsername: 'sora_playz',
      osuUserId: 123,
      expiresAt: '2030-01-01T00:00:00.000Z',
      expired: false,
    })
    const status = await getOsuAuthStatus(call)
    expect(mock).toHaveBeenCalledWith('osuAuthStatus', {})
    expect(status.connected).toBe(true)
    expect(status.osuUsername).toBe('sora_playz')
  })

  it('disconnectOsu calls the disconnect action with no params', async () => {
    const { mock, call } = mockProxyCaller()
    mock.mockResolvedValue({ ok: true })
    await disconnectOsu(call)
    expect(mock).toHaveBeenCalledWith('disconnectOsu', {})
  })

  it('probeOsuDownload sends the beatmapset id and returns headers only', async () => {
    const { mock, call } = mockProxyCaller()
    mock.mockResolvedValue({
      ok: true,
      beatmapsetId: 1,
      status: 200,
      contentType: 'application/octet-stream',
      contentLength: '123456',
      contentDisposition: 'attachment; filename="1.osz"',
      pass: true,
      noVideoVariant: {
        status: 200,
        contentType: 'application/octet-stream',
        contentLength: '123450',
        contentDisposition: 'attachment; filename="1.osz"',
        pass: true,
      },
    })
    const result = await probeOsuDownload(1, call)
    expect(mock).toHaveBeenCalledWith('probeOsuDownload', { beatmapsetId: 1 })
    expect(result.pass).toBe(true)
    expect(JSON.stringify(result)).not.toMatch(/token/i)
  })
})

describe('isOsuAuthExpiredError', () => {
  it('is true only for the osu_auth_expired code', () => {
    expect(
      isOsuAuthExpiredError(new OsuServiceError('upstream', 'expired', 401, 'osu_auth_expired')),
    ).toBe(true)
    expect(
      isOsuAuthExpiredError(new OsuServiceError('upstream', 'other', 401, 'osu_auth_required')),
    ).toBe(false)
    expect(isOsuAuthExpiredError(new OsuServiceError('upstream', 'plain'))).toBe(false)
    expect(isOsuAuthExpiredError(new Error('osu_auth_expired'))).toBe(false)
    expect(isOsuAuthExpiredError(null)).toBe(false)
  })
})
