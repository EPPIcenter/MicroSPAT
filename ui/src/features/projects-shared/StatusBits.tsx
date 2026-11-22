/**
 * Status presentation components. Every place that shows results uses these,
 * so stale results look the same everywhere: an amber triangle chip, a
 * banner with the engine's reasons, and a hatched frame around the results.
 */
import type { CSSProperties, ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, CircleDashed } from 'lucide-react'
import type { AnalysisStatus } from '@/api/bindings'
import { cn } from '@/lib/cn'
import { Tooltip } from '@/components/ui/Tooltip'
import { statusView, type StatusTone, type StatusView } from './status'

const TONE_CLASS: Record<StatusTone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  neutral: 'bg-surface-3 text-muted',
  danger: 'bg-danger-soft text-danger',
}

/** Icon whose shape alone tells the state (check, triangle, dashed circle). */
export function StatusIcon({ view, size = 12, className }: { view: Pick<StatusView, 'state'>; size?: number; className?: string }) {
  if (view.state === 'current') return <CheckCircle2 size={size} className={cn('shrink-0 text-ok', className)} aria-hidden />
  if (view.state === 'stale') return <AlertTriangle size={size} className={cn('shrink-0 text-warn', className)} aria-hidden />
  return <CircleDashed size={size} className={cn('shrink-0 text-faint', className)} aria-hidden />
}

/** The tooltip body for a status: sentence plus the engine's reasons. */
export function StatusTooltip({ view }: { view: StatusView }) {
  return (
    <div className="space-y-1">
      <p>{view.state === 'stale' ? 'Out of date. Re-analyze to update.' : view.sentence}</p>
      {view.reasons.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-muted">
          {view.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Chip: "Current" / "Stale" / "Not analyzed", with reasons on hover. */
export function AnalysisBadge({
  status,
  what,
  label,
  className,
  compact,
}: {
  status: AnalysisStatus | null | undefined
  /** Subject for the sentence, e.g. "PfY1 calls". */
  what?: string
  /** Override the chip text. */
  label?: string
  className?: string
  /** Icon only. */
  compact?: boolean
}) {
  const v = statusView(status, what)
  const chip = compact ? (
    <span tabIndex={0} className={cn('inline-flex items-center outline-none', className)} aria-label={`${v.label}${v.reasons.length ? `: ${v.reasons.join('; ')}` : ''}`} data-state={v.state}>
      <StatusIcon view={v} />
    </span>
  ) : (
    <span
      tabIndex={0}
      data-state={v.state}
      className={cn('inline-flex h-[18px] items-center gap-1 rounded-[4px] px-1.5 text-2xs font-medium whitespace-nowrap outline-none', TONE_CLASS[v.tone], className)}
    >
      <StatusIcon view={v} size={11} className="text-current" />
      {label ?? v.label}
    </span>
  )
  return <Tooltip content={<StatusTooltip view={v} />}>{chip}</Tooltip>
}

/**
 * Banner shown above results that are not current. Renders nothing when the
 * status is current. `action` is typically a "Re-analyze" button.
 */
export function StaleNotice({
  status,
  what,
  action,
  className,
}: {
  status: AnalysisStatus | null | undefined
  what: string
  action?: ReactNode
  className?: string
}) {
  const v = statusView(status, what)
  if (!v.suspect) return null
  return (
    <div
      role="status"
      data-testid="stale-notice"
      data-state={v.state}
      className={cn(
        'flex items-start gap-2 border-b px-3 py-1.5 text-xs',
        v.state === 'stale' ? 'border-warn/30 bg-warn-soft text-fg' : 'border-line bg-surface-2 text-muted',
        className,
      )}
    >
      <StatusIcon view={v} size={14} className="mt-px" />
      <div className="min-w-0 flex-1">
        <span className="font-medium">{v.state === 'stale' ? `${what} are out of date.` : `${what} have not been computed.`}</span>
        {v.reasons.length > 0 && <span className="text-muted"> {v.reasons.map((r) => r.replace(/\.$/, '')).join(' · ')}.</span>}
        {v.state === 'stale' && <span className="text-muted"> What you see was computed from the previous inputs.</span>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/** Hatched backdrop for result areas whose status is not current. */
export const STALE_HATCH: CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(135deg, color-mix(in srgb, var(--c-warn) 9%, transparent) 0 6px, transparent 6px 14px)',
}

/** Wraps result content; hatched with an amber edge when not current. */
export function StaleFrame({ status, children, className }: { status: AnalysisStatus | null | undefined; children: ReactNode; className?: string }) {
  const stale = status?.state === 'stale'
  return (
    <div
      className={cn('relative flex min-h-0 min-w-0 flex-1 flex-col', stale && 'shadow-[inset_3px_0_0_var(--c-warn)]', className)}
      style={stale ? STALE_HATCH : undefined}
      data-stale={stale || undefined}
    >
      {children}
    </div>
  )
}
