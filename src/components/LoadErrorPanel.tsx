import { useNavigate } from 'react-router-dom'

/**
 * Honest load-failure / no-profile panel (batch AS): replaces the old
 * demo fallback. A failed load shows the real error with Retry; with
 * no osu! profile linked at all it says so and links to onboarding.
 * Never sample data.
 */
export default function LoadErrorPanel({
  message,
  onRetry,
  noProfile,
}: {
  message?: string | null
  onRetry: () => void
  noProfile: boolean
}) {
  const navigate = useNavigate()
  if (noProfile) {
    return (
      <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
        <p className="font-body-md text-body-md text-on-surface-variant">
          No osu! profile linked yet — link your osu! account to see your stats and recommendations.
        </p>
        <button
          className="px-space-md py-2 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md flex-shrink-0"
          type="button"
          onClick={() => navigate('/onboarding/link')}
        >
          Link osu! account
        </button>
      </div>
    )
  }
  return (
    <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
      <p className="font-body-sm text-body-sm text-error">
        {message ??
          'Could not load your osu! data just now — the proxy or osu! may be unreachable.'}
      </p>
      <button
        className="px-space-md py-2 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md flex-shrink-0"
        type="button"
        onClick={onRetry}
      >
        Retry
      </button>
    </div>
  )
}
