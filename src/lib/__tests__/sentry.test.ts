// Batch AP item 3a tests: Sentry stays completely dormant without
// a DSN, and initialises exactly once with one when set. The SDK
// itself is mocked — no network, no real DSN.
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({ name: 'browserTracing' })),
}))

async function loadSentry() {
  vi.resetModules()
  const mod = await import('../sentry')
  const sentry = await import('@sentry/react')
  return { mod, sentry: sentry as unknown as { init: ReturnType<typeof vi.fn> } }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('sentry (batch AP item 3a)', () => {
  it('stays dormant with no DSN — Sentry.init is never called', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '')
    const { mod, sentry } = await loadSentry()
    mod.initSentry()
    expect(sentry.init).not.toHaveBeenCalled()
    expect(mod.isSentryEnabled()).toBe(false)
  })

  it('initialises once with a DSN, with a 10% trace sample rate', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://public@o0.ingest.sentry.io/123')
    const { mod, sentry } = await loadSentry()
    mod.initSentry()
    mod.initSentry()
    expect(sentry.init).toHaveBeenCalledTimes(1)
    const opts = (sentry.init as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as {
      dsn: string
      tracesSampleRate: number
      environment: string
    }
    expect(opts.dsn).toBe('https://public@o0.ingest.sentry.io/123')
    expect(opts.tracesSampleRate).toBe(0.1)
    expect(typeof opts.environment).toBe('string')
    expect(mod.isSentryEnabled()).toBe(true)
  })
})
