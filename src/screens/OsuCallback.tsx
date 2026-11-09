// RecOsuk batch 15, Phase A (batch 16: immediate navigation) — osu!
// OAuth callback page.
//
// Transient page: osu! redirects here after the user authorises.
// Validates `state`, exchanges the code server-side (once — a ref guard
// stops React 19 StrictMode's double-effect from exchanging twice; a
// reused code fails server-side and surfaces as "already used, try
// signing in again"), then navigates IMMEDIATELY to Settings with the
// `osuConnected` param (no success screen, no timer — the user
// previously felt stuck here and pressed Back). No tokens ever reach
// this page: the exchange response carries only username/id/expiry.
//
// If the code exchange hangs (network unreachable, edge function down,
// CORS block), a timeout falls back to an error screen with a "Back to
// Settings" button so the user is never left staring at the spinner
// indefinitely.

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  OSU_AUTH_STATE_KEY,
  exchangeOsuCode,
  osuConnectedSettingsTarget,
  parseOsuCallback,
} from '../lib/osuAuth'
import { OsuServiceError } from '../lib/osu'

/** How long to wait for the code exchange before giving up. */
const EXCHANGE_TIMEOUT_MS = 30_000

type Phase = 'working' | 'error'

export default function OsuCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('working')
  const [detail, setDetail] = useState('')
  // StrictMode double-invokes effects in dev: exchange exactly once.
  const ranRef = useRef(false)
  // Timeout guard: if the exchange promise never settles, fail open so
  // the user is never stuck on the spinner forever.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    const parsed = parseOsuCallback(searchParams.toString())

    if (parsed.error === 'access_denied') {
      setPhase('error')
      setDetail(
        'You declined RecOsuk access to your osu! account. Nothing was connected. ' +
          'You can try again from Settings whenever you like.',
      )
      return
    }
    if (parsed.error) {
      setPhase('error')
      setDetail(
        `osu! returned an error (${parsed.error})${parsed.errorDescription ? `: ${parsed.errorDescription}` : ''}. Nothing was connected.`,
      )
      return
    }
    if (!parsed.code) {
      setPhase('error')
      setDetail('osu! did not return an authorisation code. Nothing was connected — try signing in with osu! again from Settings.')
      return
    }

    let storedState: string | null = null
    try {
      storedState = sessionStorage.getItem(OSU_AUTH_STATE_KEY)
      sessionStorage.removeItem(OSU_AUTH_STATE_KEY)
    } catch {
      storedState = null
    }

    let cancelled = false

    // Race the exchange against a timeout so a hanging network request
    // can't leave the user on the spinner indefinitely.
    const timeout = new Promise<never>((_, reject) => {
      timerRef.current = setTimeout(
        () => reject(new Error('The osu! connection is taking longer than expected. Try signing in again.')),
        EXCHANGE_TIMEOUT_MS,
      )
    })

    Promise.race([exchangeOsuCode(parsed.code, parsed.state, storedState), timeout])
      .then((result) => {
        if (cancelled) return
        // Success: leave immediately — no success screen, no timer.
        // Settings shows the one-time confirmation banner from the param.
        navigate(osuConnectedSettingsTarget(result.osuUsername), { replace: true })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof OsuServiceError && err.code === 'osu_redirect_uri_mismatch') {
          setDetail(
            'osu! rejected the redirect URI — it is not registered in the osu! OAuth app settings. ' +
              'Add the redirect URI shown in Settings (osu! account connection) to the app at osu.ppy.sh, then try again.',
          )
        } else if (err instanceof Error && /invalid|expired|revoked|already used/i.test(err.message)) {
          setDetail('This sign-in code was already used or has expired. Try signing in with osu! again from Settings.')
        } else if (err instanceof Error) {
          setDetail(err.message)
        } else {
          setDetail('Something went wrong while connecting your osu! account. Try signing in with osu! again from Settings.')
        }
        setPhase('error')
      })
    return () => {
      cancelled = true
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [searchParams, navigate])

  return (
    <div className="min-h-screen bg-background text-on-background flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-surface border border-outline-variant p-6 text-center">
        <h1 className="font-display font-bold text-xl mb-2">osu! sign-in</h1>
        {phase === 'working' && (
          <>
            <div className="mx-auto my-4 h-8 w-8 rounded-full border-2 border-outline-variant border-t-primary animate-spin" aria-label="Working" />
            <p className="text-sm text-on-surface-variant">Finishing the connection to your osu! account…</p>
            <p className="text-sm text-on-surface-variant mt-1">This can take a few seconds — please don&apos;t go back, the connection is being saved.</p>
          </>
        )}
        {phase === 'error' && (
          <>
            <p className="text-2xl mb-2" aria-hidden>✕</p>
            <p className="text-sm text-left text-on-surface-variant">{detail}</p>
            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="mt-4 px-4 py-2 rounded-full bg-primary text-on-primary font-semibold text-sm cursor-pointer"
            >
              Back to Settings
            </button>
          </>
        )}
      </div>
    </div>
  )
}
