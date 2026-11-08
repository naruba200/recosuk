import { describe, expect, it } from 'vitest'
import { resolveRoute, PROTECTED_PATHS } from '../routeGuard'

const NONE = { isAccount: false, isGuest: false, onboarded: false }

describe('resolveRoute', () => {
  it('redirects a fresh visitor from every protected route to /onboarding', () => {
    for (const path of PROTECTED_PATHS) {
      expect(resolveRoute(path, NONE)).toBe('/onboarding')
    }
  })

  it('allows a guest session on protected routes', () => {
    expect(resolveRoute('/profile', { ...NONE, isGuest: true })).toBeNull()
    expect(resolveRoute('/beatmaps', { ...NONE, isGuest: true })).toBeNull()
  })

  it('allows a signed-in account on protected routes', () => {
    expect(resolveRoute('/profile', { ...NONE, isAccount: true })).toBeNull()
    expect(resolveRoute('/settings', { ...NONE, isAccount: true })).toBeNull()
  })

  it('allows the onboarded flag alone on protected routes', () => {
    expect(resolveRoute('/lists', { ...NONE, onboarded: true })).toBeNull()
    expect(resolveRoute('/history', { ...NONE, onboarded: true })).toBeNull()
  })

  it('never redirects public routes, even for a fresh visitor', () => {
    expect(resolveRoute('/auth', NONE)).toBeNull()
    expect(resolveRoute('/auth?mode=signin', NONE)).toBeNull()
    expect(resolveRoute('/onboarding', NONE)).toBeNull()
    expect(resolveRoute('/onboarding/link', NONE)).toBeNull()
    expect(resolveRoute('/welcome-recs', NONE)).toBeNull()
    expect(resolveRoute('/', NONE)).toBeNull()
  })

  it('ignores trailing slashes and query strings when matching', () => {
    expect(resolveRoute('/profile/', NONE)).toBe('/onboarding')
    expect(resolveRoute('/beatmaps?mode=mania', NONE)).toBe('/onboarding')
  })

  it('old routes redirect, so they are no longer protected paths (§AN)', () => {
    // /dashboard, /stats and /mirror are plain redirects in
    // App.tsx now — the guard never sees them.
    expect(resolveRoute('/dashboard', NONE)).toBeNull()
    expect(resolveRoute('/stats', NONE)).toBeNull()
    expect(resolveRoute('/mirror', NONE)).toBeNull()
  })

  it('guards the ranked detail page under /collections/ (§AN)', () => {
    expect(resolveRoute('/collections/ranked/mania/month/2026-11-w1', NONE)).toBe('/onboarding')
    expect(
      resolveRoute('/collections/ranked/mania/month/2026-11-w1', { ...NONE, isGuest: true }),
    ).toBeNull()
    expect(
      resolveRoute('/collections/ranked/fruits/year/2026-03', { ...NONE, onboarded: true }),
    ).toBeNull()
    // A lookalike path that merely starts with the same letters
    // is NOT under /collections/.
    expect(resolveRoute('/collectionsx/ranked', NONE)).toBeNull()
  })
})
