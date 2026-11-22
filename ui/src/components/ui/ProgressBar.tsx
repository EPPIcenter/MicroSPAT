import { cn } from '@/lib/cn'

/** Thin progress bar. `value` 0..1, or null for indeterminate. */
export function ProgressBar({
  value,
  tone = 'accent',
  className,
  label,
}: {
  value: number | null
  tone?: 'accent' | 'ok' | 'danger'
  className?: string
  label?: string
}) {
  const pct = value == null ? null : Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct ?? undefined}
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)}
    >
      <div
        className={cn(
          'absolute inset-y-0 left-0 rounded-full transition-[width] duration-200',
          tone === 'accent' && 'bg-accent',
          tone === 'ok' && 'bg-ok',
          tone === 'danger' && 'bg-danger',
          pct == null && 'w-1/3 animate-[indeterminate_1.2s_ease-in-out_infinite]',
        )}
        style={pct == null ? undefined : { width: `${pct}%` }}
      />
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-label="Loading"
      role="status"
      className={cn('inline-block size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent', className)}
    />
  )
}
