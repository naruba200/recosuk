import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../auth'
import AppShell, { type ShellIdentity } from '../../components/AppShell'

/**
 * §AO/§AQ — the profile menu, the header nav, and the mode rail.
 * The menu's pinned state is owned by AppShell; `initialMenuPinned`
 * renders it pinned on first paint so the static render can assert
 * the dropdown markup. Interaction itself (hover staying open
 * across the bridge, rail sliding in on the edge zone) is live-only.
 *
 * §AQ item 4: the press dim is REMOVED — pinned-open behaves like
 * hover-open (no overlay, header stays at its normal layer).
 * §AQ item 12: the nav lives in the header (no Profile tab), the
 * sidebar holds only the mode pills (hidden by default), and the
 * menu holds the ONLY Log out in the shell.
 */

const IDENTITY: ShellIdentity = {
  username: 'test_user',
  pp: 1234,
  countryCode: 'VN',
  tierLabel: 'account',
}

function renderShell(initialMenuPinned = false): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <AuthProvider>
        <AppShell identity={IDENTITY} initialMenuPinned={initialMenuPinned}>
          <div>page content</div>
        </AppShell>
      </AuthProvider>
    </MemoryRouter>
  )
}

function classOf(html: string, tag: string, mustContain: string): string | null {
  const matches = [...html.matchAll(new RegExp(`<${tag}[^>]*class="([^"]*)"`, 'g'))]
    .map((m) => m[1])
    .filter((cls) => cls.split(' ').includes(mustContain))
  return matches.length > 0 ? matches[0] : null
}

describe('profile menu (§AO, §AQ item 4)', () => {
  it('is closed by default: no menu, no dim overlay', () => {
    const html = renderShell()
    expect(html).not.toContain('role="menu"')
    expect(html).not.toContain('bg-black/50')
    // Header sits at its normal layer when nothing is pinned.
    expect(classOf(html, 'header', 'z-40')).not.toBeNull()
  })

  it('pinned-open: the menu renders in a pt-2 bridge wrapper, not an mt-2 gap', () => {
    const html = renderShell(true)
    expect(html).toContain('role="menu"')
    // The dropdown wrapper carries the spacing INSIDE the hover
    // root (pt-2), so the pointer never crosses dead air.
    const wrapper = classOf(html, 'div', 'pt-2')
    expect(wrapper).not.toBeNull()
    expect(wrapper).toContain('absolute')
    expect(wrapper).toContain('top-full')
    // No mt-2 gap anywhere on the menu path (the old hover bug).
    expect(html).not.toContain('mt-2')
  })

  it('pinned-open: NO dim overlay — the press dim is removed (§AQ item 4)', () => {
    const html = renderShell(true)
    expect(html).toContain('role="menu"')
    expect(html).not.toContain('bg-black/50')
    // The header does NOT rise above anything any more: it stays
    // at its normal layer when pinned, like when hover-open.
    expect(classOf(html, 'header', 'z-40')).not.toBeNull()
    expect(classOf(html, 'header', 'z-[60]')).toBeNull()
  })
})

describe('sidebar profile card + logo (§AO)', () => {
  it('has no sidebar identity card: no pp, no country flag', () => {
    const html = renderShell()
    // The old card showed the formatted pp ("1,234") and the
    // country badge ("VN"). The header menu shows neither.
    expect(html).not.toContain('1,234')
    expect(html).not.toContain('>VN<')
  })

  it('the logo links to Beatmaps, the default page after login', () => {
    const html = renderShell()
    expect(html).toContain('href="/beatmaps"')
    expect(html).toContain('Go to Beatmaps')
  })
})

describe('header nav + mode rail (§AQ items 3+12)', () => {
  it('the header holds all five nav links and no Profile tab', () => {
    const html = renderShell()
    for (const path of ['recommendations', 'beatmaps', 'collections', 'lists', 'history']) {
      expect(html).toContain(`href="/${path}"`)
    }
    // Profile is reachable only via the hamburger menu — never a
    // nav link (the menu items are buttons, not links).
    expect(html).not.toContain('href="/profile"')
  })

  it('the menu holds the ONLY Log out / Sign in in the shell', () => {
    // Closed: no auth button anywhere (the header and sidebar
    // auth controls are removed).
    const closed = renderShell()
    expect(closed.match(/Log out|Sign in/g) ?? []).toHaveLength(0)
    // Pinned-open: exactly one — the menu item.
    const pinned = renderShell(true)
    expect(pinned.match(/Log out|Sign in/g) ?? []).toHaveLength(1)
  })

  it('the mode rail is hidden by default and holds the four mode pills', () => {
    const html = renderShell()
    expect(html).toContain('aria-label="Mode"')
    // Hidden = translated off-screen to the left.
    expect(html).toContain('-translate-x-full')
    expect(html).not.toContain('translate-x-0')
    for (const mode of ['standard', 'taiko', 'catch', 'mania']) {
      expect(html).toContain(`title="osu!${mode}"`)
    }
  })

  it('the nav spreads across the leftover space (flex-1 + justify-between)', () => {
    const html = renderShell()
    const nav = classOf(html, 'nav', 'flex-1')
    expect(nav).not.toBeNull()
    expect(nav).toContain('justify-between')
    // Narrow-screen safety stays: the nav can still scroll.
    expect(nav).toContain('min-w-0')
    expect(nav).toContain('overflow-x-auto')
    // The right-side group no longer pushes itself with ml-auto —
    // the growing nav does that job now.
    expect(html).not.toContain('ml-auto')
  })

  it('the mode rail is transparent, vertically centred, and the pills are bigger', () => {
    const html = renderShell()
    const rail = classOf(html, 'aside', 'z-40')
    expect(rail).not.toBeNull()
    // Floating-dock look: no solid bar, no shadow; the pills sit
    // in the middle of the full-height rail.
    expect(rail).not.toContain('bg-surface-container-low')
    expect(rail).not.toContain('shadow-[')
    expect(rail).not.toContain('pt-space-lg')
    expect(rail).toContain('justify-center')
    // Hide/show mechanics unchanged.
    expect(rail).toContain('w-[72px]')
    expect(rail).toContain('transition-transform')
    expect(rail).toContain('-translate-x-full')
    // Vertical capsule: transparent, wider gaps.
    const capsule = classOf(html, 'div', 'gap-6')
    expect(capsule).not.toBeNull()
    expect(capsule).not.toContain('bg-surface-container')
    // Pills grew 32px -> 48px, labels 13px -> 16px; the scale
    // animations stay.
    const pill = classOf(html, 'button', 'w-12')
    expect(pill).not.toBeNull()
    expect(pill).toContain('h-12')
    expect(pill).toContain('hover:scale-[1.15]')
    expect(pill).toContain('active:scale-[1.3]')
    expect(html).toContain('font-headline-sm text-[16px] leading-none')
    // The header's touch-only mode toggle keeps its old size.
    expect(html).toContain('font-headline-sm text-[13px] leading-none')
  })

  it('the touch-only mode toggle is in the header', () => {
    const html = renderShell()
    expect(html).toContain('Change mode')
  })
})
