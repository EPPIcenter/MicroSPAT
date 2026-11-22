import { useEffect, useRef, useState } from 'react'
import { Toast as T } from 'radix-ui'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useToastStore, type ToastItem } from '@/stores/toasts'

function isFocusVisible(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false
  try {
    return el.matches(':focus-visible')
  } catch {
    return false
  }
}

/**
 * Single toast with its own auto-dismiss timer.
 *
 * Radix Toast's built-in timer shares a provider-wide `isClosePausedRef` that
 * stays `true` after dismissing the last toast while hovered/focused (tearing
 * down `ToastViewport`'s resume listeners without resetting the ref), moves
 * focus to the viewport on close (blocking `pointerleave` resume for remaining
 * toasts), and pauses indefinitely on `window.blur` (e.g. native OS dialogs or
 * switching windows). Passing `duration={Infinity}` disables Radix's internal
 * timer while keeping swipe-to-dismiss, Escape, ARIA announcements, and
 * `DismissableLayer` integration.
 */
function ToastCard({ item, onRemove }: { item: ToastItem; onRemove: (id: number) => void }) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const remainingRef = useRef(item.duration)
  const startedAtRef = useRef(0)
  const paused = hovered || focused

  useEffect(() => {
    if (paused || !Number.isFinite(item.duration)) return
    const remaining = remainingRef.current
    if (remaining <= 0) {
      onRemove(item.id)
      return
    }
    startedAtRef.current = Date.now()
    const timer = window.setTimeout(() => {
      remainingRef.current = 0
      onRemove(item.id)
    }, remaining)
    return () => {
      window.clearTimeout(timer)
      const elapsed = Date.now() - startedAtRef.current
      remainingRef.current = Math.max(0, remainingRef.current - elapsed)
    }
  }, [paused, item.id, item.duration, onRemove])

  return (
    <T.Root
      duration={Infinity}
      onOpenChange={(o) => !o && onRemove(item.id)}
      onPointerEnter={(e) => {
        if (e.pointerType !== 'touch') setHovered(true)
      }}
      onPointerLeave={() => setHovered(false)}
      onFocus={(e) => setFocused(isFocusVisible(e.target))}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false)
      }}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-md border border-line bg-surface p-3 text-[13px] shadow-xl data-[state=open]:animate-[slide-in_160ms_ease-out] data-[swipe=end]:animate-[fade-out_100ms_ease-in]',
        item.tone === 'error' && 'border-l-[3px] border-l-danger',
        item.tone === 'success' && 'border-l-[3px] border-l-ok',
      )}
    >
      <span className="mt-px">
        {item.tone === 'error' ? (
          <AlertCircle size={15} className="text-danger" />
        ) : item.tone === 'success' ? (
          <CheckCircle2 size={15} className="text-ok" />
        ) : (
          <Info size={15} className="text-accent" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <T.Title className="font-medium">{item.title}</T.Title>
        {item.description && <T.Description className="mt-0.5 text-xs break-words text-muted">{item.description}</T.Description>}
      </div>
      <T.Close aria-label="Dismiss" className="rounded p-0.5 text-faint hover:bg-surface-3 hover:text-fg">
        <X size={13} />
      </T.Close>
    </T.Root>
  )
}

/** Renders the toast queue. Mount once at the app root. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const remove = useToastStore((s) => s.remove)
  return (
    <T.Provider swipeDirection="right" duration={Infinity}>
      {toasts.map((t) => (
        <ToastCard key={t.id} item={t} onRemove={remove} />
      ))}
      <T.Viewport className="fixed right-3 bottom-3 z-[60] flex w-[360px] max-w-[calc(100vw-1.5rem)] flex-col gap-2 outline-none" />
    </T.Provider>
  )
}
