import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'
import type { Color } from '@/api/bindings'

export const badgeVariants = cva('inline-flex items-center gap-1 rounded-[4px] px-1.5 h-[18px] text-2xs font-medium whitespace-nowrap', {
  variants: {
    tone: {
      neutral: 'bg-surface-3 text-muted',
      accent: 'bg-accent-soft text-accent',
      ok: 'bg-ok-soft text-ok',
      warn: 'bg-warn-soft text-warn',
      danger: 'bg-danger-soft text-danger',
      outline: 'border border-line-strong text-muted',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

export function Badge({ className, tone, ...props }: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}

export type Status = 'ok' | 'flagged' | 'failed' | 'running' | 'stale' | 'pending' | 'none'

const STATUS: Record<Status, { tone: VariantProps<typeof badgeVariants>['tone']; label: string }> = {
  ok: { tone: 'ok', label: 'OK' },
  flagged: { tone: 'warn', label: 'Flagged' },
  failed: { tone: 'danger', label: 'Failed' },
  running: { tone: 'accent', label: 'Running' },
  stale: { tone: 'warn', label: 'Needs rerun' },
  pending: { tone: 'neutral', label: 'Pending' },
  none: { tone: 'outline', label: '—' },
}

/** Status chip with a dot; the dot shape is constant so color is not the only cue. */
export function StatusChip({ status, label, className }: { status: Status; label?: string; className?: string }) {
  const s = STATUS[status]
  return (
    <Badge tone={s.tone} className={className}>
      <span aria-hidden className={cn('size-1.5 rounded-full bg-current', status === 'running' && 'animate-pulse')} />
      {label ?? s.label}
    </Badge>
  )
}

/** Small dye swatch + name, e.g. in locus tables. */
export function DyeChip({ color, label, className }: { color: Color; label?: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs', className)}>
      <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: `var(--dye-${color})` }} />
      {label ?? color}
    </span>
  )
}
