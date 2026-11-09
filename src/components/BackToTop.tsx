import { useEffect, useState } from 'react'
import { usePreviewPlayer } from '../lib/previewPlayer'
import { useDownloadQueue } from '../lib/downloadQueue'

/**
 * Back-to-top button (§AE), shared by Mirror and the
 * Recommendations views. The app scrolls the WINDOW (AppShell:
 * fixed header, normal-flow main), so the button listens to
 * window scroll and scrolls the window back.
 *
 * Placement: 'left' is the default (bottom-LEFT of the content
 * area, left-4 = the 16px gutter — the download dock and its
 * reopen button live bottom-right, so the left placement clears
 * both by construction). 'right' (§AN, Recommendations only)
 * puts it bottom-right ABOVE the dock: the dock window is ~259px
 * tall and the reopen button 44px, each plus the 16px base
 * gutter — see backToTopPositionClass.
 */
export const BACK_TO_TOP_THRESHOLD = 600

export type BackToTopPlacement = 'left' | 'right'

export function shouldShowBackToTop(
  scrollY: number,
  threshold: number = BACK_TO_TOP_THRESHOLD,
): boolean {
  return scrollY > threshold
}

/**
 * Pure position classes (§AN). Right-side offsets, all as
 * literal Tailwind classes (no interpolation — Tailwind only
 * generates classes it can see in the source):
 * - dock window open: base + 276px (259px window + 16px gap)
 * - reopen button visible: base + 60px (44px button + 16px gap)
 * - otherwise the base itself (16px, or 112px with the player
 *   footer showing).
 */
export function backToTopPositionClass(
  placement: BackToTopPlacement,
  hasPlayer: boolean,
  dockWindowOpen: boolean,
  dockReopenVisible: boolean,
): string {
  // §AQ item 12: the sidebar is gone, so the left placement is
  // the plain 16px gutter now (was sidebar + 16px).
  if (placement === 'left') {
    return hasPlayer ? 'left-4 bottom-[112px]' : 'left-4 bottom-4'
  }
  if (dockWindowOpen) return hasPlayer ? 'right-4 bottom-[388px]' : 'right-4 bottom-[292px]'
  if (dockReopenVisible) return hasPlayer ? 'right-4 bottom-[172px]' : 'right-4 bottom-[76px]'
  return hasPlayer ? 'right-4 bottom-[112px]' : 'right-4 bottom-4'
}

export default function BackToTop({ placement = 'left' }: { placement?: BackToTopPlacement }) {
  // Initialized from the live scroll position (a keep-place
  // restore can already be past the threshold on mount) — no
  // effect-time setState needed.
  const [visible, setVisible] = useState(() => shouldShowBackToTop(window.scrollY))
  const preview = usePreviewPlayer()
  const hasPlayer = preview.track !== null
  // Only the right placement needs the dock state.
  const dockOpen = useDownloadQueue((s) => s.dockOpen)
  const dockItems = useDownloadQueue((s) => s.items)
  const showDownloadWindow = dockOpen && dockItems.length > 0
  const showReopen = !dockOpen && dockItems.length > 0

  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        ticking = false
        setVisible(shouldShowBackToTop(window.scrollY))
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!visible) return null

  return (
    <button
      type="button"
      aria-label="Back to top"
      title="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className={`fixed z-40 w-10 h-10 rounded-full bg-surface-container-highest text-on-surface shadow-lg flex items-center justify-center hover:bg-primary-container hover:text-on-primary-container transition-colors ${backToTopPositionClass(
        placement,
        hasPlayer,
        showDownloadWindow,
        showReopen,
      )}`}
    >
      <span className="material-symbols-outlined text-[20px]">arrow_upward</span>
    </button>
  )
}
