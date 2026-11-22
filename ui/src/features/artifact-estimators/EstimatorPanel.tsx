/**
 * One artifact class: its plot (points, fitted segments with ±1 and ±2 SD
 * bands, breakpoints) and its segments, each with method, slope, intercept,
 * SD, R², point count, and what the fit predicts in words for an example
 * parent. Every edit is one engine call; the plot redraws from the response.
 */
import { Fragment, useState } from 'react'
import { Info, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import type { ArtifactEquation, ArtifactEstimatorView, ErrorEstimator, ProjectLocus, RegressionMethod } from '@/api/bindings'
import { ArtifactPlot, type ArtifactSegment } from '@/components/ArtifactPlot'
import { NumberInput, SelectInput } from '@/components/form/fields'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Spinner } from '@/components/ui/ProgressBar'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/cn'
import { countOf } from '@/lib/format'
import { breakpointsOf, className, ERROR_LABEL, ERROR_SHORT, GLOBAL_HELP, METHOD_HELP, METHOD_LABEL } from './model/classes'
import { callingSentence, expectation, expectedSentence, fitWarnings, pct, segmentAt, slopeText } from './model/expected'
import { useArtifactEdit, type ArtifactEdit } from './queries'

const METHODS: RegressionMethod[] = ['theil_sen', 'least_squares', 'ransac', 'no_slope']

/** Methods whose SD follows the chosen error estimate; least squares always uses RMS. */
const robustMethod = (m: RegressionMethod) => m !== 'least_squares'

export interface Example {
  size: number
  height: number
}

export interface EstimatorPanelProps {
  projectId: number
  locus: ProjectLocus
  estimator: ArtifactEstimatorView
  example: Example
  onExampleChange: (e: Partial<Example>) => void
  /** The locus's error-estimator parameter. */
  errorEstimator: ErrorEstimator
  /** Change it: re-fits every class at the locus in place and saves the parameter. */
  onErrorEstimatorChange: (e: ErrorEstimator) => void
  errorBusy?: boolean
  /** Names of projects that use this estimator (for the delete warning). */
  dependents: string[]
  onDeleted: () => void
}

export function EstimatorPanel({ projectId, locus, estimator, example, onExampleChange, errorEstimator, onErrorEstimatorChange, errorBusy, dependents, onDeleted }: EstimatorPanelProps) {
  const e = estimator
  const name = className(e.artifact_distance, locus.nucleotide_repeat_length)
  const edit = useArtifactEdit(projectId, locus.locus_id, e.id)
  const [selectedSeg, setSelectedSeg] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [newBp, setNewBp] = useState<number | null>(null)
  const busy = edit.isPending
  const run = (x: ArtifactEdit) => edit.mutateAsync(x).catch(() => undefined)

  const segments: ArtifactSegment[] = e.equations.map((q) => ({ start: q.segment.start_size, end: q.segment.end_size, slope: q.fit.slope, intercept: q.fit.intercept, sd: q.fit.sd }))
  const breakpoints = breakpointsOf(e)
  const exampleEq = segmentAt(e.equations, example.size)
  const exampleExp = exampleEq ? expectation(exampleEq.fit, example.size, example.height) : null
  const sel = selectedSeg != null && selectedSeg < e.equations.length ? selectedSeg : e.equations.indexOf(exampleEq!)
  const robust = e.equations.some((q) => robustMethod(q.segment.method))
  const classError = e.equations.find((q) => robustMethod(q.segment.method))?.segment.error ?? 'densest_half'

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface" data-testid="estimator-panel" data-class={name.label} data-estimator={e.id}>
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-3 py-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold" data-testid="class-title">
              {name.label}
            </h2>
            {name.global && (
              <Tooltip content={<p className="max-w-80">{GLOBAL_HELP}</p>}>
                <span tabIndex={0} className="text-faint outline-none" aria-label={GLOBAL_HELP}>
                  <Info size={12} />
                </span>
              </Tooltip>
            )}
            {busy && <Spinner className="size-3" />}
          </div>
          <p className="text-2xs text-muted">
            {name.description} {countOf(e.points.length, 'point')} from single-clone runs
            {e.artifact_distance_buffer != null && `, peaks within ±${e.artifact_distance_buffer.toFixed(2)} bp of the distance`}.
          </p>
        </div>
        <ErrorToggle value={errorEstimator} classValue={classError} applies={robust} busy={errorBusy} onChange={onErrorEstimatorChange} />
        <Button size="sm" variant="ghost" onClick={() => run({ type: 'refit' })} disabled={busy} title="Fit every segment again from the stored points" data-testid="refit">
          <RefreshCw size={12} /> Re-fit
        </Button>
        <Button size="sm" variant="ghost" onClick={() => run({ type: 'clear' })} disabled={busy || breakpoints.length === 0} title="One segment across the locus" data-testid="clear-breakpoints">
          <X size={12} /> Clear breakpoints
        </Button>
        <Button size="sm" variant="danger-ghost" onClick={() => setConfirmDelete(true)} disabled={busy} data-testid="delete-class">
          <Trash2 size={12} /> Delete
        </Button>
      </div>
      <div className="relative min-h-[220px] flex-1 p-1">
        <ArtifactPlot
          className="h-full w-full"
          points={e.points.map((p) => ({ x: p.parent_size, y: p.relative_height }))}
          segments={segments}
          breakpoints={breakpoints}
          onBreakpointsChange={(_bps, c) => void run(c.type === 'add' ? { type: 'add_breakpoint', size: c.x } : { type: 'remove_breakpoint', size: c.x })}
          color={locus.color}
          readOnly={busy}
          selectedSegment={sel >= 0 ? sel : null}
          onSegmentClick={setSelectedSeg}
          markers={exampleExp ? [{ x: example.size, y: Math.max(0, exampleExp.ratio), label: `${example.size} bp` }] : [{ x: example.size }]}
        />
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-line px-3 py-1 text-2xs text-muted">
        <span>Breakpoints:</span>
        {breakpoints.length === 0 && <span className="text-faint">none</span>}
        {breakpoints.map((b) => (
          <span key={b} className="inline-flex h-5 items-center gap-0.5 rounded-[4px] border border-warn/40 bg-warn-soft pr-0.5 pl-1.5 text-fg" data-testid="breakpoint-chip">
            <span className="num">{b.toFixed(1)} bp</span>
            <button
              type="button"
              className="grid size-4 place-items-center rounded text-muted hover:bg-surface-3 hover:text-fg disabled:opacity-40"
              onClick={() => run({ type: 'remove_breakpoint', size: b })}
              disabled={busy}
              aria-label={`Remove breakpoint at ${b.toFixed(1)} bp`}
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <form
          className="inline-flex items-center gap-1"
          onSubmit={(ev) => {
            ev.preventDefault()
            if (newBp != null) void run({ type: 'add_breakpoint', size: newBp }).then(() => setNewBp(null))
          }}
        >
          <NumberInput value={newBp} onChange={setNewBp} step={1} unit="bp" className="w-24 [&>input]:h-5 [&>input]:text-2xs" aria-label="Breakpoint size" placeholder="at" />
          <Button size="sm" variant="ghost" type="submit" disabled={newBp == null || busy} className="h-5" data-testid="add-breakpoint">
            <Plus size={11} /> Add
          </Button>
        </form>
        <span className="ml-auto text-faint">Double-click the plot to add a breakpoint, a breakpoint to remove it; click a segment to select it.</span>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface-2 px-3 py-1 text-xs">
        <span className="text-muted">Example parent</span>
        <NumberInput value={example.size} onChange={(v) => v != null && v > 0 && onExampleChange({ size: v })} step={5} unit="bp" className="w-24" aria-label="Example parent size" data-testid="example-size" />
        <NumberInput value={example.height} onChange={(v) => v != null && v > 0 && onExampleChange({ height: v })} step={1000} unit="RFU" className="w-28" aria-label="Example parent height" data-testid="example-height" />
        <span className="min-w-0 flex-1 text-2xs text-muted">
          {exampleEq && exampleExp ? callingSentence(name, exampleExp) : `No segment covers ${example.size} bp: a parent there contributes nothing.`}
        </span>
      </div>
      <SegmentTable
        equations={e.equations}
        name={name}
        distance={e.artifact_distance}
        example={example}
        selected={sel}
        onSelect={setSelectedSeg}
        busy={busy}
        onMethod={(index, method) => void run({ type: 'method', index, method })}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        destructive
        title={`Delete the ${name.label} class at ${locus.label}?`}
        description={
          <span data-testid="delete-class-text">
            {name.global
              ? 'Genotyping will no longer expect background on the other peaks of a run.'
              : `Genotyping will no longer expect an artifact ${name.label.replace(/ \(.*\)$/, '')} from any parent, so peaks there are judged on their own height: real stutter can then be called as a minor allele.`}{' '}
            {dependents.length ? `${dependents.join(', ')} ${dependents.length === 1 ? 'becomes' : 'become'} stale at ${locus.label}. ` : ''}
            Re-analyzing {locus.label} estimates every class again and brings it back.
          </span>
        }
        confirmLabel="Delete class"
        onConfirm={() => edit.mutateAsync({ type: 'delete' }).then(onDeleted, () => undefined)}
      />
    </div>
  )
}

function ErrorToggle({ value, classValue, applies, busy, onChange }: { value: ErrorEstimator; classValue: ErrorEstimator; applies: boolean; busy?: boolean; onChange: (v: ErrorEstimator) => void }) {
  const help =
    'How the SD of a Theil–Sen, RANSAC or no-slope fit is estimated. Densest half (the default) moves the line to the middle of the shortest band holding half the points ' +
    'and takes the SD from that half: minor alleles only ever add to a stutter position, so they raise neither. Robust MAD keeps the line: 1.4826 × the median absolute residual. ' +
    'RMS: root mean squared residual, which minor alleles inflate. The SD sets how far above its expected artifact height a peak must be to be called. The global class always uses MAD.'
  return (
    <div className="flex items-center gap-1 text-2xs text-muted" role="radiogroup" aria-label="Error estimate" data-testid="error-toggle" data-value={classValue}>
      <Tooltip content={<p className="max-w-80">{help}</p>}>
        <span tabIndex={0} className="inline-flex items-center gap-0.5 outline-none">
          SD by <Info size={10} />
        </span>
      </Tooltip>
      {(['densest_half', 'mad', 'rms'] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          disabled={busy || (value === v && (!applies || classValue === v))}
          onClick={() => onChange(v)}
          title={!applies ? 'Only least-squares segments in this class: its SD is always RMS' : undefined}
          className={cn('h-5 rounded-[4px] border px-1.5 disabled:cursor-default', value === v ? 'border-accent bg-accent-soft text-fg' : 'border-line hover:text-fg')}
          data-testid={`error-${v}`}
        >
          {ERROR_LABEL[v]}
        </button>
      ))}
      {busy && <Spinner className="size-3" />}
      {value !== classValue && applies && !busy && <span className="text-warn">this class uses {ERROR_SHORT[classValue]}</span>}
    </div>
  )
}

function SegmentTable({
  equations,
  name,
  distance,
  example,
  selected,
  onSelect,
  busy,
  onMethod,
}: {
  equations: ArtifactEquation[]
  name: ReturnType<typeof className>
  distance: number | null
  example: Example
  selected: number
  onSelect: (i: number) => void
  busy: boolean
  onMethod: (i: number, m: RegressionMethod) => void
}) {
  if (!equations.length) return <p className="border-t border-line p-3 text-xs text-muted">This class has no fitted segment.</p>
  return (
    <div className="max-h-[40%] min-h-[96px] shrink-0 overflow-auto border-t border-line" data-testid="segment-table">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-[1] bg-surface-2 text-2xs text-muted">
          <tr className="[&>th]:h-6 [&>th]:border-b [&>th]:border-line [&>th]:px-2 [&>th]:font-medium [&>th]:whitespace-nowrap">
            <th className="text-left">Parent size</th>
            <th className="text-left" title={METHODS.map((m) => `${METHOD_LABEL[m]}: ${METHOD_HELP[m]}`).join('\n')}>
              Method
            </th>
            <th className="text-right" title="Change of the artifact’s relative height per bp of parent size">
              Slope
            </th>
            <th className="text-right" title="Relative height at 0 bp (the line’s offset)">
              Intercept
            </th>
            <th className="text-right" title="Residual SD in relative height: the expected artifact’s error, per unit of parent height">
              SD
            </th>
            <th className="text-right" title="Coefficient of determination; below 0 means a flat mean would fit better">
              R²
            </th>
            <th className="text-right" title="Points the fit used">
              n
            </th>
          </tr>
        </thead>
        <tbody>
          {equations.map((q, i) => {
            const inside = segmentAt(equations, example.size) === q
            const size = inside ? example.size : Math.round((q.segment.start_size + q.segment.end_size) / 2)
            const warnings = fitWarnings(q)
            const robust = robustMethod(q.segment.method)
            const rowCls = i === selected ? 'bg-accent-soft' : 'hover:bg-surface-2'
            return (
              <Fragment key={`${q.segment.start_size}-${i}`}>
                <tr aria-selected={i === selected} onClick={() => onSelect(i)} className={cn('align-top [&>td]:px-2 [&>td]:pt-1', rowCls)} data-testid="segment-row">
                  <td className="num whitespace-nowrap">
                    {q.segment.start_size.toFixed(1)}–{q.segment.end_size.toFixed(1)} bp
                  </td>
                  <td className="w-[150px]" onClick={(ev) => ev.stopPropagation()}>
                    <SelectInput
                      value={q.segment.method}
                      onChange={(v) => v !== q.segment.method && onMethod(i, v as RegressionMethod)}
                      options={METHODS.map((m) => ({ value: m, label: <span title={METHOD_HELP[m]}>{METHOD_LABEL[m]}</span> }))}
                      disabled={busy}
                      aria-label={`Method of segment ${i + 1}`}
                      className="h-6 text-xs"
                    />
                  </td>
                  <td className="num text-right whitespace-nowrap" title={`${q.fit.slope.toExponential(3)} per bp`}>
                    {slopeText(q.fit.slope)}
                  </td>
                  <td className="num text-right" title={String(q.fit.intercept)}>
                    {pct(q.fit.intercept)}
                  </td>
                  <td className="num text-right whitespace-nowrap" title={robust ? `${ERROR_LABEL[q.segment.error]} error` : 'RMS error (this method always uses RMS)'}>
                    {pct(q.fit.sd)} <span className="text-2xs text-faint">{robust ? ERROR_SHORT[q.segment.error] : 'RMS'}</span>
                  </td>
                  <td className={cn('num text-right', q.segment.method !== 'no_slope' && q.fit.r_squared < 0 && 'text-warn')}>{q.fit.r_squared.toFixed(2)}</td>
                  <td className={cn('num text-right', q.n_points < 10 && 'text-warn')}>{q.n_points}</td>
                </tr>
                <tr className={cn('border-b border-line', rowCls)} onClick={() => onSelect(i)}>
                  <td colSpan={7} className="px-2 pt-0.5 pb-1.5 text-xs" data-testid="segment-sentence">
                    <span>{expectedSentence(name, distance, q.fit, size, example.height)}</span>
                    {!inside && <span className="text-faint"> (middle of this segment)</span>}
                    {warnings.length > 0 && <span className="mt-0.5 block text-2xs text-warn">{warnings.map((w) => w.text).join(' ')}</span>}
                  </td>
                </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
