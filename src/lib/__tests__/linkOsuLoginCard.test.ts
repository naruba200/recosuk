/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * §AX — the onboarding link screen's Option B card is the login
 * card (user decision 2026-11-14): a returning user who already
 * has a RecOsuk account sees "Already have an account?" + a
 * Login button that opens the Sign in tab directly, instead of
 * the old "Instant play" guest card. The guest-link entry point
 * is gone from this screen — "Continue without linking" below
 * still skips to Beatmaps with no profile at all (it is NOT the
 * guest path, so it is kept, not replaced).
 *
 * LinkOsu is a hook-using component, so the card is audited as
 * source (same pattern as downloadPrimaryViews.test.ts).
 */

const linkOsu = readFileSync(
  fileURLToPath(new URL('../../screens/LinkOsu.tsx', import.meta.url)),
  'utf8',
)

/** The Option B card: from its comment to the bypass-link comment. */
function optionBCard(src: string): string {
  const start = src.indexOf('{/* Option B:')
  expect(start, 'no Option B card in LinkOsu.tsx').toBeGreaterThan(-1)
  const end = src.indexOf('{/* Quiet Bypass Link */}', start)
  expect(end, 'no bypass link after Option B in LinkOsu.tsx').toBeGreaterThan(
    start,
  )
  return src.slice(start, end)
}

describe('onboarding link screen login card (§AX)', () => {
  it('Option B is the login card: "Already have an account?" + sign-in copy', () => {
    const card = optionBCard(linkOsu)
    expect(card).toContain('Already have an account?')
    expect(card).toContain(
      'Sign in to your RecOsuk account to pick up your saved maps, lists, and ratings.',
    )
  })

  it('the Login button opens the Sign in tab directly, with the login icon', () => {
    const card = optionBCard(linkOsu)
    expect(card).toContain("navigate('/auth?mode=signin')")
    expect(card).toContain('>login')
    expect(card).toContain('>Login')
  })

  it('"Continue as guest" and handleGuest are gone from LinkOsu.tsx', () => {
    expect(linkOsu).not.toContain('Continue as guest')
    expect(linkOsu).not.toContain('Instant play')
    expect(linkOsu).not.toContain('handleGuest')
    expect(linkOsu).not.toContain('linkGuest')
    expect(linkOsu).not.toContain('useGuestStore')
    expect(linkOsu).not.toContain('>visibility')
  })

  it('Option A and the bypass link are unchanged — out of scope', () => {
    expect(linkOsu).toContain('Create account')
    expect(linkOsu).toContain("navigate('/auth')")
    expect(linkOsu).toContain('Continue without linking')
    expect(linkOsu).toContain('handleWithoutLinking')
  })
})
