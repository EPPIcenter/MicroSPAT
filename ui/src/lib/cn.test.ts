import { expect, it } from 'vitest'
import { cn } from './cn'

it('keeps token colors next to arbitrary font sizes', () => {
  expect(cn('text-accent-fg', 'text-[13px]')).toBe('text-accent-fg text-[13px]')
  expect(cn('text-xs', 'text-2xs')).toBe('text-2xs')
  expect(cn('bg-surface', 'bg-accent')).toBe('bg-accent')
})
