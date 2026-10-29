import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { initialActiveIndex, moveActiveIndex, type MenuNavKey } from '../lib/dropdownNav'

/**
 * Fully custom listbox dropdown (batch 12). Replaces the native
 * `<select>` in the Mirror toolbar and the Settings mirror-priority
 * control: a native `<option>` popup is rendered by the OS/browser
 * and cannot be styled, so on dark themes (EVA Unit-01 especially)
 * the near-white option text washed out against the white popup.
 * This menu is plain DOM, so every row uses theme tokens.
 *
 * Presentation only: the caller owns the value and the change
 * handler, exactly as it did with the native select. Behaviour:
 * closes on selection, outside click, Escape, and Tab; arrow-key
 * navigation with wrapping; Home/End; focus returns to the button
 * on close; listbox ARIA roles. The focus ring is `focus-visible`
 * only — an always-on ring read as a loud lime border in the EVA
 * theme (batch 12 screenshot).
 */

export interface MenuSelectOption<T extends string> {
  value: T
  label: string
}

interface MenuSelectProps<T extends string> {
  options: MenuSelectOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Static label shown before the selected value, e.g. "Sort:". */
  prefix?: string
  ariaLabel: string
  /** Button classes; defaults to the Mirror toolbar pill. */
  buttonClassName?: string
  /** Extra classes for the menu container. */
  menuClassName?: string
}

const DEFAULT_BUTTON_CLASS =
  'relative flex items-center h-9 pl-3 pr-8 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm hover:bg-surface-bright transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'

export function MenuSelect<T extends string>({
  options,
  value,
  onChange,
  prefix,
  ariaLabel,
  buttonClassName = DEFAULT_BUTTON_CLASS,
  menuClassName = '',
}: MenuSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const baseId = useId()
  const menuId = `${baseId}-menu`
  const selectedIndex = options.findIndex((o) => o.value === value)
  const selected = options[selectedIndex]

  const close = (refocus: boolean) => {
    setOpen(false)
    setActiveIndex(-1)
    if (refocus) buttonRef.current?.focus()
  }

  const openMenu = () => {
    setActiveIndex(initialActiveIndex(selectedIndex, options.length))
    setOpen(true)
  }

  const choose = (index: number) => {
    const option = options[index]
    if (!option) return
    onChange(option.value)
    close(true)
  }

  // Outside click closes the menu.
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        close(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
    // `close` only touches state + the button ref; re-subscribing
    // per render would churn listeners for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const onButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        openMenu()
        // When opening with ArrowUp, land on the last option.
        if (event.key === 'ArrowUp') {
          setActiveIndex(options.length > 0 ? options.length - 1 : -1)
        }
        return
      }
      setActiveIndex((cur) =>
        moveActiveIndex(cur, event.key as MenuNavKey, options.length),
      )
      return
    }
    if (!open) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        openMenu()
      }
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
      return
    }
    if (event.key === 'Tab') {
      close(false)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (activeIndex >= 0) choose(activeIndex)
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setActiveIndex((cur) =>
        moveActiveIndex(cur, event.key as MenuNavKey, options.length),
      )
    }
  }

  const activeId =
    open && activeIndex >= 0 ? `${baseId}-option-${activeIndex}` : undefined

  return (
    <div ref={wrapRef} className="relative flex-shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-activedescendant={activeId}
        aria-label={ariaLabel}
        className={buttonClassName}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onButtonKeyDown}
      >
        {prefix ? (
          <span className="text-on-surface-variant mr-1.5">{prefix}</span>
        ) : null}
        <span className="font-semibold truncate">{selected?.label ?? ''}</span>
        <span
          aria-hidden="true"
          className={`material-symbols-outlined absolute right-2 text-on-surface-variant text-[18px] pointer-events-none transition-transform ${open ? 'rotate-180' : ''}`}
        >
          arrow_drop_down
        </span>
      </button>
      {open && (
        <ul
          id={menuId}
          role="listbox"
          aria-label={ariaLabel}
          className={`absolute right-0 z-30 mt-1 w-52 max-h-72 overflow-y-auto rounded-DEFAULT bg-surface-container-high shadow-xl p-1.5 flex flex-col ${menuClassName}`}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value
            const isActive = index === activeIndex
            return (
              <li
                key={option.value}
                id={`${baseId}-option-${index}`}
                role="option"
                aria-selected={isSelected}
                className={`px-2 py-1.5 rounded font-label-md text-label-md text-left cursor-pointer flex items-center justify-between gap-2 ${
                  isSelected
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-on-surface'
                } ${isActive && !isSelected ? 'bg-surface-bright' : ''} ${
                  !isActive && !isSelected ? 'hover:bg-surface-bright' : ''
                }`}
                onClick={() => choose(index)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className="truncate">{option.label}</span>
                {isSelected ? (
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-[16px] flex-shrink-0"
                  >
                    check
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default MenuSelect
