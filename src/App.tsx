import { useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { useGuestStore } from './lib/guestStore'
import { PreviewRouteStop } from './lib/previewPlayer'
import { readOnboardedFlag, resolveRoute } from './lib/routeGuard'
import OnboardingWelcome from './screens/OnboardingWelcome'
import LinkOsu from './screens/LinkOsu'
import Generating from './screens/Generating'
import StatsExplained from './screens/StatsExplained'
import WelcomeRecs from './screens/WelcomeRecs'
import Dashboard from './screens/Dashboard'
import Stats from './screens/Stats'
import Recommendations from './screens/Recommendations'
import RecommendationsUnlimited from './screens/RecommendationsUnlimited'
import Mirror from './screens/Mirror'
import Lists from './screens/Lists'
import History from './screens/History'
import Auth from './screens/Auth'
import Settings from './screens/Settings'

/**
 * Entry choice: `/` is a first-visit gate, and it always REDIRECTS —
 * it never renders the Dashboard itself, so the address bar always
 * shows the real route (/dashboard or /onboarding). A first visit (no
 * `recosuk-onboarded` flag in localStorage) goes to /onboarding;
 * everyone else goes to /dashboard.
 */
function EntryGate() {
  const { user, loading } = useAuth()
  const guestSession = useGuestStore((s) => s.session)
  let onboarded = false
  try {
    onboarded = window.localStorage.getItem('recosuk-onboarded') === '1'
  } catch {
    onboarded = false
  }
  // While the auth session is still resolving, keep showing the
  // Dashboard shell rather than flashing a redirect.
  if (loading) return <Dashboard />
  // Returning users (PLAN-v2 §5.6): a guest link or a signed-in account
  // with a linked profile skips onboarding entirely, flag or not.
  if (guestSession || user || onboarded) {
    return <Navigate to="/dashboard" replace />
  }
  return <Navigate to="/onboarding" replace />
}

/**
 * Route guard: the app-shell routes need SOME session — a signed-in
 * account, a guest link, or a completed onboarding. A completely fresh
 * visitor landing directly on one is redirected to /onboarding.
 * While the auth session is still resolving, render nothing rather
 * than flashing a redirect. /auth and /onboarding/* are public and
 * never wrapped in this; / is owned by EntryGate.
 */
function RequireSession({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const guestSession = useGuestStore((s) => s.session)
  const location = useLocation()
  if (loading) return null
  const target = resolveRoute(location.pathname, {
    isAccount: user !== null,
    isGuest: guestSession !== null,
    onboarded: readOnboardedFlag(),
  })
  if (target) return <Navigate to={target} replace />
  return <>{children}</>
}

/** The two Stitch Recommendations variants wired together with a toggle. */
function RecommendationsPage() {
  const [mode, setMode] = useState<'generated' | 'unlimited'>('generated')
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.75rem 1.25rem',
          backgroundColor: '#221832',
          color: '#F5F1FA',
          fontFamily: 'Inter, sans-serif',
          fontSize: '14px',
        }}
      >
        <span style={{ fontWeight: 600 }}>Unlimited beatmaps</span>
        <button
          type="button"
          role="switch"
          aria-checked={mode === 'unlimited'}
          onClick={() => setMode(mode === 'generated' ? 'unlimited' : 'generated')}
          style={{
            width: '44px',
            height: '24px',
            borderRadius: '9999px',
            border: 'none',
            cursor: 'pointer',
            position: 'relative',
            backgroundColor: mode === 'unlimited' ? '#FF66AA' : '#4a4454',
            transition: 'background-color 0.2s',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: '3px',
              left: mode === 'unlimited' ? '23px' : '3px',
              width: '18px',
              height: '18px',
              borderRadius: '9999px',
              backgroundColor: '#F5F1FA',
              transition: 'left 0.2s',
            }}
          />
        </button>
        <span style={{ opacity: 0.75 }}>
          {mode === 'unlimited'
            ? 'On — endless feed, ordered as it loads'
            : 'Off — Generated mode (pick a count, fixed list)'}
        </span>
      </div>
      {mode === 'unlimited' ? <RecommendationsUnlimited /> : <Recommendations />}
    </div>
  )
}

/**
 * Navigation bridge: the converted Stitch screens keep their exported
 * markup, whose buttons/sidebar anchors are inert placeholders
 * (href="#" or dropped inline handlers). This bridge intercepts clicks
 * on those elements and routes by their visible label, so the demo is
 * click-through end to end: onboarding flow, sidebar, guest/account CTAs.
 * Real app logic will replace this with proper Link/onClick wiring
 * component by component.
 */
function NavigationBridge() {
  const navigate = useNavigate()
  const location = useLocation()

  // NOTE (M4): the Generating screen used to auto-advance on a fixed
  // 4s timer here. It now runs the real generation pipeline and
  // navigates itself when the work is actually done (or shows its
  // error state) — no bridge timer.

  useEffect(() => {
    const markOnboarded = () => {
      try {
        window.localStorage.setItem('recosuk-onboarded', '1')
      } catch {
        /* private mode — gate just shows onboarding again next visit */
      }
    }
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest('a,button') as HTMLElement | null
      if (!el) return
      // Anchors with a real internal href already work; leave them alone.
      if (el.tagName === 'A') {
        const href = el.getAttribute('href')
        if (href && href.startsWith('/')) return
      }
      const text = (el.textContent || '').toLowerCase().replace(/\s+/g, ' ').trim()
      if (!text) return
      const path = location.pathname
      let to: string | null = null

      if (path === '/onboarding') {
        if (text.includes('skip')) { markOnboarded(); to = '/dashboard' }
        else if (text.includes('next')) to = '/onboarding/link'
      } else if (path === '/onboarding/link') {
        if (text.includes('continue without linking')) { markOnboarded(); to = '/dashboard' }
        else if (text.includes('link my osu')) to = '/onboarding/generating'
        else if (text.includes('continue as guest')) to = '/onboarding/generating'
        else if (text.includes('create account')) to = '/auth'
      } else if (path === '/onboarding/stats') {
        if (text.includes('recommendation')) to = '/welcome-recs'
      } else if (path === '/welcome-recs') {
        if (text.includes('dashboard')) { markOnboarded(); to = '/dashboard' }
      } else if (path === '/auth') {
        if (text.includes('continue as guest')) { markOnboarded(); to = '/dashboard' }
        else if (text.includes('github') || text.includes('create account') || text.includes('sign in')) to = '/onboarding/link'
      }

      if (!to) {
        // Sidebar + global CTAs (any app-shell screen)
        if (text.includes('replay the introduction') || text.includes('replay intro')) to = '/onboarding'
        else if (text.includes('dashboard')) to = '/dashboard'
        else if (text.includes('recommendations')) to = '/recommendations'
        else if (text.includes('mirror')) to = '/mirror'
        else if (text === 'stats' || text.endsWith(' stats') || text.startsWith('stats ')) to = '/stats'
        else if (text.includes('your lists') || text === 'lists' || text.endsWith(' lists')) to = '/lists'
        else if (text.includes('history')) to = '/history'
        else if (text.includes('settings')) to = '/settings'
        else if (text.includes('create account') || text.includes('create a free account')) to = '/auth'
      }

      if (to && to !== path) {
        e.preventDefault()
        navigate(to)
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [location.pathname, navigate])

  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
      <NavigationBridge />
      <PreviewRouteStop />
      <Routes>
        <Route path="/onboarding" element={<OnboardingWelcome />} />
        <Route path="/onboarding/link" element={<LinkOsu />} />
        <Route path="/onboarding/generating" element={<Generating />} />
        <Route path="/onboarding/stats" element={<StatsExplained />} />
        <Route path="/welcome-recs" element={<WelcomeRecs />} />
        <Route path="/" element={<EntryGate />} />
        <Route path="/dashboard" element={<RequireSession><Dashboard /></RequireSession>} />
        <Route path="/stats" element={<RequireSession><Stats /></RequireSession>} />
        <Route path="/recommendations" element={<RequireSession><RecommendationsPage /></RequireSession>} />
        <Route path="/mirror" element={<RequireSession><Mirror /></RequireSession>} />
        <Route path="/lists" element={<RequireSession><Lists /></RequireSession>} />
        <Route path="/history" element={<RequireSession><History /></RequireSession>} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/settings" element={<RequireSession><Settings /></RequireSession>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
