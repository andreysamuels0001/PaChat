import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Conditional class names with conflict resolution.
 *
 * `clsx` flattens the conditionals; `twMerge` then resolves Tailwind conflicts
 * so a caller's `px-4` reliably overrides a component's default `px-3` instead
 * of losing to whichever CSS rule happens to come later in the stylesheet.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
