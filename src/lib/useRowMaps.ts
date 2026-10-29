import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GameMode } from './mode'
import { supabase } from './supabase'
import {
  feedbackByBeatmapId,
  loadAllFeedback,
  loadFeedbackForMode,
  type FeedbackEntry,
} from './feedback'
import { loadListsContainingSets } from './lists'

/**
 * Batched per-row state for BeatmapRow lists (batch 11, part 5).
 *
 * Before this hook, every BeatmapRow fired TWO queries on mount —
 * `loadFeedbackForBeatmap` (`.single()`, so every unrated row got a
 * PostgREST PGRST116 → HTTP 406 in the console) and
 * `listsContainingSet` (itself two queries: loadLists + one
 * list_items select). A 30-row list fired ~90 queries.
 *
 * Now each list page calls this hook ONCE and passes the maps down:
 * feedback is one query for the whole mode (or all modes on Mirror,
 * whose rows span modes), containment is one loadLists + one
 * `.in()` select for every rendered set id. Rows read from the maps
 * and never query. A rating write updates the feedback map
 * optimistically via `onFeedbackChange`, exactly as the row's local
 * state did before; a save-picker change updates the containment
 * map via `onContainingChange`. Stale-while-refreshing is fine: a
 * fresh load replaces the map when it lands, and a failed load
 * keeps the previous map (the popovers still report errors when
 * opened, as before).
 *
 * Guests / no user / gated-off tiers load nothing: the maps stay
 * empty and the row renders its locked state, as before.
 */

export interface RowMaps {
  /** Feedback keyed by beatmap_id (the rated difficulty). */
  feedbackById: ReadonlyMap<number, FeedbackEntry>
  /** Containing list ids keyed by beatmapset_id. */
  containingBySet: ReadonlyMap<number, readonly string[]>
  /** Row rating writes land here so every row sees the new state. */
  onFeedbackChange: (entry: FeedbackEntry) => void
  /** Row save-picker changes land here, keyed by the row's set. */
  onContainingChange: (beatmapsetId: number, listIds: string[]) => void
}

export function useRowMaps(opts: {
  userId: string | null | undefined
  canRate: boolean
  canSave: boolean
  /** One mode's feedback, or 'all' when rows span modes (Mirror). */
  feedbackMode: GameMode | 'all'
  /** Every beatmapset id currently rendered (containment scope). */
  beatmapsetIds: readonly number[]
}): RowMaps {
  const { userId, canRate, canSave, feedbackMode } = opts
  const [feedbackById, setFeedbackById] = useState<ReadonlyMap<number, FeedbackEntry>>(
    () => new Map(),
  )
  const [containingBySet, setContainingBySet] = useState<
    ReadonlyMap<number, readonly string[]>
  >(() => new Map())

  // One batched feedback load per user/mode. It covers every rated
  // difficulty in the mode, so newly rendered rows are already in
  // the map — no reload when the row list grows (infinite scroll).
  useEffect(() => {
    if (!canRate || !userId || !supabase) {
      setFeedbackById(new Map())
      return
    }
    let live = true
    const load =
      feedbackMode === 'all'
        ? loadAllFeedback(supabase, userId)
        : loadFeedbackForMode(supabase, userId, feedbackMode)
    load
      .then((entries) => {
        if (live) setFeedbackById(feedbackByBeatmapId(entries))
      })
      .catch(() => {
        /* keep the previous map; the rate popover reports on open */
      })
    return () => {
      live = false
    }
  }, [canRate, userId, feedbackMode])

  // Containment IS scoped to the rendered ids, so it reloads
  // (batched, once) when the rendered id set changes — e.g. a new
  // Mirror page appends rows. The key is sorted + deduped so a
  // re-render with the same ids does not re-query.
  const idsKey = useMemo(
    () => [...new Set(opts.beatmapsetIds)].sort((a, b) => a - b).join(','),
    [opts.beatmapsetIds],
  )
  useEffect(() => {
    if (!canSave || !userId || !supabase || idsKey === '') {
      setContainingBySet(new Map())
      return
    }
    const ids = idsKey.split(',').map(Number)
    let live = true
    loadListsContainingSets(supabase, userId, ids)
      .then((map) => {
        if (live) setContainingBySet(map)
      })
      .catch(() => {
        /* keep the previous map; the save popover re-loads on open */
      })
    return () => {
      live = false
    }
  }, [canSave, userId, idsKey])

  const onFeedbackChange = useCallback((entry: FeedbackEntry) => {
    setFeedbackById((prev) => {
      const next = new Map(prev)
      next.set(entry.beatmap_id, entry)
      return next
    })
  }, [])

  const onContainingChange = useCallback((beatmapsetId: number, listIds: string[]) => {
    setContainingBySet((prev) => {
      const next = new Map(prev)
      next.set(beatmapsetId, listIds)
      return next
    })
  }, [])

  return { feedbackById, containingBySet, onFeedbackChange, onContainingChange }
}
