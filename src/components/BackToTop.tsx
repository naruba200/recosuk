import { useEffect, useState } from 'react'
import { usePreviewPlayer } from '../lib/previewPlayer'

/**
 * Back-to-top button (§AE), shared by Mirror and the
 * Recommendations views. The app scrolls the WINDOW (AppShell:
 * fixed 232px sidebar + fixed header, normal-flow main), so the
 * button listens to window scroll and scrolls the window back.
 *
 * Placement: bottom-LEFT of the content area (left-[248px] =
 * sidebar + 16px gutter), never bottom-right — the download dock
 * and its reopen button live bottom-right (fixed right-4,
 * bottom-4 / bottom-[112px] while the player footer is visible),
 * and the player footer spans the full content width at the
 * bottom. The left placement clears both by construction.
 */
export const BACK_TO_TOP_THRESHOLD = 600

export function shouldShowBackToTop(
  scrollY: number,
  threshold: number = BACK_TO_TOP_THRESHOLD,
): boolean {
  return scrollY > threshold
}

export default function BackToTop() {
  // Initialized from the live scroll position (a keep-place
  // restore can already be past the threshold on mount) — no
  // effect-time setState needed.
  const [visible, setVisible] = useState(() => shouldShowBackToTop(window.scrollY))
  const preview = usePreviewPlayer()
  const hasPlayer = preview.track !== null

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
      className={`fixed left-[248px] z-40 w-10 h-10 rounded-full bg-surface-container-highest text-on-surface shadow-lg flex items-center justify-center hover:bg-primary-container hover:text-on-primary-container transition-colors ${
        hasPlayer ? 'bottom-[112px]' : 'bottom-4'
      }`}
    >
      <span className="material-symbols-outlined text-[20px]">arrow_upward</span>
    </button>
  )
}
