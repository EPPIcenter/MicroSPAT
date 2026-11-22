/** Small pieces of the review screens: allele chips, narrow misses, call flags, review progress, MOI line, peak legend, shortcut sheet. */
import { fmtProbability } from '@/lib/format'
import { useEffect, useRef } from 'react'
import { Ban, Hand, MessageSquare, OctagonAlert, Rainbow, Zap } from 'lucide-react'
import type { LocusRef, NarrowMiss } from '@/api/bindings'
import { drawPeakMarker, type PeakState } from '@/components/TraceViewer'
import { Kbd } from '@/components/ui/Kbd'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/cn'
import { usePlotTheme, withAlpha } from '@/plot/theme'
import { fmtShare, narrowMissShort, narrowMissText, type AlleleChip, type CallView, type ReviewProgress } from '../model/calls'
import { PEAK_STATE_TEXT } from '../model/peaks'

/** Called alleles in size order, each with its share of the signal. Never truncated: chips wrap. */
export function AlleleChips({ chips, stale, className }: { chips: readonly AlleleChip[]; stale?: boolean; className?: string }) {
  if (chips.length === 0) return <span className="text-xs text-faint">none</span>
  return (
    <span className={cn('flex flex-wrap items-center gap-1', className)} data-testid="allele-chips" data-count={chips.length}>
      {chips.map((c) => (
        <Tooltip
          key={c.bin_id}
          content={
            <div className="space-y-0.5">
              <p className="font-medium">
                Allele {c.label}
                {c.size != null && <span className="font-normal text-muted"> · {c.size.toFixed(2)} bp</span>}
              </p>
              {c.share != null && (
                <p>
                  {fmtShare(c.share)} of the called signal{c.corrected ? ', corrected for amplification bias' : ''}
                </p>
              )}
              {c.probability != null && <p>Probability {fmtProbability(c.probability)}</p>}
              {c.lowProbability && <p className="text-warn">Below the bootstrap threshold: does not count toward MOI.</p>}
            </div>
          }
        >
          <span
            tabIndex={-1}
            data-allele={c.label}
            className={cn(
              'inline-flex h-[18px] items-center gap-1 rounded-[4px] border px-1 font-mono text-[11px] leading-none whitespace-nowrap',
              stale ? 'border-dashed border-warn/60 bg-transparent' : 'border-line-strong bg-surface-2',
              c.lowProbability && 'border-dashed border-warn text-warn',
            )}
          >
            <span className="font-semibold text-fg">{c.label}</span>
            {c.share != null && <span className="text-muted">{fmtShare(c.share)}</span>}
          </span>
        </Tooltip>
      ))}
    </span>
  )
}

/** Narrow misses after the allele chips: dashed, in the warning color, with the margin. */
export function NarrowChips({ misses }: { misses: readonly NarrowMiss[] }) {
  if (!misses.length) return null
  return (
    <>
      {misses.map((m) => (
        <Tooltip
          key={m.bin_id}
          content={
            <div className="space-y-0.5">
              <p className="font-medium">Narrow miss at {m.label} (not called)</p>
              <p>
                {m.size.toFixed(2)} bp, {Math.round(m.height).toLocaleString('en-US')} RFU: {narrowMissText(m)}.
              </p>
              <p className="text-muted">Look at it; press its number in the trace to call it by hand.</p>
            </div>
          }
        >
          <span
            tabIndex={-1}
            data-narrow={m.label}
            className="inline-flex h-[18px] items-center gap-1 rounded-[4px] border border-dashed border-warn/70 px-1 font-mono text-[11px] leading-none whitespace-nowrap text-warn"
          >
            {m.label}
            <span className="font-sans text-2xs text-warn/85">{narrowMissShort(m)}</span>
          </span>
        </Tooltip>
      ))}
    </>
  )
}

/** "Reviewed 412 / 1,656" with a thin bar. */
export function ReviewProgressBar({ p, label, testId, className }: { p: ReviewProgress; label?: string; testId?: string; className?: string }) {
  const frac = p.calls ? p.reviewed / p.calls : 0
  const left = p.calls - p.reviewed
  return (
    <Tooltip content={left ? `${left.toLocaleString('en-US')} calls left to review (controls included). A mark stays until the call changes.` : 'Every call is reviewed.'}>
      <span tabIndex={-1} className={cn('flex shrink-0 items-center gap-1.5 text-2xs text-muted', className)} data-testid={testId} data-reviewed={p.reviewed} data-calls={p.calls}>
        {label && <span>{label}</span>}
        <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <span className={cn('absolute inset-y-0 left-0 rounded-full', left ? 'bg-accent' : 'bg-ok')} style={{ width: `${frac * 100}%` }} />
        </span>
        <span className="num whitespace-nowrap">
          {p.reviewed.toLocaleString('en-US')} / {p.calls.toLocaleString('en-US')} reviewed
        </span>
      </span>
    </Tooltip>
  )
}

/**
 * The sample's MOI, honestly: "MOI 1 (model) · up to 2 alleles called at
 * PfY1, PfY2" when the largest allele count differs from the model MOI.
 */
export function MoiLine({
  moi,
  maxAlleles,
  maxLoci,
  bootstrapThreshold,
  className,
}: {
  moi: number | null
  maxAlleles: number | null | undefined
  maxLoci: readonly LocusRef[] | undefined
  bootstrapThreshold?: number | null
  className?: string
}) {
  // Only more called alleles than the MOI is worth a word (a failed call has 0 and no MOI).
  const differs = maxAlleles != null && maxAlleles > (moi ?? 0)
  const where = (maxLoci ?? []).map((l) => l.locus_label).join(', ')
  return (
    <Tooltip
      content={
        <div className="max-w-xs space-y-1">
          <p>
            The model MOI comes from the probabilistic pass. It counts only alleles whose probability reaches the bootstrap threshold
            {bootstrapThreshold != null ? ` (${bootstrapThreshold})` : ''}, and by default takes the locus with the second-most such alleles, so one locus with a spurious
            extra peak does not raise it.
          </p>
          {maxAlleles != null && (
            <p className="text-muted">
              Called alleles count every allele called, whatever its probability: {maxAlleles} at most{where ? `, at ${where}` : ''}.
            </p>
          )}
        </div>
      }
    >
      <span tabIndex={-1} className={cn('text-xs text-muted', className)} data-testid="moi-line" data-moi={moi ?? ''} data-max-alleles={maxAlleles ?? ''}>
        MOI <b className="text-fg">{moi ?? '–'}</b>
        {differs && (
          <>
            {' '}
            (model) · <span className="text-warn">up to {maxAlleles} allele{maxAlleles === 1 ? '' : 's'} called</span>
            {where && ` at ${where}`}
          </>
        )}
      </span>
    </Tooltip>
  )
}

/** Icons for run-level flags; each has a distinct shape and a label. */
export function CallFlags({ v, size = 12 }: { v: CallView; size?: number }) {
  return (
    <span className="flex items-center gap-1">
      {v.noRun && (
        <Flag label="No run with usable sizing" className="text-danger">
          <Ban size={size} />
        </Flag>
      )}
      {v.failed && !v.noRun && (
        <Flag label="Failed: no peak above the failure threshold" className="text-danger">
          <OctagonAlert size={size} />
        </Flag>
      )}
      {v.offscale && (
        <Flag label="Off-scale signal: proportions unreliable" className="text-warn">
          <Zap size={size} />
        </Flag>
      )}
      {v.spectral && (
        <Flag label="Spectral breakdown: the dyes were not separated under a peak in a bin" className="text-warn">
          <Rainbow size={size} />
        </Flag>
      )}
      {v.curated && (
        <Flag label="Curated by hand" className="text-accent">
          <Hand size={size} />
        </Flag>
      )}
      {v.commented && (
        <Flag label={`Comment: ${v.row.comment ?? ''}`} className="text-muted">
          <MessageSquare size={size} />
        </Flag>
      )}
    </span>
  )
}

function Flag({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <Tooltip content={label}>
      <span tabIndex={-1} aria-label={label} role="img" className={cn('inline-flex', className)}>
        {children}
      </span>
    </Tooltip>
  )
}

function Swatch({ state }: { state: PeakState | 'expected' | 'narrow' }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const t = usePlotTheme()
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = 22 * dpr
    c.height = 18 * dpr
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.fillStyle = t.bg
    ctx.fillRect(0, 0, 22, 18)
    if (state === 'narrow') {
      drawPeakMarker(ctx, t, 'artifact', 11, 9, t.dyes.blue)
      ctx.strokeStyle = t.warn
      ctx.lineWidth = 1.5
      ctx.setLineDash([2, 2])
      ctx.beginPath()
      ctx.arc(11, 9, 7, 0, Math.PI * 2)
      ctx.stroke()
    } else if (state === 'expected') {
      ctx.fillStyle = withAlpha(t.fg, t.dark ? 0.16 : 0.1)
      ctx.fillRect(5, 3, 12, 12)
      ctx.strokeStyle = withAlpha(t.fg, t.dark ? 0.75 : 0.6)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(11.5, 3)
      ctx.lineTo(11.5, 15)
      ctx.moveTo(7, 3.5)
      ctx.lineTo(16, 3.5)
      ctx.moveTo(7, 14.5)
      ctx.lineTo(16, 14.5)
      ctx.stroke()
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(3, 9)
      ctx.lineTo(19, 9)
      ctx.stroke()
    } else drawPeakMarker(ctx, t, state, 11, 9, t.dyes.blue)
  }, [state, t])
  return <canvas ref={ref} style={{ width: 22, height: 18 }} aria-hidden className="shrink-0 rounded-[3px]" />
}

type LegendKey = PeakState | 'expected' | 'narrow'
const LEGEND: LegendKey[] = ['called', 'manual-on', 'manual-off', 'artifact', 'flagged', 'below', 'out-of-bin', 'candidate', 'narrow', 'expected']
const LEGEND_TEXT: Record<LegendKey, string> = { ...PEAK_STATE_TEXT, expected: 'Expected artifact ±1 SD', narrow: 'Narrow miss' }
const LEGEND_HELP: Record<LegendKey, string> = {
  narrow: 'Dashed amber ring: a binned peak one calling rule rejected by a small margin (just under the height limit after expected stutter, or a probability just under the threshold). Worth a look.',
  called: 'Called allele: in a bin, no flag, taller than artifacts explain.',
  'manual-on': 'Called by hand, although the automatic call left it out.',
  'manual-off': 'Removed by hand, although the automatic call included it.',
  artifact: 'Height explained by stutter (artifact) of the other peaks.',
  flagged: 'Pull-up from another dye (bleedthrough) or crosstalk from a neighboring capillary.',
  below: 'Too low: under the relative or absolute height limit on its own.',
  'out-of-bin': 'Unflagged, but outside every bin: not an allele of this locus.',
  candidate: 'In a bin and unflagged, but its probability is below the threshold.',
  expected: 'Bar: height that stutter of the other peaks is expected to produce at this peak, with ±1 SD. A peak well above its bar is a true allele even on a stutter position.',
}

/** One-line legend of peak markers; shapes, not only colors, carry the state. */
export function PeakLegend({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-0 text-2xs text-muted', className)} data-testid="peak-legend">
      {LEGEND.map((s) => (
        <span key={s} className="inline-flex items-center gap-0.5 whitespace-nowrap" title={LEGEND_HELP[s]}>
          <Swatch state={s} />
          {LEGEND_TEXT[s]}
        </span>
      ))}
    </div>
  )
}

/** Compact shortcut hints for a status bar. */
export function ShortcutHints({ onMore }: { onMore: () => void }) {
  return (
    <div className="flex items-center gap-2 text-2xs text-faint">
      <span><Kbd>J</Kbd>/<Kbd>K</Kbd> sample</span>
      <span><Kbd>H</Kbd>/<Kbd>L</Kbd> locus</span>
      <span><Kbd>N</Kbd> attention</span>
      <span><Kbd>U</Kbd> not reviewed</span>
      <span><Kbd>1</Kbd>–<Kbd>9</Kbd> toggle</span>
      <span><Kbd>↵</Kbd> reviewed, next</span>
      <span><Kbd>M</Kbd> mark</span>
      <button type="button" onClick={onMore} className="text-accent hover:underline">
        all shortcuts <Kbd>?</Kbd>
      </button>
    </div>
  )
}
