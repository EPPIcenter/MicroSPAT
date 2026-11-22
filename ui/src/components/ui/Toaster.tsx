import { Toast as T } from 'radix-ui'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useToastStore } from '@/stores/toasts'

/** Renders the toast queue. Mount once at the app root. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const remove = useToastStore((s) => s.remove)
  return (
    <T.Provider swipeDirection="right">
      {toasts.map((t) => (
        <T.Root
          key={t.id}
          duration={t.duration}
          onOpenChange={(o) => !o && remove(t.id)}
          className={cn(
            'flex w-full items-start gap-2.5 rounded-md border border-line bg-surface p-3 text-[13px] shadow-xl data-[state=open]:animate-[slide-in_160ms_ease-out] data-[swipe=end]:animate-[fade-out_100ms_ease-in]',
            t.tone === 'error' && 'border-l-[3px] border-l-danger',
            t.tone === 'success' && 'border-l-[3px] border-l-ok',
          )}
        >
          <span className="mt-px">
            {t.tone === 'error' ? (
              <AlertCircle size={15} className="text-danger" />
            ) : t.tone === 'success' ? (
              <CheckCircle2 size={15} className="text-ok" />
            ) : (
              <Info size={15} className="text-accent" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <T.Title className="font-medium">{t.title}</T.Title>
            {t.description && <T.Description className="mt-0.5 text-xs break-words text-muted">{t.description}</T.Description>}
          </div>
          <T.Close aria-label="Dismiss" className="rounded p-0.5 text-faint hover:bg-surface-3 hover:text-fg">
            <X size={13} />
          </T.Close>
        </T.Root>
      ))}
      <T.Viewport className="fixed right-3 bottom-3 z-[60] flex w-[360px] max-w-[calc(100vw-1.5rem)] flex-col gap-2 outline-none" />
    </T.Provider>
  )
}
