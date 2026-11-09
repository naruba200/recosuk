import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { GAME_MODES, MODE_LABELS } from '../lib/mode'
import { MODE_ACCENTS, MODE_PILL_LABELS, useModeStore } from '../lib/modeStore'
import { useAuth } from '../lib/auth'
import { usePreviewPlayer } from '../lib/previewPlayer'

/**
 * The app shell (§AQ item 12): a top header bar + a mode rail on
 * the left. The header holds the logo, every nav link and the
 * profile menu; the rail holds ONLY the mode pills. The rail is
 * hidden by default and slides in from the left when the pointer
 * nears the left edge (an invisible hover zone); on touch screens
 * it opens from the mode button in the header instead, since
 * there is no hover there. The main content uses the full width.
 *
 * Markup/classes are copied from the exported screens (Dashboard
 * is the reference); the demo screens keep their static copies,
 * while real-data screens render through this shell so identity +
 * mode pills are live: pills read/write the global mode store and
 * the active pill re-tints with the per-mode accent token.
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
  { path: 'recommendations', icon: 'auto_awesome', label: 'Recommendations' },
  { path: 'beatmaps', icon: 'compare_arrows', label: 'Beatmaps' },
  { path: 'collections', icon: 'inventory_2', label: 'Collections' },
  { path: 'lists', icon: 'queue_music', label: 'Lists' },
  { path: 'history', icon: 'history', label: 'History' },
]

/**
 * Mode pills (§AQ item 12): the global mode switcher. Horizontal
 * by default (StatsExplained's onboarding screen); `vertical`
 * stacks the four pills in a capsule for the left rail.
 *
 * Pill animation (transform-only, no layout shift): hovering a
 * pill scales it up (~1.15x); pressing it scales it up more
 * (~1.3x); on release it settles back to the hover scale.
 * `onSelect` runs after a pick — the rail uses it to close
 * itself on touch screens.
 */
export function ModePills({
  vertical = false,
  onSelect,
}: { vertical?: boolean; onSelect?: () => void } = {}) {
  const mode = useModeStore((s) => s.mode)
  const setMode = useModeStore((s) => s.setMode)
  return (
    <div
      className={
        vertical
          ? 'flex flex-col items-center gap-6 px-2 py-2 rounded-full'
          : 'flex items-center gap-space-sm bg-surface-container-low px-space-sm py-1.5 rounded-full'
      }
    >
      {GAME_MODES.map((m) => {
        const active = m === mode
        return (
          <button
            key={m}
            className="w-12 h-12 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center hover:bg-surface-container-highest hover:scale-[1.15] active:scale-[1.3] transition-all"
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
            onClick={() => {
              setMode(m)
              onSelect?.()
            }}
          >
            <span className="font-headline-sm text-[16px] leading-none">
              {MODE_PILL_LABELS[m]}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Top-right profile menu (§AN, §AO): the identity pill is the
 * trigger. Hover opens it on desktop, tap toggles it on touch.
 * Items: Profile, Settings, and Log out (Sign in for guests).
 * Guests see Profile/Settings as locked items — tapping one
 * opens the account prompt, the same as the locked buttons
 * elsewhere. Closes on Escape, outside click, or after picking
 * an item. This menu holds the ONLY Log out in the shell (§AQ
 * item 12: the header and sidebar auth buttons are removed).
 *
 * HOVER BRIDGE (§AO): the dropdown sits in a `pt-2` wrapper
 * inside the hover root instead of a `mt-2` gap below it, so
 * the pointer never crosses dead air on the way to an item.
 *
 * PRESS DIM (§AO, removed in §AQ item 4): the pinned state used
 * to dim everything except the header + menu. The dim is gone;
 * pinned-open now behaves like hover-open (no overlay).
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
   * paint, so the hover-bridge markup can be asserted in a static
   * render. Production callers never pass it.
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
  // §AO: the menu's pinned (pressed-open) state lives here.
  const [menuPinned, setMenuPinned] = useState(initialMenuPinned)
  // §AQ item 12: the mode rail is hidden until the pointer nears
  // the left edge (the invisible hover zone below opens it).
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // §AQ item 12d: a mode change briefly flags the page so <main>
  // plays the fade/slide transition, then clears itself. The
  // first run (mount) is skipped — the page must not animate in
  // on first paint.
  const [modeJustChanged, setModeJustChanged] = useState(false)
  const firstModeRef = useRef(mode)
  useEffect(() => {
    if (firstModeRef.current === mode) return
    firstModeRef.current = mode
    setModeJustChanged(true)
    const t = window.setTimeout(() => setModeJustChanged(false), 350)
    return () => window.clearTimeout(t)
  }, [mode])
  // Touch screens have no hover, so picking a mode from the rail
  // closes it there (desktop relies on mouse-leave instead).
  const closeRailOnTouchSelect = useCallback(() => {
    if (window.matchMedia('(max-width: 767px)').matches) setSidebarOpen(false)
  }, [])
  return (
    <div
      className="bg-background font-body-md text-body-md text-on-surface antialiased selection:bg-primary-container selection:text-on-primary-container min-h-screen"
      data-mode={mode}
      style={{ ['--mode-accent' as string]: MODE_ACCENTS[mode] }}
    >
      <header className="fixed top-0 left-0 right-0 h-16 z-40 bg-surface-container-lowest/80 backdrop-blur-xl flex items-center gap-space-md px-space-md md:px-space-xl shadow-[0_1px_8px_rgb(var(--c-shadow)_/_0.3)]">
        <NavLink
          to="/beatmaps"
          title="Go to Beatmaps"
          aria-label="RecOsuk — go to Beatmaps"
          className="flex flex-shrink-0 items-center gap-space-sm rounded-DEFAULT hover:opacity-90 transition-opacity cursor-pointer"
        >
          <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shadow-[0_0_12px_rgb(var(--c-secondary)_/_0.35)]">
            <span className="text-on-secondary font-headline-md text-headline-md leading-none">o!</span>
          </div>
          <div className="hidden sm:flex flex-col">
            <span className="font-headline-md text-headline-md tracking-tight text-on-surface leading-none">RecOsuk</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">rhythm companion</span>
          </div>
        </NavLink>
        <nav className="flex flex-1 items-center justify-between gap-1 min-w-0 overflow-x-auto" aria-label="Main">
          {NAV.map((item) => (
            <NavLink
              key={item.path}
              to={`/${item.path}`}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-full transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-primary-container text-on-primary-container font-semibold shadow-[0_0_14px_rgb(var(--c-primary-container)_/_0.35)]'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`
              }
            >
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              <span className="font-label-md text-label-md hidden md:inline">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-space-md flex-shrink-0">
          <NavLink
            to="/download"
            title="Get the RecOsuk app"
            className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-high hover:bg-primary hover:text-on-primary text-on-surface font-label-md text-label-md transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            <span>Get the app</span>
          </NavLink>
          <div className="hidden md:flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm">
            <span className="material-symbols-outlined text-[16px] text-tertiary">sync</span>
            <span>synced</span>
          </div>
          {/* Touch-only mode toggle (§AQ item 12f): the rail opens
              on hover on desktop, but phones have no hover — this
              button opens it there instead. */}
          <button
            type="button"
            aria-label="Change mode"
            title={`Mode: osu!${MODE_LABELS[mode].toLowerCase()} — tap to show modes`}
            onClick={() => setSidebarOpen((o) => !o)}
            className="md:hidden w-9 h-9 rounded-full flex items-center justify-center font-headline-sm text-[13px] leading-none"
            style={{
              backgroundColor: MODE_ACCENTS[mode],
              color: 'rgb(var(--c-surface-dim) / 1)',
            }}
          >
            {MODE_PILL_LABELS[mode]}
          </button>
          <ProfileMenu
            identity={identity}
            pinned={menuPinned}
            onPinnedChange={setMenuPinned}
          />
        </div>
      </header>
      {/* §AQ item 12b: the invisible left-edge hover zone. It
          starts below the header band so it never covers the
          logo; hovering it slides the rail in. */}
      <div
        aria-hidden="true"
        onMouseEnter={() => setSidebarOpen(true)}
        className="fixed left-0 top-16 bottom-0 z-30 w-6"
      />
      {/* §AQ item 12b: the mode rail — the ONLY thing in the left
          sidebar now. Hidden by default (translated off-screen),
          it slides in on the hover zone and back out on
          mouse-leave. The main content uses the full width. */}
      <aside
        aria-label="Mode"
        onMouseLeave={() => setSidebarOpen(false)}
        className={`fixed left-0 top-16 bottom-0 z-40 w-[72px] flex flex-col items-center justify-center transition-transform duration-300 ease-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <ModePills vertical onSelect={closeRailOnTouchSelect} />
      </aside>
      <main className={`w-full pt-16 bg-surface min-h-screen px-space-xl py-space-xl${hasPlayer ? ' pb-[120px]' : ''}${modeJustChanged ? ' animate-mode-change' : ''}`}>
        {children}
      </main>
    </div>
  )
}
