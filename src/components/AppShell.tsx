import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { GAME_MODES, MODE_LABELS } from '../lib/mode'
import { MODE_ACCENTS, MODE_PILL_LABELS, useModeStore } from '../lib/modeStore'
import { useAuth } from '../lib/auth'
import { usePreviewPlayer } from '../lib/previewPlayer'

/**
 * The Stitch app shell (sidebar + top bar) as a parameterized component.
 * Markup/classes are copied from the exported screens (Dashboard is the
 * reference); the demo screens keep their static copies, while real-data
 * screens render through this shell so identity + mode pills are live:
 * pills read/write the global mode store and the active pill re-tints
 * with the per-mode accent token.
 */

export interface ShellIdentity {
  username: string
  /** Null while the identity is still resolving (or genuinely
   * unknown): the sidebar shows "…" rather than flashing "0 pp". */
  pp: number | null
  countryCode?: string
  avatarUrl?: string
  tierLabel: string
}

const NAV: { path: string; icon: string; label: string }[] = [
  { path: 'profile', icon: 'person', label: 'Profile' },
  { path: 'recommendations', icon: 'auto_awesome', label: 'Recommendations' },
  { path: 'beatmaps', icon: 'compare_arrows', label: 'Beatmaps' },
  { path: 'collections', icon: 'inventory_2', label: 'Collections' },
  { path: 'lists', icon: 'queue_music', label: 'Lists' },
  { path: 'history', icon: 'history', label: 'History' },
]

export function ModePills() {
  const mode = useModeStore((s) => s.mode)
  const setMode = useModeStore((s) => s.setMode)
  return (
    <div className="flex items-center gap-space-sm bg-surface-container-low px-space-sm py-1.5 rounded-full">
      {GAME_MODES.map((m) => {
        const active = m === mode
        return (
          <button
            key={m}
            className="w-8 h-8 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center hover:bg-surface-container-highest transition-all"
            style={
              active
                ? {
                    backgroundColor: MODE_ACCENTS[m],
                    // Dark surface text on the bright mode accent:
                    // follows the theme's surface token, not a
                    // hardcoded stage hex (batch 11 theming audit).
                    color: 'rgb(var(--c-surface-dim) / 1)',
                    boxShadow: `0 0 14px ${MODE_ACCENTS[m]}73`,
                  }
                : undefined
            }
            title={`osu!${MODE_LABELS[m].toLowerCase()}`}
            type="button"
            onClick={() => setMode(m)}
          >
            <span className="font-headline-sm text-[13px] leading-none">
              {MODE_PILL_LABELS[m]}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Header auth control: signed-out and guest users get a visible
 * "Sign in" entry point (the Auth page was previously reachable only
 * by label-matching); signed-in accounts get "Log out", which signs
 * out, clears the guest session, and lands on the sign-in tab.
 */
function HeaderAuthControl() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const onClick = async () => {
    if (user) {
      await signOut()
    }
    navigate('/auth?mode=signin')
  }

  return (
    <button
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-md text-label-md transition-all"
      type="button"
      onClick={onClick}
    >
      <span className="material-symbols-outlined text-[16px]">{user ? 'logout' : 'login'}</span>
      <span>{user ? 'Log out' : 'Sign in'}</span>
    </button>
  )
}

/**
 * Sidebar-footer auth control: the same Sign in / Log out action as the
 * header, always visible at the bottom of the sidebar so it can never
 * be missed (users asked where the login/logout buttons are).
 */
function SidebarAuthControl() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const onClick = async () => {
    if (user) {
      await signOut()
    }
    navigate('/auth?mode=signin')
  }

  return (
    <button
      className="flex w-full items-center justify-center gap-2 px-space-md py-2.5 rounded-DEFAULT bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-md text-label-md transition-all"
      type="button"
      onClick={onClick}
    >
      <span className="material-symbols-outlined text-[18px]">{user ? 'logout' : 'login'}</span>
      <span>{user ? 'Log out' : 'Sign in'}</span>
    </button>
  )
}

/**
 * Top-right profile menu (§AN, §AO): the identity pill is the
 * trigger. Hover opens it on desktop, tap toggles it on touch.
 * Items: Profile, Settings, and Log out (Sign in for guests).
 * Guests see Profile/Settings as locked items — tapping one
 * opens the account prompt, the same as the locked buttons
 * elsewhere. Closes on Escape, outside click, or after picking
 * an item.
 *
 * HOVER BRIDGE (§AO): the dropdown sits in a `pt-2` wrapper
 * inside the hover root instead of a `mt-2` gap below it, so
 * the pointer never crosses dead air on the way to an item.
 *
 * PRESS DIM (§AO): the pinned (pressed-open) state is owned by
 * AppShell, which renders a dim overlay over everything except
 * the header and the menu. Hover-open never dims.
 */
function ProfileMenu({
  identity,
  pinned,
  onPinnedChange,
}: {
  identity: ShellIdentity
  pinned: boolean
  onPinnedChange: (pinned: boolean) => void
}) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [hover, setHover] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const open = hover || pinned

  // Memoized so the Escape/outside-click effect below can list it
  // as a dependency without re-subscribing every render
  // (`onPinnedChange` is AppShell's stable setMenuPinned).
  const close = useCallback(() => {
    setHover(false)
    onPinnedChange(false)
  }, [onPinnedChange])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open, close])

  const go = (path: string) => {
    close()
    navigate(path)
  }

  const onAuthAction = async () => {
    close()
    if (user) await signOut()
    navigate('/auth?mode=signin')
  }

  const items: { label: string; icon: string; locked: boolean; action: () => void }[] = [
    {
      label: 'Profile',
      icon: 'person',
      locked: !user,
      action: () => (user ? go('/profile') : go('/auth')),
    },
    {
      label: 'Settings',
      icon: 'tune',
      locked: !user,
      action: () => (user ? go('/settings') : go('/auth')),
    },
  ]

  return (
    <div
      className="relative"
      ref={rootRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onPinnedChange(!pinned)}
        className="flex items-center gap-space-sm pl-space-sm py-1 pr-1.5 rounded-full bg-surface-container-high hover:bg-surface-container transition-colors"
      >
        <div className="flex flex-col text-right">
          <span className="font-label-sm text-label-sm text-on-surface leading-none">
            {identity.username}
          </span>
          <span className="font-label-sm text-[10px] text-on-surface-variant leading-none mt-0.5">
            {identity.tierLabel}
          </span>
        </div>
        {identity.avatarUrl ? (
          <img className="w-8 h-8 rounded-full object-cover" alt="" src={identity.avatarUrl} />
        ) : (
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
          </div>
        )}
        <span className="material-symbols-outlined text-on-surface-variant text-[18px]">menu</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 pt-2">
          <div
            role="menu"
            className="w-48 rounded-DEFAULT bg-surface-container-high shadow-[0_8px_24px_rgb(var(--c-shadow)_/_0.5)] py-1"
          >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={item.action}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left font-label-md text-label-md transition-colors ${
                item.locked
                  ? 'text-on-surface-variant opacity-70 hover:bg-surface-container'
                  : 'text-on-surface hover:bg-surface-container'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {item.locked ? 'lock' : item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
          <div className="mx-2 my-1 h-px bg-outline-variant/40" />
          <button
            type="button"
            role="menuitem"
            onClick={() => void onAuthAction()}
            className="w-full flex items-center gap-2 px-3 py-2 text-left font-label-md text-label-md text-on-surface hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">
              {user ? 'logout' : 'login'}
            </span>
            <span>{user ? 'Log out' : 'Sign in'}</span>
          </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AppShell({
  identity,
  children,
  /**
   * Test seam (§AO): renders the profile menu pinned-open on first
   * paint, so the press-dim overlay and the hover-bridge markup can
   * be asserted in a static render. Production callers never pass it.
   */
  initialMenuPinned = false,
}: {
  identity: ShellIdentity
  children: ReactNode
  initialMenuPinned?: boolean
}) {
  const mode = useModeStore((s) => s.mode)
  // Batch 7, item 1: while the player footer is visible, the main
  // content gets bottom clearance (~96px footer + gap) so the last
  // row is never hidden behind it. pb-* sorts after py-* in
  // Tailwind, so this overrides the py-space-xl bottom padding.
  const hasPlayer = usePreviewPlayer().track !== null
  // §AO: the menu's pinned (pressed-open) state lives here so the
  // shell can dim everything except the header + menu while it is
  // pinned. Hover-open never dims (see the overlay below).
  const [menuPinned, setMenuPinned] = useState(initialMenuPinned)
  return (
    <div
      className="bg-background font-body-md text-body-md text-on-surface antialiased selection:bg-primary-container selection:text-on-primary-container min-h-screen"
      data-mode={mode}
      style={{ ['--mode-accent' as string]: MODE_ACCENTS[mode] }}
    >
      <aside className="fixed left-0 top-0 h-full w-[232px] bg-surface-container-low z-50 flex flex-col justify-between py-space-md shadow-[0_1px_8px_rgb(var(--c-shadow)_/_0.4)]">
        <div className="flex flex-col gap-space-md px-space-md">
          <NavLink
            to="/beatmaps"
            title="Go to Beatmaps"
            aria-label="RecOsuk — go to Beatmaps"
            className="flex items-center gap-space-sm px-space-xs pt-space-xs rounded-DEFAULT hover:opacity-90 transition-opacity cursor-pointer"
          >
            <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shadow-[0_0_12px_rgb(var(--c-secondary)_/_0.35)]">
              <span className="text-on-secondary font-headline-md text-headline-md leading-none">o!</span>
            </div>
            <div className="flex flex-col">
              <span className="font-headline-md text-headline-md tracking-tight text-on-surface leading-none">RecOsuk</span>
              <span className="font-label-sm text-label-sm text-on-surface-variant">rhythm companion</span>
            </div>
          </NavLink>
          {/* §AO: the sidebar profile card (avatar + name + pp +
              country flag) is removed — the identity lives in the
              top-right profile menu now. The nav follows directly. */}
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.path}
                to={`/${item.path}`}
                className={({ isActive }) =>
                  `flex items-center gap-space-sm px-space-md py-2.5 rounded-DEFAULT transition-all ${
                    isActive
                      ? 'bg-primary-container text-on-primary-container font-semibold shadow-[0_0_14px_rgb(var(--c-primary-container)_/_0.35)]'
                      : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                  }`
                }
              >
                <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                <span className="font-label-md text-label-md">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="px-space-md flex flex-col gap-space-xs">
          <SidebarAuthControl />
          <div className="flex items-center justify-between p-space-sm rounded-DEFAULT bg-surface-container">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-hitgreen animate-pulse"></span>
              <span className="font-label-sm text-label-sm text-on-surface-variant">osu! server</span>
            </div>
            <span className="font-label-sm text-label-sm text-on-surface">online</span>
          </div>
          <div className="flex items-center justify-between px-space-xs text-on-surface-variant font-label-sm text-label-sm">
            <span>RecOsuk v2.4</span>
            <a className="hover:text-primary transition-colors" data-path="changelog" href="#">notes</a>
          </div>
        </div>
      </aside>
      <div className="pl-[232px]">
        <header
          className={`fixed top-0 left-[232px] right-0 h-16 bg-surface-container-lowest/80 backdrop-blur-xl flex items-center justify-between px-space-xl shadow-[0_1px_8px_rgb(var(--c-shadow)_/_0.3)] ${
            // §AO: while the menu is pinned the header rises above
            // the dim overlay (z-50) so it and the menu stay bright.
            menuPinned ? 'z-[60]' : 'z-40'
          }`}
        >
          <div className="flex items-center gap-space-sm">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Stage context</span>
            <span className="text-outline-variant font-label-sm text-label-sm">/</span>
            <span className="font-label-md text-label-md text-primary font-medium">Active trainer</span>
          </div>
          <ModePills />
          <div className="flex items-center gap-space-md">
            <NavLink
              to="/download"
              title="Get the RecOsuk app"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-high hover:bg-primary hover:text-on-primary text-on-surface font-label-md text-label-md transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              <span>Get the app</span>
            </NavLink>
            <HeaderAuthControl />
            <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm">
              <span className="material-symbols-outlined text-[16px] text-tertiary">sync</span>
              <span>synced</span>
            </div>
            <ProfileMenu
              identity={identity}
              pinned={menuPinned}
              onPinnedChange={setMenuPinned}
            />
          </div>
        </header>
        {/* §AO press dim: only while the menu is pinned open. The
            overlay starts below the header band (top-16) and covers
            the page + sidebar at z-50 — the header (z-60 while
            pinned) and the menu inside it stay bright, and the
            sidebar's logo row stays bright with the header band.
            A mousedown anywhere on it closes the menu (the
            ProfileMenu outside-click listener); the click handler
            is the same close for pointer paths that skip mousedown. */}
        {menuPinned && (
          <div
            aria-hidden="true"
            onClick={() => setMenuPinned(false)}
            className="fixed inset-x-0 bottom-0 top-16 z-50 bg-black/50"
          />
        )}
        <main className={`w-full pt-16 bg-surface min-h-screen px-space-xl py-space-xl${hasPlayer ? ' pb-[120px]' : ''}`}>
          {children}
        </main>
      </div>
    </div>
  )
}
