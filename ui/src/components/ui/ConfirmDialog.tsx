import { AlertDialog as A } from 'radix-ui'
import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { buttonVariants } from './Button'

export interface ConfirmDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: ReactNode
  title: ReactNode
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button for destructive actions. */
  destructive?: boolean
  /** May return a promise; the dialog stays open (busy) until it settles. */
  onConfirm: () => void | Promise<unknown>
}

export function ConfirmDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
}: ConfirmDialogProps) {
  const [inner, setInner] = useState(false)
  const [busy, setBusy] = useState(false)
  const isOpen = open ?? inner
  const setOpen = (v: boolean) => {
    if (open === undefined) setInner(v)
    onOpenChange?.(v)
  }
  return (
    <A.Root open={isOpen} onOpenChange={setOpen}>
      {trigger && <A.Trigger asChild>{trigger}</A.Trigger>}
      <A.Portal>
        <A.Overlay className="fixed inset-0 z-40 bg-black/35" />
        <A.Content className="fixed top-[18vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 rounded-lg border border-line bg-surface p-4 shadow-2xl data-[state=open]:animate-[pop-in_140ms_ease-out]">
          <A.Title className="text-sm font-semibold">{title}</A.Title>
          {description && <A.Description className="mt-1.5 text-xs leading-relaxed text-muted">{description}</A.Description>}
          <div className="mt-4 flex justify-end gap-2">
            <A.Cancel className={buttonVariants({ variant: 'secondary' })} disabled={busy}>
              {cancelLabel}
            </A.Cancel>
            <A.Action
              className={cn(buttonVariants({ variant: destructive ? 'danger' : 'primary' }))}
              disabled={busy}
              onClick={async (e) => {
                const r = onConfirm()
                if (r && typeof (r as Promise<unknown>).then === 'function') {
                  e.preventDefault()
                  setBusy(true)
                  try {
                    await r
                    setOpen(false)
                  } catch {
                    // Stay open; the caller reports the error (toast or inline description).
                  } finally {
                    setBusy(false)
                  }
                }
              }}
            >
              {busy ? 'Working…' : confirmLabel}
            </A.Action>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  )
}
