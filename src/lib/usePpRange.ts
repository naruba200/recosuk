import { useCallback, useEffect, useRef, useState } from 'react'
import { getPpRange, type PpComputeDeps, type PpDifficultyInput, type PpRange } from './pp'

/**
 * Max-PP range for one row, computed only once the row is near
 * the viewport (IntersectionObserver, 200px margin) and debounced
 * 120ms so a fast scroll never starts work. The row renders `—`
 * until the range lands or is proven unavailable; nothing here
 * ever blocks the list, and rows without difficulty data stay
 * idle (the caller hides the pill).
 */

export type PpRangeState = 'idle' | 'loading' | 'ready' | 'unavailable'

export interface PpRangeResult {
  /** Attach to the row's root element. */
  ref: (node: HTMLElement | null) => void
  range: PpRange | null
  state: PpRangeState
}

export function usePpRange(
  difficulties: readonly PpDifficultyInput[] | undefined,
  deps: PpComputeDeps = {},
): PpRangeResult {
  const [range, setRange] = useState<PpRange | null>(null)
  const [state, setState] = useState<PpRangeState>('idle')
  const [visible, setVisible] = useState(false)
  const [node, setNode] = useState<HTMLElement | null>(null)

  const depsRef = useRef(deps)
  const diffRef = useRef(difficulties)

  // Sync latest values after render (declared before the compute
  // effect so it always runs first on a commit): writing ref
  // .current during render is discouraged, and the compute effect
  // below must read fresh values.
  useEffect(() => {
    depsRef.current = deps
    diffRef.current = difficulties
  })

  const signature =
    difficulties && difficulties.length > 0
      ? difficulties
          .map((d) => `${d.beatmapId}:${d.checksum ?? ''}:${d.lastUpdated ?? ''}:${d.mode}`)
          .join('|')
      : ''

  const ref = useCallback((next: HTMLElement | null) => {
    setNode(next)
  }, [])

  useEffect(() => {
    if (!node || !signature) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px 0px', threshold: 0 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [node, signature])

  useEffect(() => {
    if (!visible || !signature) return
    let live = true
    setRange(null)
    setState('loading')
    const timer = setTimeout(() => {
      void getPpRange(diffRef.current ?? [], depsRef.current)
        .then((next) => {
          if (!live) return
          setRange(next)
          setState(next ? 'ready' : 'unavailable')
        })
        .catch(() => {
          if (!live) return
          setRange(null)
          setState('unavailable')
        })
    }, 120)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [visible, signature])

  return { ref, range, state }
}
