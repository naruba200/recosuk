import { describe, expect, it, vi } from 'vitest'
import {
  OsuServiceError,
  createOsuClient,
  validateOsuUsername,
  type FetchFn,
} from '../osu'

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

const CONFIG = { supabaseUrl: 'https://example.supabase.co', anonKey: 'anon-key' }

describe('osu client — not configured', () => {
  const client = createOsuClient({ supabaseUrl: null, anonKey: null })

  it('reports isConfigured = false', () => {
    expect(client.isConfigured).toBe(false)
  })

  it('getOsuUser returns a not-configured error instead of throwing', async () => {
    const result = await client.getOsuUser('sora_playz', 'osu')
    expect(result.data).toBeNull()
    expect(result.error?.kind).toBe('not-configured')
  })

  it('proxyCall rejects with a not-configured OsuServiceError', async () => {
    await expect(client.proxyCall('getUser', { mode: 'osu' })).rejects.toMatchObject({
      kind: 'not-configured',
    })
    await expect(client.proxyCall('getUser', { mode: 'osu' })).rejects.toBeInstanceOf(
      OsuServiceError,
    )
  })
})

describe('osu client — response mapping (mocked fetch)', () => {
  it('maps a 200 {data} payload to a user result and sends action+mode', async () => {
    const fetchFn = vi.fn<FetchFn>(async () =>
      jsonResponse(200, {
        data: { id: 123, username: 'sora_playz', playmode: 'mania' },
      }),
    )
    const client = createOsuClient({ ...CONFIG, fetchFn })
    const result = await client.getOsuUser('sora_playz', 'mania')

    expect(result.error).toBeNull()
    expect(result.data?.id).toBe(123)
    expect(result.data?.playmode).toBe('mania')

    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://example.supabase.co/functions/v1/osu-proxy')
    expect(init?.method).toBe('POST')
    const sent = JSON.parse(String(init?.body)) as { action: string; mode: string }
    expect(sent.action).toBe('getUser')
    expect(sent.mode).toBe('mania')
    const headers = (init?.headers ?? {}) as Record<string, string>
    expect(headers.apikey).toBe('anon-key')
    expect(headers.Authorization).toBe('Bearer anon-key')
  })

  it('prefers the session token over the anon key when provided', async () => {
    const fetchFn = vi.fn<FetchFn>(async () =>
      jsonResponse(200, { data: { id: 1, username: 'x', playmode: 'osu' } }),
    )
    const client = createOsuClient({
      ...CONFIG,
      fetchFn,
      getAuthToken: async () => 'user-jwt',
    })
    await client.getOsuUser('x', 'osu')
    const headers = (fetchFn.mock.calls[0][1]?.headers ?? {}) as Record<string, string>
    expect(headers.Authorization).toBe('Bearer user-jwt')
  })

  it('maps a proxy 404 payload to not-found', async () => {
    const fetchFn: FetchFn = async () =>
      jsonResponse(404, { error: 'Not found on osu!', status: 404 })
    const client = createOsuClient({ ...CONFIG, fetchFn })
    const result = await client.getOsuUser('no_such_user_xyz', 'osu')
    expect(result.data).toBeNull()
    expect(result.error?.kind).toBe('not-found')
  })

  it('maps a proxy 429/5xx payload to upstream', async () => {
    const fetchFn: FetchFn = async () =>
      jsonResponse(429, { error: 'osu! rate limit reached', status: 429 })
    const client = createOsuClient({ ...CONFIG, fetchFn })
    const result = await client.getOsuUser('sora_playz', 'osu')
    expect(result.error?.kind).toBe('upstream')
    expect(result.error?.status).toBe(429)
  })

  it('maps a network failure to upstream', async () => {
    const fetchFn: FetchFn = async () => {
      throw new Error('socket hangup')
    }
    const client = createOsuClient({ ...CONFIG, fetchFn })
    const result = await client.getOsuUser('sora_playz', 'osu')
    expect(result.error?.kind).toBe('upstream')
  })

  it('maps a 200 with no data to upstream instead of returning undefined downstream', async () => {
    // CRASH FIX (QA batch 2): the old code returned payload?.data
    // unchecked, so an empty 200 became downstream TypeErrors in the
    // Recommendations path. The client must fail loudly here.
    const fetchFn: FetchFn = async () => jsonResponse(200, {})
    const client = createOsuClient({ ...CONFIG, fetchFn })
    const result = await client.getOsuUser('sora_playz', 'osu')
    expect(result.data).toBeNull()
    expect(result.error?.kind).toBe('upstream')
  })

  it('maps a throwing auth-token read to upstream instead of an uncaught rejection', async () => {
    const fetchFn = vi.fn<FetchFn>(async () =>
      jsonResponse(200, { data: { id: 1, username: 'x', playmode: 'osu' } }),
    )
    const client = createOsuClient({
      ...CONFIG,
      fetchFn,
      getAuthToken: async () => {
        throw new Error('session storage corrupt')
      },
    })
    const result = await client.getOsuUser('x', 'osu')
    expect(result.data).toBeNull()
    expect(result.error?.kind).toBe('upstream')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('threads the proxy error code onto the thrown error (auth actions)', async () => {
    // Phase A: osuAuthStatus / probe failures carry a stable `code`
    // (e.g. osu_auth_expired) the UI keys its re-sign-in prompt off.
    const fetchFn: FetchFn = async () =>
      jsonResponse(401, {
        error: 'The osu! connection has expired.',
        status: 401,
        code: 'osu_auth_expired',
      })
    const client = createOsuClient({ ...CONFIG, fetchFn })
    const err = await client
      .proxyCall('osuAuthStatus', {})
      .then(
        () => null,
        (e: unknown) => e,
      )
    expect(err).toBeInstanceOf(OsuServiceError)
    expect((err as OsuServiceError).code).toBe('osu_auth_expired')
    expect((err as OsuServiceError).status).toBe(401)
  })
})

describe('validateOsuUsername (module client, env unset)', () => {
  it('rejects an empty username as not-found without any network call', async () => {
    const result = await validateOsuUsername('   ')
    expect(result.data).toBeNull()
    expect(result.error?.kind).toBe('not-found')
  })

  it('returns not-configured when the proxy env is not set', async () => {
    const result = await validateOsuUsername('sora_playz')
    expect(result.data).toBeNull()
    expect(result.error?.kind).toBe('not-configured')
  })
})
