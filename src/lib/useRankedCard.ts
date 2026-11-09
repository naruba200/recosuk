import { useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { GameMode } from './mode'
import type { RankedCompilation } from './rankedLists'
import {
  RANKED_CARD_COMPILE_ERROR,
  compileCardCompilation,
  isCompilationFresh,
  isUnreachableCompilation,
  loadStoredCompilation,
  storeCompilation,
  type RankedPeriodCard,
} from './rankedCards'

export interface RankedCardLoad {
  /** The compilation to render, or null while nothing is available yet. */
  compilation: RankedCompilation | null
  /** True while the DB read or a live compile is running. */
  loading: boolean
  /** Non-null only when a card has nothing to show (no cached row + compile failed). */
  error: string | null
  /** True when the shown rows come from a stale cached row. */
  stale: boolean
  /** Where the shown rows came from ('db' = stored row, 'live' = just compiled). */
  source: 'db' | 'live' | null
}

const EMPTY: RankedCardLoad = {
  compilation: null,
  loading: false,
  error: null,
  stale: false,
  source: null,
}

/**
 * DB-first loader for one ranked period card (the detail page).
 *
 * 1. Read the stored row. Fresh → render it, done.
 * 2. Stale → render it AND recompile in the background.
 * 3. Missing → compile live, store, render.
 * A stored row is never hidden by a failed recompile.
 *
 * `refreshSignal` (bump to force a fresh compile) is the only
 * caller-controlled re-trigger; the hook never recompiles on its
 * own after the first load.
 */
export function useRankedCardCompilation(
  client: SupabaseClient | null,
  mode: GameMode,
  card: RankedPeriodCard | null,
  refreshSignal = 0,
): RankedCardLoad {
  const [load, setLoad] = useState<RankedCardLoad>(EMPTY)
  const runRef = useRef(0)
  const lastKeyRef = useRef<string | null>(null)
  const lastRefreshRef = useRef(refreshSignal)

  useEffect(() => {
    if (!card) {
      setLoad(EMPTY)
      lastKeyRef.current = null
      return
    }
    const key = `${mode}:${card.granularity}:${card.period}`
    const run = ++runRef.current
    const isNewCard = lastKeyRef.current !== key
    lastKeyRef.current = key
    // Only a run whose refreshSignal actually changed is a
    // refresh run (a later mode/card change must NOT bypass
    // the in-memory cache).
    const isRefreshRun = refreshSignal !== lastRefreshRef.current
    lastRefreshRef.current = refreshSignal
    if (isNewCard) setLoad((prev) => ({ ...prev, compilation: null, loading: true, error: null, stale: false, source: null }))
    else setLoad((prev) => ({ ...prev, loading: true, error: null }))

    let cancelled = false
    const stillCurrent = () => !cancelled && runRef.current === run

    void (async () => {
      const nowMs = Date.now()
      const stored = await loadStoredCompilation(client, mode, card.granularity, card.period)
      if (!stillCurrent()) return
      if (stored && isUnreachableCompilation(stored.compilation)) {
        // §AO: unreachable — show the stored empty result and
        // never recompile it (its interval only gets older).
        setLoad({ compilation: stored.compilation, loading: false, error: null, stale: false, source: 'db' })
        return
      }
      const fresh = stored && isCompilationFresh(stored.compiledAtMs, card.window.ttlMs, nowMs)
      if (fresh && stored) {
        setLoad({ compilation: stored.compilation, loading: false, error: null, stale: false, source: 'db' })
        return
      }
      if (stored) {
        // Stale: show it, recompile in the background.
        setLoad({ compilation: stored.compilation, loading: true, error: null, stale: true, source: 'db' })
      }
      try {
        const compiled = await compileCardCompilation(mode, card, {
          now: nowMs,
          fresh: isRefreshRun,
        })
        if (!stillCurrent()) return
        void storeCompilation(client, mode, card.granularity, card.period, compiled, Date.now())
        setLoad({ compilation: compiled, loading: false, error: null, stale: false, source: 'live' })
      } catch {
        if (!stillCurrent()) return
        // Keep the stale rows on screen; only a card with
        // nothing at all reports the error.
        setLoad((prev) =>
          prev.compilation
            ? { ...prev, loading: false }
            : { compilation: null, loading: false, error: RANKED_CARD_COMPILE_ERROR, stale: false, source: null },
        )
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, mode, card?.granularity, card?.period, refreshSignal])

  return load
}
