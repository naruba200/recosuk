import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface LockedButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'title'> {
  /** True when the current tier may use this action (see capabilities.ts). */
  allowed: boolean
  /** Fired when allowed and clicked. */
  onClick?: () => void
  /** Fired when locked and clicked (e.g. open the signup prompt). */
  onLocked?: () => void
  /** Tooltip shown on the locked state. */
  lockedTitle?: string
  children: ReactNode
}

/**
 * The PLAN-v2 §6 gating pattern: account-only actions stay VISIBLE for
 * guests but render locked (lock icon + tooltip) instead of hiding.
 * Clicking a locked button fires `onLocked`, never the real action.
 */
export default function LockedButton({
  allowed,
  onClick,
  onLocked,
  lockedTitle = 'Create a free account to use this',
  children,
  className,
  ...rest
}: LockedButtonProps) {
  if (allowed) {
    return (
      <button type="button" className={className} onClick={onClick} {...rest}>
        {children}
      </button>
    )
  }
  return (
    <button
      type="button"
      className={className}
      aria-disabled="true"
      title={lockedTitle}
      onClick={onLocked}
      style={{ opacity: 0.55, cursor: 'not-allowed' }}
      {...rest}
    >
      <span
        className="material-symbols-outlined"
        aria-hidden="true"
        style={{ fontSize: '16px', verticalAlign: 'text-bottom', marginRight: '4px' }}
      >
        lock
      </span>
      {children}
    </button>
  )
}
