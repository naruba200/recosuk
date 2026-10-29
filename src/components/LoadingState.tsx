/**
 * Shared loading state (QA batch 2, item 5; reshaped batch 4, item
 * A): while mode-scoped data loads, screens show the UI CARDS
 * THEMSELVES as loading placeholders — card shells in the real
 * content layout (cover block, title/artist bars, meta chips) with
 * a pulse animation — instead of the previous mode's stale data or
 * generic long message-style rows. Screens pass a label naming what
 * is loading ("Loading your Mania stats…") so the wait is never a
 * blank mystery.
 */
export default function LoadingState({
  label,
  count = 4,
}: {
  label: string
  /** How many placeholder cards to render. */
  count?: number
}) {
  return (
    <div className="flex flex-col gap-space-md" role="status" aria-live="polite">
      <p className="font-body-md text-body-md text-on-surface-variant flex items-center gap-2">
        <span className="material-symbols-outlined text-primary text-[20px] animate-spin">progress_activity</span>
        {label}
      </p>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-space-md p-space-md bg-surface-container-low rounded-lg shadow-sm animate-pulse"
          aria-hidden="true"
        >
          <div className="w-16 h-16 rounded-lg bg-surface-container-highest flex-shrink-0"></div>
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="h-4 w-16 rounded-full bg-surface-container-highest"></div>
              <div className="h-4 w-1/3 rounded bg-surface-container-highest"></div>
            </div>
            <div className="h-3 w-2/3 rounded bg-surface-container-highest"></div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-20 rounded-full bg-surface-container-highest"></div>
              <div className="h-3 w-20 rounded-full bg-surface-container-highest"></div>
              <div className="h-3 w-24 rounded-full bg-surface-container-highest"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
