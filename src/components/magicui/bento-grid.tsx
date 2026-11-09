import { type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

/**
 * Magic UI bento grid, vendored + adapted (§AT).
 * Source: https://github.com/magicuidesign/magicui —
 * apps/www/registry/magicui/bento-grid.tsx (MIT License).
 *
 * Adaptations for RecOsuk:
 * - Content-sized rows: upstream's fixed `auto-rows-[22rem]` is
 *   far too tall for these tiles, so the rows size to content.
 * - Project surface tokens instead of the neutral light/dark
 *   palette (the app is dark-only and flat — no shadows, glows,
 *   or gradients).
 * - No shadcn Button / radix icons: the CTA is a plain span with
 *   a material-symbols arrow, rendered by the card content.
 * - The card is a generic shell — its children carry the content,
 *   so tiles keep their own markup instead of the upstream
 *   showcase card's Icon/name/description props.
 */
interface BentoGridProps extends ComponentPropsWithoutRef<'div'> {
  children: ReactNode
  className?: string
}

interface BentoCardProps extends ComponentPropsWithoutRef<'div'> {
  children: ReactNode
  className?: string
}

const BentoGrid = ({ children, className, ...props }: BentoGridProps) => {
  return (
    <div className={cn('grid w-full grid-cols-3 gap-4', className)} {...props}>
      {children}
    </div>
  )
}

const BentoCard = ({ children, className, ...props }: BentoCardProps) => {
  return (
    <div
      className={cn(
        'group relative col-span-3 flex flex-col overflow-hidden rounded-xl',
        'bg-surface-container-low transition-colors hover:bg-surface-container',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export { BentoCard, BentoGrid }
