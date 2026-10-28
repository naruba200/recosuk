/**
 * Shared loading state (QA batch 2, item 5): skeleton rows in the
 * Dark Stage language, shown while mode-scoped data loads instead of
 * the previous mode's stale data. Screens pass a label naming what is
 * loading ("Loading your Mania stats…") so the wait is never a blank
 * mystery.
 */
export default function LoadingState({
  label,
  rows = 3,
}: {
  label: string
  rows?: number
}) {
  return (
    <div className="flex flex-col gap-space-md" role="status" aria-live="polite">
      <p className="font-body-md text-body-md text-on-surface-variant flex items-center gap-2">
        <span className="material-symbols-outlined text-primary text-[20px] animate-spin">progress_activity</span>
        {label}
      </p>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg bg-surface-container-low p-space-md animate-pulse"
          aria-hidden="true"
        >
          <div className="flex items-center gap-space-md">
            <div className="w-14 h-14 rounded-full bg-surface-container-highest"></div>
            <div className="flex flex-col gap-2 flex-1">
              <div className="h-4 w-1/2 rounded bg-surface-container-highest"></div>
              <div className="h-3 w-1/3 rounded bg-surface-container-highest"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
