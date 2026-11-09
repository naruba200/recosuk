/**
 * "Show more" reveal state (§AQ items 6–7): how many rows of a
 * list are visible, and how many more one press reveals. Pure and
 * tested — the components only hold the count in state.
 */

/** Recent plays (§AQ item 7): 24 shown first, +24 per press. */
export const RECENT_PLAYS_PAGE_SIZE = 24

/** Top plays (§AQ item 6): 15 shown first, +15 per press. */
export const TOP_PLAYS_PAGE_SIZE = 15

/** Next visible count after one "Show more" press: current + step,
 *  capped at the total. Never below 0, never above the total. */
export function nextVisibleCount(current: number, total: number, step: number): number {
  return Math.min(Math.max(current, 0) + step, Math.max(total, 0))
}

/** Whether a "Show more" button should render at all. */
export function hasMoreToShow(visible: number, total: number): boolean {
  return visible < total
}
