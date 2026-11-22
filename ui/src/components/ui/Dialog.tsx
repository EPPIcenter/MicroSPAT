import { Dialog as D } from 'radix-ui'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Button } from './Button'

export interface DialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Element that opens the dialog (uncontrolled use). */
  trigger?: ReactNode
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  /** Buttons row, right-aligned. */
  footer?: ReactNode
  width?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const WIDTH = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-5xl' }

export function Dialog({ open, onOpenChange, trigger, title, description, children, footer, width = 'md', className }: DialogProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <D.Trigger asChild>{trigger}</D.Trigger>}
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[1px] data-[state=open]:animate-[fade-in_120ms_ease-out]" />
        <D.Content
          className={cn(
            'fixed top-[12vh] left-1/2 z-50 flex max-h-[76vh] w-[calc(100vw-2rem)] -translate-x-1/2 flex-col rounded-lg border border-line bg-surface shadow-2xl outline-none data-[state=open]:animate-[pop-in_140ms_ease-out]',
            WIDTH[width],
            className,
          )}
          aria-describedby={description ? undefined : undefined}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <D.Title className="text-sm font-semibold">{title}</D.Title>
              {description ? (
                <D.Description className="mt-0.5 text-xs text-muted">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</D.Description>
              )}
            </div>
            <D.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close">
                <X size={14} />
              </Button>
            </D.Close>
          </div>
          {children && <div className="min-h-0 flex-1 overflow-auto px-4 py-3 text-[13px]">{children}</div>}
          {footer && <div className="flex justify-end gap-2 border-t border-line px-4 py-2.5">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

export const DialogClose = D.Close
