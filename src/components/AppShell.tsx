import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { GAME_MODES, MODE_LABELS } from '../lib/mode'
import { MODE_ACCENTS, MODE_PILL_LABELS, useModeStore } from '../lib/modeStore'
import { fmtInt } from '../lib/interpretations'
import { useAuth } from '../lib/auth'

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
  pp: number
  countryCode?: string
  avatarUrl?: string
  tierLabel: string
}

const NAV: { path: string; icon: string; label: string }[] = [
  { path: 'dashboard', icon: 'grid_view', label: 'Dashboard' },
  { path: 'stats', icon: 'insights', label: 'Stats' },
  { path: 'recommendations', icon: 'auto_awesome', label: 'Recommendations' },
  { path: 'mirror', icon: 'compare_arrows', label: 'Mirror' },
  { path: 'collections', icon: 'inventory_2', label: 'Collections' },
  { path: 'lists', icon: 'queue_music', label: 'Lists' },
  { path: 'history', icon: 'history', label: 'History' },
  { path: 'settings', icon: 'tune', label: 'Settings' },
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
                    color: '#161020',
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

export default function AppShell({
  identity,
  children,
}: {
  identity: ShellIdentity
  children: ReactNode
}) {
  const mode = useModeStore((s) => s.mode)
  return (
    <div
      className="bg-background font-body-md text-body-md text-on-surface antialiased selection:bg-primary-container selection:text-on-primary-container min-h-screen"
      data-mode={mode}
      style={{ ['--mode-accent' as string]: MODE_ACCENTS[mode] }}
    >
      <aside className="fixed left-0 top-0 h-full w-[232px] bg-surface-container-low z-50 flex flex-col justify-between py-space-md shadow-[0_1px_8px_rgba(0,0,0,0.4)]">
        <div className="flex flex-col gap-space-md px-space-md">
          <NavLink
            to="/dashboard"
            title="Go to Dashboard"
            aria-label="RecOsuk — go to Dashboard"
            className="flex items-center gap-space-sm px-space-xs pt-space-xs rounded-DEFAULT hover:opacity-90 transition-opacity cursor-pointer"
          >
            <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shadow-[0_0_12px_rgba(255,176,204,0.35)]">
              <span className="text-on-secondary font-headline-md text-headline-md leading-none">o!</span>
            </div>
            <div className="flex flex-col">
              <span className="font-headline-md text-headline-md tracking-tight text-on-surface leading-none">RecOsuk</span>
              <span className="font-label-sm text-label-sm text-on-surface-variant">rhythm companion</span>
            </div>
          </NavLink>
          <div className="flex items-center gap-space-sm p-space-sm rounded-DEFAULT bg-surface-container-high">
            <div className="relative flex-shrink-0">
              {identity.avatarUrl ? (
                <img
                  className="w-10 h-10 rounded-full object-cover"
                  alt=""
                  src={identity.avatarUrl}
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-[22px]">face</span>
                </div>
              )}
              {identity.countryCode && (
                <div className="absolute -bottom-1 -right-1 px-1 py-0.5 rounded-full bg-surface-container-lowest font-label-sm text-[9px] leading-none text-secondary font-bold uppercase">
                  {identity.countryCode}
                </div>
              )}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="font-label-md text-label-md text-on-surface truncate">
                {identity.username}
              </span>
              <div className="flex items-center gap-1">
                <span className="font-label-sm text-label-sm text-primary font-bold">
                  {fmtInt(identity.pp)}
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">pp</span>
              </div>
            </div>
          </div>
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.path}
                to={`/${item.path}`}
                className={({ isActive }) =>
                  `flex items-center gap-space-sm px-space-md py-2.5 rounded-DEFAULT transition-all ${
                    isActive
                      ? 'bg-primary-container text-on-primary-container font-semibold shadow-[0_0_14px_rgba(164,118,255,0.35)]'
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
              <span className="w-2 h-2 rounded-full bg-[#7EE787] animate-pulse"></span>
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
        <header className="fixed top-0 left-[232px] right-0 h-16 bg-surface-container-lowest/80 backdrop-blur-xl z-40 flex items-center justify-between px-space-xl shadow-[0_1px_8px_rgba(0,0,0,0.3)]">
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
            <div className="flex items-center gap-space-sm pl-space-sm py-1 pr-1.5 rounded-full bg-surface-container-high">
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
            </div>
          </div>
        </header>
        <main className="w-full pt-16 bg-surface min-h-screen px-space-xl py-space-xl">
          {children}
        </main>
      </div>
    </div>
  )
}
