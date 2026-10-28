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
    expect(resolveRoute('/dashboard', { ...NONE, isGuest: true })).toBeNull()
    expect(resolveRoute('/mirror', { ...NONE, isGuest: true })).toBeNull()
  })

  it('allows a signed-in account on protected routes', () => {
    expect(resolveRoute('/stats', { ...NONE, isAccount: true })).toBeNull()
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
    expect(resolveRoute('/dashboard/', NONE)).toBe('/onboarding')
    expect(resolveRoute('/stats?mode=mania', NONE)).toBe('/onboarding')
  })
})
