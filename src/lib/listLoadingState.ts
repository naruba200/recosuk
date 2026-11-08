/**
 * Batch AM: which loading state the Batches list area shows while a
 * generate run is in flight with an empty list. A Renew press clears
 * the stale batch at press time and shows the spinner; every other
 * generate (first load, mode change, filter apply) keeps the
 * card-shaped skeleton placeholders.
 */
export function listLoadingState({ busy, renewing, itemCount, error }: {
  busy: boolean
  /** True only while a Renew-initiated run is in flight. */
  renewing: boolean
  itemCount: number
  error: string | null
}): 'spinner' | 'skeletons' | 'none' {
  if (!busy || error || itemCount > 0) return 'none'
  return renewing ? 'spinner' : 'skeletons'
}
