import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.tsx'
import { applyTheme, resolveInitialTheme } from './lib/themes'
import { initSentry } from './lib/sentry'

// Apply the persisted theme before first paint so the first frame
// already uses the chosen palette (:root defaults to Dark Stage if
// nothing is stored — see src/index.css).
applyTheme(resolveInitialTheme())

// Sentry (batch AP item 3a): dormant unless VITE_SENTRY_DSN is set.
// The ErrorBoundary wraps the app unconditionally — without a DSN
// it is still a plain error boundary (catches render errors and
// shows the fallback instead of a blank page), and with a DSN it
// also reports the crash to Sentry.
initSentry()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={
        <div className="min-h-dvh bg-background text-on-background flex flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="font-headline-sm text-headline-sm">Something went wrong on this page.</p>
          <p className="font-body-md text-body-md text-on-surface-variant">
            RecOsuk hit an unexpected error. Reloading usually fixes it — your lists and
            settings are saved.
          </p>
          <button
            type="button"
            className="py-3 px-6 rounded-full bg-primary text-on-primary font-bold cursor-pointer"
            onClick={() => window.location.reload()}
          >
            Reload the page
          </button>
        </div>
      }
    >
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
