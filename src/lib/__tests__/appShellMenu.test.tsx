import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../auth'
import AppShell, { type ShellIdentity } from '../../components/AppShell'

/**
 * §AO — the profile menu: hover bridge + press dim + sidebar
 * profile card removal + logo retarget. The menu's pinned state
 * is owned by AppShell; `initialMenuPinned` renders it pinned
 * on first paint so the static render can assert the overlay
 * and the dropdown markup. Interaction itself (hover staying
 * open across the bridge, click-to-close on the dim) is live-only.
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
    </MemoryRouter>,
  )
}

function classOf(html: string, tag: string, mustContain: string): string | null {
  const matches = [...html.matchAll(new RegExp(`<${tag}[^>]*class="([^"]*)"`, 'g'))]
    .map((m) => m[1])
    .filter((cls) => cls.split(' ').includes(mustContain))
  return matches.length > 0 ? matches[0] : null
}

describe('profile menu (§AO)', () => {
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

  it('pinned-open: a dim overlay covers everything except the header + menu', () => {
    const html = renderShell(true)
    const overlay = classOf(html, 'div', 'bg-black/50')
    expect(overlay).not.toBeNull()
    expect(overlay).toContain('fixed')
    expect(overlay).toContain('top-16')
    expect(overlay).toContain('bottom-0')
    expect(overlay).toContain('z-50')
    // The header rises above the overlay while pinned.
    expect(classOf(html, 'header', 'z-[60]')).not.toBeNull()
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
