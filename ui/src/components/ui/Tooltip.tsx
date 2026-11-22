import { Tooltip as T } from 'radix-ui'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export const TooltipProvider = T.Provider

export interface TooltipProps {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  className?: string
  /** Delay before opening, ms. */
  delay?: number
}

/** Tooltip around a single focusable child. */
export function Tooltip({ content, children, side = 'top', align = 'center', className, delay }: TooltipProps) {
  if (content == null || content === '') return <>{children}</>
  return (
    <T.Root delayDuration={delay}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          align={align}
          sideOffset={5}
          collisionPadding={8}
          className={cn(
            'z-50 max-w-72 rounded border border-line bg-surface px-2 py-1.5 text-xs leading-snug text-fg shadow-lg',
            className,
          )}
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  )
}
