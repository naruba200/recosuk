// RecOsuk batch 15, Phase A — Settings row: "osu! account connection".
//
// Account users only. Guests see the row locked (LockedButton pattern,
// same as M5): no guest token storage, no anonymous auth. The row never
// displays a token value — only the connected username, expiry, and
// the header-only probe result.

import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import LockedButton from './LockedButton'
import { useAuth } from '../lib/auth'
import {
  PROBE_BEATMAPSET_ID,
  beginOsuSignIn,
  disconnectOsu,
  getOsuAuthStatus,
  getOsuRedirectUri,
  isOsuAuthExpiredError,
  probeOsuDownload,
  type OsuAuthStatus,
  type ProbeOsuDownloadResult,
} from '../lib/osuAuth'

function probeLine(label: string, variant: {
  status: number
  contentType: string | null
  contentLength: string | null
  contentDisposition: string | null
  pass: boolean
}): ReactNode {
  return (
    <div className="text-left">
      <span className={variant.pass ? 'text-hitgreen font-semibold' : 'text-error font-semibold'}>
        {variant.pass ? 'PASS' : 'FAIL'}
      </span>
      <span className="text-on-surface-variant"> — {label}: </span>
      <span className="break-all">
        HTTP {variant.status}
        {variant.contentType ? ` · ${variant.contentType}` : ''}
        {variant.contentLength ? ` · ${variant.contentLength} bytes` : ''}
        {variant.contentDisposition ? ` · ${variant.contentDisposition}` : ''}
      </span>
    </div>
  )
}

export default function OsuConnectionRow() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [status, setStatus] = useState<OsuAuthStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'connect' | 'disconnect' | 'probe' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [probe, setProbe] = useState<ProbeOsuDownloadResult | null>(null)
  const [copied, setCopied] = useState(false)

  const redirectUri = getOsuRedirectUri()

  useEffect(() => {
    if (!user) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    getOsuAuthStatus()
      .then((s) => {
        if (!cancelled) setStatus(s)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Could not load the osu! connection status.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  // Guests: locked row, account prompt on click. No token storage, no
  // anonymous auth — the M5 gating pattern.
  if (!user) {
    return (
      <div className="py-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm group hover:bg-surface-container-low/40 px-2 rounded-DEFAULT transition-colors">
        <div className="flex flex-col">
          <span className="font-label-md text-label-md text-on-surface">osu! account connection</span>
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            Needed for in-page official downloads; mirrors keep working without it. Requires a RecOsuk account.
          </span>
        </div>
        <LockedButton
          allowed={false}
          onLocked={() => navigate('/auth')}
          lockedTitle="Create a free account to connect your osu! account"
          className="px-3 py-1.5 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-label-md text-label-md transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">lock</span>
          <span>Sign in with osu!</span>
        </LockedButton>
      </div>
    )
  }

  const connected = status?.connected === true
  const expired = status?.expired === true

  const handleConnect = async () => {
    setBusy('connect')
    setActionError(null)
    try {
      await beginOsuSignIn()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not start osu! sign-in.')
      setBusy(null)
    }
    // On success the browser navigates away to osu.ppy.sh.
  }

  const handleDisconnect = async () => {
    setBusy('disconnect')
    setActionError(null)
    try {
      await disconnectOsu()
      setStatus({ connected: false, osuUsername: null, osuUserId: null, expiresAt: null, expired: false })
      setProbe(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not disconnect the osu! account.')
    } finally {
      setBusy(null)
    }
  }

  const handleProbe = async () => {
    setBusy('probe')
    setActionError(null)
    setProbe(null)
    try {
      setProbe(await probeOsuDownload(PROBE_BEATMAPSET_ID))
    } catch (err) {
      if (isOsuAuthExpiredError(err)) {
        setActionError('The osu! connection has expired. Reconnect to run the download test.')
        setStatus((s) => (s ? { ...s, expired: true } : s))
      } else {
        setActionError(err instanceof Error ? err.message : 'The download test failed to run.')
      }
    } finally {
      setBusy(null)
    }
  }

  const copyRedirectUri = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable (e.g. non-secure context): the URI is
      // rendered as selectable text below, so it stays copyable.
    }
  }

  return (
    <div className="py-space-md flex flex-col gap-space-sm group hover:bg-surface-container-low/40 px-2 rounded-DEFAULT transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
        <div className="flex flex-col">
          <span className="font-label-md text-label-md text-on-surface">osu! account connection</span>
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            {loading
              ? 'Loading…'
              : connected
                ? expired
                  ? 'Connected, but the access token has expired — reconnect to keep in-page downloads working.'
                  : `Connected${status?.osuUsername ? ` as ${status.osuUsername}` : ' (name unknown)'}${status?.expiresAt ? ` · token expires ${new Date(status.expiresAt).toLocaleString()}` : ''}`
                : 'Needed for in-page official downloads; mirrors keep working without it.'}
          </span>
        </div>
        <div className="flex items-center flex-wrap gap-space-sm">
          {loadError && !loading && (
            <span className="font-body-sm text-body-sm text-error">{loadError}</span>
          )}
          {connected ? (
            <>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={busy !== null}
                className="px-3 py-1.5 rounded-full hover:bg-error-container/30 text-error hover:text-on-error-container font-label-md text-label-md transition-colors disabled:opacity-50 cursor-pointer"
              >
                {busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
              </button>
              {expired && (
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={busy !== null}
                  className="px-3 py-1.5 rounded-full bg-primary text-on-primary font-label-md text-label-md transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {busy === 'connect' ? 'Starting…' : 'Reconnect'}
                </button>
              )}
              <button
                type="button"
                onClick={handleProbe}
                disabled={busy !== null}
                className="px-3 py-1.5 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface font-label-md text-label-md transition-colors disabled:opacity-50 cursor-pointer"
              >
                {busy === 'probe' ? 'Testing…' : 'Test official download'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleConnect}
              disabled={busy !== null || loading}
              className="px-3 py-1.5 rounded-full bg-primary text-on-primary font-label-md text-label-md transition-colors disabled:opacity-50 cursor-pointer"
            >
              {busy === 'connect' ? 'Starting…' : 'Sign in with osu!'}
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <p className="font-body-sm text-body-sm text-error">{actionError}</p>
      )}

      {probe && (
        <div className="rounded-lg bg-surface-container-low px-3 py-2 font-body-sm text-body-sm space-y-1">
          <p className="font-semibold">
            {probe.pass
              ? 'Download test passed — osu! accepted your sign-in for official downloads.'
              : 'Download test did not pass — in-page official downloads stay off until this passes. (The probe never downloads a file; it only reads status + headers.)'}
          </p>
          {probeLine(`beatmapset ${probe.beatmapsetId}`, probe)}
          {probeLine(`beatmapset ${probe.beatmapsetId} (no video)`, probe.noVideoVariant)}
        </div>
      )}

      {/* Setup checklist + the exact redirect URI to register. */}
      <div className="rounded-lg bg-surface-container-low px-3 py-2 font-body-sm text-body-sm text-on-surface-variant space-y-1">
        <p className="font-semibold text-on-surface">One-time setup (before the first sign-in works)</p>
        <ol className="list-decimal list-inside space-y-0.5">
          <li>Run <code>supabase/migrations/002_osu_tokens.sql</code> in the Supabase SQL Editor.</li>
          <li>Set the <code>OSU_TOKEN_ENCRYPTION_KEY</code> Edge Function secret (<code>openssl rand -base64 32</code>).</li>
          <li>Register both redirect URIs below in the osu! OAuth app settings.</li>
          <li>Redeploy: <code>supabase functions deploy osu-proxy --no-verify-jwt</code>.</li>
        </ol>
        <p>Full steps: <code>docs/OSU-SIGNIN.md</code> in the repo. Tokens are stored encrypted, server-side only, and never reach the browser; Disconnect deletes them (also revoke in osu! settings if you want the grant gone entirely).</p>
        <div className="flex items-center flex-wrap gap-2 pt-1">
          <span className="text-on-surface">Register this redirect URI:</span>
          <code className="break-all bg-surface-container-highest px-2 py-0.5 rounded">{redirectUri}</code>
          <button
            type="button"
            onClick={copyRedirectUri}
            className="px-2.5 py-1 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-sm text-label-sm transition-colors cursor-pointer"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p>For local dev, also register <code>http://localhost:5173/auth/osu/callback</code> (adjust the port if your dev server uses another).</p>
      </div>
    </div>
  )
}
