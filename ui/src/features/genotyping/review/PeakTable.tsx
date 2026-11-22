/**
 * Every peak of the shown run at the locus, with the numbers behind its
 * state, and the readout of the peak under the cursor in words.
 */
import { useEffect, useRef } from 'react'
import type { NarrowMiss, Peak } from '@/api/bindings'
import type { PeakState } from '@/components/TraceViewer'
import { cn } from '@/lib/cn'
import { fmtFixed, fmtProbability, fmtRfu } from '@/lib/format'
import { fmtShare, narrowMissShort, narrowMissText } from '../model/calls'
import { classifyPeak, flagWords, narrowMissOf, PEAK_STATE_TEXT, peakReasons, type CallContext } from '../model/peaks'

const STATE_CLASS: Record<PeakState, string> = {
  called: 'text-fg font-semibold',
  'manual-on': 'text-accent font-semibold',
  'manual-off': 'text-accent',
  artifact: 'text-muted',
  flagged: 'text-warn',
  below: 'text-faint',
  'out-of-bin': 'text-muted',
  candidate: 'text-muted',
}

export interface PeakRowModel {
  peak: Peak
  state: PeakState
  /** Number key that toggles it (1–9), if any. */
  n: number | null
  /** The engine's narrow miss this peak is, if any. */
  narrow: NarrowMiss | null
}

/** Shares of a called peak: the engine's numbers for its allele (the row), so they never lag a toggle. */
function sharesOf(p: Peak, ctx: CallContext): { share: number | null; corrected: number | null } {
  const a = p.bin_id != null ? ctx.alleleInfo?.get(p.bin_id) : undefined
  return { share: a?.proportion ?? null, corrected: a?.corrected_proportion ?? null }
}

export function PeakReadout({ row, ctx, isReference }: { row: PeakRowModel | null; ctx: CallContext; isReference: boolean }) {
  if (!row && ctx.failed) {
    return (
      <p className="px-3 py-1.5 text-xs text-danger" data-testid="peak-readout-failed">
        Failed: no peak is taller than the failure threshold{ctx.params ? ` (${ctx.params.failure_threshold} RFU)` : ''}, so nothing is called. Check the other runs of this
        sample, or toggle a bin by hand if the signal is real.
      </p>
    )
  }
  if (!row) {
    return (
      <p className="px-3 py-1.5 text-xs text-muted">
        Hover a peak for its numbers; click one (or press its number) to toggle its allele. <span className="text-faint">,</span> and{' '}
        <span className="text-faint">.</span> move the cursor.
      </p>
    )
  }
  const p = row.peak
  const reasons = peakReasons(p, ctx)
  return (
    <div className="flex flex-col gap-0.5 px-3 py-1.5 text-xs" data-testid="peak-readout" data-state={row.state}>
      <p>
        <span className="font-semibold">
          {row.n != null && <span className="mr-1 text-faint">[{row.n}]</span>}
          {fmtFixed(p.size, 2)} bp
        </span>
        <span className="text-muted"> · {fmtRfu(p.height)} RFU · {p.bin_label ? `bin ${p.bin_label}` : 'no bin'} · </span>
        <span className={STATE_CLASS[row.state]}>{PEAK_STATE_TEXT[row.state]}</span>
        {!isReference && <span className="text-faint"> (shown run is not the reference run; calls come from the reference)</span>}
      </p>
      <p className="text-muted">
        relative height {fmtShare(p.relative_height) || '0%'} · expected artifact {fmtRfu(p.artifact_contribution)} ± {fmtRfu(p.artifact_error)} RFU
        {p.probability != null && <> · P(allele) {fmtProbability(p.probability)}</>}
        {(row.state === 'called' || row.state === 'manual-on') && sharesOf(p, ctx).share != null && <> · share {fmtShare(sharesOf(p, ctx).share)}</>}
        {(row.state === 'called' || row.state === 'manual-on') && sharesOf(p, ctx).corrected != null && <> · bias-corrected {fmtShare(sharesOf(p, ctx).corrected)}</>}
        {p.pullup_contribution != null && p.pullup_error != null && (Math.abs(p.pullup_contribution) >= 10 || p.pullup_error >= 10 || p.flags.bleedthrough) ? (
          <> · expected pull-up {fmtRfu(p.pullup_contribution)} ± {fmtRfu(p.pullup_error)} RFU</>
        ) : (
          p.bleedthrough_ratio >= 0.5 && <> · pull-up ratio {p.bleedthrough_ratio.toFixed(2)}</>
        )}
        {p.crosstalk_ratio >= 0.5 && <> · crosstalk ratio {p.crosstalk_ratio.toFixed(2)}</>}
        {p.spectral_dip_ratio >= 0.25 && <> · other dye below baseline {p.spectral_dip_ratio.toFixed(2)}×</>}
      </p>
      {reasons.map((r) => (
        <p key={r} className="text-fg/90">
          {r}
        </p>
      ))}
    </div>
  )
}

export function PeakTable({
  rows,
  cursor,
  onCursor,
  onToggle,
  ctx,
}: {
  rows: readonly PeakRowModel[]
  cursor: number
  onCursor: (i: number) => void
  onToggle: (p: Peak) => void
  ctx: CallContext
}) {
  const body = useRef<HTMLTableSectionElement>(null)
  useEffect(() => {
    if (cursor >= 0) body.current?.querySelector(`[data-i="${cursor}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [cursor])
  return (
    <table className="w-full border-collapse text-[11.5px]" data-testid="peak-table">
      <thead className="sticky top-0 z-[1] bg-surface-2 text-2xs text-muted">
        <tr className="[&>th]:px-1 [&>th]:py-1 [&>th]:text-right [&>th]:font-semibold [&>th]:whitespace-nowrap">
          <th className="w-6 !text-center" title="Number key that toggles the allele">#</th>
          <th>Size</th>
          <th>Height</th>
          <th className="!text-left">Bin</th>
          <th title="Height relative to the tallest peak of the run">Rel.</th>
          <th title="Expected artifact height (stutter etc. of the other peaks) ± 1 SD, in RFU">Exp. artifact</th>
          <th title="Probability that the peak is a true allele (probabilistic pass)">P</th>
          <th title="Share of the called signal (height minus expected artifact, over every called peak)">Share</th>
          <th title="Share corrected for size-dependent amplification bias">Corr.</th>
          <th className="!text-left">State</th>
        </tr>
      </thead>
      <tbody ref={body}>
        {rows.map((r, i) => {
          const p = r.peak
          const called = r.state === 'called' || r.state === 'manual-on'
          const sh = called ? sharesOf(p, ctx) : null
          return (
            <tr
              key={`${p.index}-${i}`}
              data-i={i}
              data-size={p.size.toFixed(2)}
              data-state={r.state}
              data-narrow={r.narrow ? r.narrow.reason : undefined}
              onClick={() => onCursor(i)}
              onDoubleClick={() => p.bin_id != null && onToggle(p)}
              className={cn(
                'cursor-default border-b border-line/50 [&>td]:px-1 [&>td]:py-[2px] [&>td]:text-right [&>td]:whitespace-nowrap',
                i === cursor ? 'bg-accent-soft' : 'hover:bg-surface-3/50',
              )}
            >
              <td className="!text-center text-faint">{r.n ?? ''}</td>
              <td className="num">{fmtFixed(p.size, 2)}</td>
              <td className={cn('num', called && 'font-semibold')}>{fmtRfu(p.height)}</td>
              <td className="!text-left font-mono">{p.bin_label ?? <span className="text-faint">–</span>}</td>
              <td className="num">{fmtShare(p.relative_height)}</td>
              <td className="num text-muted">
                {p.artifact_contribution > 0 || p.artifact_error > 0 ? `${fmtRfu(p.artifact_contribution)} ± ${fmtRfu(p.artifact_error)}` : '–'}
              </td>
              <td className="num">{fmtProbability(p.probability)}</td>
              <td className="num">{sh ? fmtShare(sh.share) : ''}</td>
              <td className="num">{sh ? fmtShare(sh.corrected) : ''}</td>
              <td
                className={cn('!text-left whitespace-nowrap', STATE_CLASS[r.state])}
                title={r.narrow ? `Narrow miss: ${narrowMissText(r.narrow)}` : flagWords(p).join(', ') || undefined}
              >
                {PEAK_STATE_TEXT[r.state]}
                {r.narrow && (
                  <span className="ml-1 rounded-[3px] border border-dashed border-warn/70 px-1 text-2xs font-normal text-warn" data-testid="narrow-badge">
                    narrow miss · {narrowMissShort(r.narrow)}
                  </span>
                )}
              </td>
            </tr>
          )
        })}
        {rows.length === 0 && (
          <tr>
            <td colSpan={10} className="p-3 text-center text-muted">
              {ctx.failed ? 'The run failed: no peak cleared the failure threshold.' : 'No peaks in the locus range.'}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}

/** Peak rows (state + number key) for a set of peaks. */
export function peakRows(peaks: readonly Peak[], ctx: CallContext, numbered: readonly Peak[]): PeakRowModel[] {
  return peaks.map((p) => {
    const k = numbered.indexOf(p)
    return { peak: p, state: classifyPeak(p, ctx), n: k >= 0 && k < 9 ? k + 1 : null, narrow: narrowMissOf(p, ctx) }
  })
}
