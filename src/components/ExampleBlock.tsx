import type { ReactNode } from 'react'

/**
 * Marks sample/demo content that is rendered as an illustration, not as
 * the user's real data. The content is greyed out and badged with a
 * visible "Example" chip plus a one-line note, so it can never be
 * mistaken for real data. Pointer events are left alone: controls
 * inside (e.g. a "Create account" CTA) still work.
 *
 * Real data must NEVER be wrapped in this: it renders at full opacity
 * with no chip.
 */
export default function ExampleBlock({
  note,
  children,
}: {
  note: string
  children: ReactNode
}) {
  return (
    <section aria-label="Example content">
      <div className="flex flex-wrap items-center gap-2 mb-space-sm">
        <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-label-sm text-[10px] uppercase font-bold tracking-wider">
          Example
        </span>
        <span className="font-label-sm text-label-sm text-on-surface-variant">{note}</span>
      </div>
      <div className="opacity-60">{children}</div>
    </section>
  )
}
