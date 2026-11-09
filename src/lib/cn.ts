import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge class names, resolving conflicting Tailwind utilities
 * (Magic UI's `cn`, vendored for the bento grid in §AT).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
