// RecOsuk batch AP — Sentry error tracking (item 3a), client only.
//
// The DSN comes from VITE_SENTRY_DSN (a Vercel env var — never
// hardcoded, never committed). With no DSN set, initSentry() is a
// no-op and Sentry stays completely dormant: no network calls, no
// bundle-visible behaviour change, nothing breaks.
//
// What it captures when enabled: uncaught exceptions + render
// errors (via the ErrorBoundary in main.tsx) and a 10% sample of
// page-load / navigation traces. No session replay (privacy +
// bundle size). No user data is attached — Sentry sees the error
// and the URL, never an osu! username, token, or email.
//
// Setup (user's hands): create a free Sentry account, make a
// React project, copy its DSN, set VITE_SENTRY_DSN in Vercel
// (project Settings → Environment Variables → Production), redeploy.
import * as Sentry from '@sentry/react'

let enabled = false

export function initSentry(): void {
  if (enabled) return
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    integrations: [Sentry.browserTracingIntegration()],
  })
  enabled = true
}

export function isSentryEnabled(): boolean {
  return enabled
}
