/**
 * Route guard (pure helper, unit-tested): the app-shell routes require
 * SOME session — a signed-in account, a guest link, or a completed
 * onboarding (the `recosuk-onboarded` flag). A completely fresh visitor
 * hitting one directly is sent to /onboarding instead of seeing a
 * shell full of someone else's sample data.
 *
 * /auth and /onboarding/* are public; / is owned by the EntryGate in
 * App.tsx and is never redirected by this helper.
 */
export const PROTECTED_PATHS = [
  '/dashboard',
  '/stats',
  '/recommendations',
  '/mirror',
  '/lists',
  '/history',
  '/settings',
] as const

export interface SessionPresence {
  isAccount: boolean
  isGuest: boolean
  onboarded: boolean
}

function basePath(path: string): string {
  const withoutQuery = path.split('?')[0].split('#')[0]
  const trimmed = withoutQuery.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

/** Returns the redirect target, or null when the route may render. */
export function resolveRoute(path: string, presence: SessionPresence): string | null {
  const base = basePath(path)
  if (!(PROTECTED_PATHS as readonly string[]).includes(base)) return null
  if (presence.isAccount || presence.isGuest || presence.onboarded) return null
  return '/onboarding'
}

/** Reads the onboarding flag from storage (false when unavailable). */
export function readOnboardedFlag(): boolean {
  try {
    return globalThis.localStorage?.getItem('recosuk-onboarded') === '1'
  } catch {
    return false
  }
}
