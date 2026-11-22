import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Teach tailwind-merge the design tokens, otherwise `text-accent-fg` is taken
// for a font size and dropped when merged with `text-[13px]`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        'bg',
        'surface',
        'surface-2',
        'surface-3',
        'line',
        'line-strong',
        'fg',
        'muted',
        'faint',
        'accent',
        'accent-fg',
        'accent-soft',
        'ok',
        'ok-soft',
        'warn',
        'warn-soft',
        'danger',
        'danger-soft',
        'focus',
        'dye-blue',
        'dye-green',
        'dye-yellow',
        'dye-red',
        'dye-orange',
      ],
      text: ['2xs'],
    },
  },
})

/** Merge class names, letting later Tailwind utilities override earlier ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
