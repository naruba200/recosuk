/**
 * Pure keyboard-navigation helpers for custom listbox dropdowns
 * (MenuSelect). Kept dependency-free so they are unit-testable under
 * the node test environment — no DOM, no rendering library.
 */

/** Keys the dropdown handles while its menu is open. */
export type MenuNavKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End'

/**
 * The next active option index for a navigation key. Arrow keys
 * wrap around the ends (standard menu behaviour); Home/End jump.
 * A null current index means "nothing active yet": ArrowDown lands
 * on the first option, ArrowUp on the last. Returns -1 when the
 * list is empty.
 */
export function moveActiveIndex(
  current: number | null,
  key: MenuNavKey,
  count: number,
): number {
  if (count <= 0) return -1
  switch (key) {
    case 'Home':
      return 0
    case 'End':
      return count - 1
    case 'ArrowDown':
      return current === null ? 0 : (current + 1) % count
    case 'ArrowUp':
      return current === null ? count - 1 : (current - 1 + count) % count
  }
}

/**
 * The index that should be active when a menu opens: the selected
 * option when it is in range, otherwise the first option, or -1
 * for an empty list.
 */
export function initialActiveIndex(selectedIndex: number, count: number): number {
  if (count <= 0) return -1
  if (selectedIndex >= 0 && selectedIndex < count) return selectedIndex
  return 0
}
