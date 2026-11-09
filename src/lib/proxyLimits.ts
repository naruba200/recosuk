// RecOsuk batch AP — client-side write-throttle constants.
//
// These mirror the function-side values in
// supabase/functions/osu-proxy/proxyHelpers.ts (the source of
// truth). Keep them in sync: the client pre-checks and the server
// enforces the same rules, so a mismatch would either block legal
// writes or let a write through that the server then rejects.

/** One stat snapshot per user per mode per hour (migration 004's
 *  DB trigger is the real enforcement; profileService pre-checks). */
export const SNAPSHOT_THROTTLE_MS = 60 * 60 * 1000

/** Max maps in one list (lists.ts addToList enforces this). */
export const LIST_MAX_ITEMS = 500

/** Max NEW feedback rows per user per rolling hour. Re-rating a map
 *  the user already rated is an update, not a new row, and is
 *  always allowed (feedback.ts enforces this). */
export const FEEDBACK_NEW_PER_HOUR = 60
