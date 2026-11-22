/**
 * Plate quality: the issues the engine found on a plate (worst first, each
 * selectable to outline its wells on the grid), the pull-up and crosstalk
 * measured over the plate against the limits the default calling settings
 * assume, negative-control peaks, and the export. Also the small pieces the
 * plate list, the plate header, the well inspector and the import dialog use.
 */
import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import {
  CircleCheck,
  CircleDashed,
  Download,
  Info,
  OctagonAlert,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
} from 'lucide-react'
import type {
  Color,
  ControlSignal,
  Issue,
  PlateQuality,
  PlateQualityView,
  QualityLimits,
  QualitySummary,
  Severity,
  WellQuality,
} from '@/api/bindings'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/ProgressBar'
import { cn } from '@/lib/cn'
import { countOf, fmtNumber, fmtPercent, fmtRfu } from '@/lib/format'
import { useExport } from '@/features/projects-shared/exportCsv'
import {
  LEAK_LEVEL_LABEL,
  SEVERITY_LABEL,
  crosstalkLevel,
  crosstalkRows,
  findLeak,
  fmtFraction,
  fmtIssueValue,
  groupValues,
  issueCount,
  issuesForWell,
  limitsSentence,
  pullUpDyes,
  pullUpLevel,
  qualityLabel,
  sortIssues,
  WELL_FLAG_LABEL,
  type LeakLevel,
} from './model/quality'
import { useCheckQuality } from './useCheckQuality'

/** Stable identity of an issue within a report (kind and title are unique per report). */
export function issueKey(issue: Pick<Issue, 'kind' | 'title'>): string {
  return `${issue.kind}|${issue.title}`
}

// ------------------------------------------------------------------ severity

const SEVERITY_TEXT: Record<Severity, string> = { problem: 'text-danger', warning: 'text-warn', info: 'text-accent' }

export function SeverityIcon({ severity, size = 13, className }: { severity: Severity; size?: number; className?: string }) {
  const Icon = severity === 'problem' ? OctagonAlert : severity === 'warning' ? TriangleAlert : Info
  return <Icon size={size} aria-hidden className={cn('shrink-0', SEVERITY_TEXT[severity], className)} />
}

/** Icon and word, e.g. "⬣ Problem": never color alone. */
export function SeverityTag({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 text-2xs font-semibold tracking-wide uppercase',
        SEVERITY_TEXT[severity],
        className,
      )}
      data-severity={severity}
    >
      <SeverityIcon severity={severity} size={12} />
      {SEVERITY_LABEL[severity]}
    </span>
  )
}

/**
 * A plate's quality in a few words with the worst severity's icon: "1 problem,
 * 1 note", "No issues", "Not checked". `compact` shows the icon and the number
 * of issues (the words stay for screen readers and in the tooltip).
 */
export function QualityIndicator({
  summary,
  className,
  short,
  compact,
}: {
  summary: QualitySummary | null | undefined
  className?: string
  short?: boolean
  compact?: boolean
}) {
  const text = qualityLabel(summary)
  const n = issueCount(summary)
  const outdated = summary?.outdated ? ' (checked with older checks; check again)' : ''
  let icon: ReactNode
  if (!summary) icon = <CircleDashed size={13} aria-hidden className="shrink-0 text-faint" />
  else if (!summary.worst) icon = <CircleCheck size={13} aria-hidden className="shrink-0 text-ok" />
  else icon = <SeverityIcon severity={summary.worst} />
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1 text-xs',
        !summary ? 'text-muted' : summary.worst ? 'text-fg' : 'text-muted',
        className,
      )}
      title={`Quality: ${text}${outdated}`}
      data-testid="quality-indicator"
      data-worst={summary ? (summary.worst ?? 'none') : 'unchecked'}
    >
      {icon}
      {compact && n > 0 ? (
        <>
          <span aria-hidden className="num">
            {n}
          </span>
          <span className="sr-only">{text}</span>
        </>
      ) : (
        <span className={cn(short && 'truncate')}>{text}</span>
      )}
      {summary?.outdated && <span className="text-2xs text-warn">older checks</span>}
    </span>
  )
}

// ------------------------------------------------------------------ issues

export function IssueList({
  issues,
  selected,
  onSelect,
  onOpenWell,
}: {
  issues: readonly Issue[]
  selected: string | null
  onSelect: (key: string | null) => void
  onOpenWell?: (well: string) => void
}) {
  const sorted = sortIssues(issues)
  return (
    <ul className="flex flex-col gap-2" aria-label="Quality issues, worst first" data-testid="quality-issues">
      {sorted.map((issue) => {
        const key = issueKey(issue)
        return (
          <IssueCard
            key={key}
            issue={issue}
            selected={selected === key}
            onToggle={() => onSelect(selected === key ? null : key)}
            onOpenWell={onOpenWell}
          />
        )
      })}
    </ul>
  )
}

const VALUES_SHOWN = 8

function IssueCard({
  issue,
  selected,
  onToggle,
  onOpenWell,
}: {
  issue: Issue
  selected: boolean
  onToggle: () => void
  onOpenWell?: (well: string) => void
}) {
  const msgId = useId()
  const [all, setAll] = useState(false)
  const rows = groupValues(issue).flatMap((g) => g.values.map((v) => ({ well: g.well, v })))
  const shown = all ? rows : rows.slice(0, VALUES_SHOWN)
  return (
    <li
      className={cn(
        'rounded-md border bg-surface px-2.5 py-2 text-xs',
        selected ? 'border-accent bg-accent-soft/40' : 'border-line',
        issue.severity === 'problem' && !selected && 'border-l-[3px] border-l-danger',
        issue.severity === 'warning' && !selected && 'border-l-[3px] border-l-warn',
      )}
      data-testid="quality-issue"
      data-kind={issue.kind}
      data-severity={issue.severity}
      data-selected={selected || undefined}
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-describedby={msgId}
        onClick={onToggle}
        title={issue.wells.length ? (selected ? 'Stop outlining these wells on the plate' : 'Outline these wells on the plate') : undefined}
        className="-mx-1 flex w-[calc(100%+0.5rem)] flex-wrap items-center gap-x-2 gap-y-0.5 rounded px-1 py-0.5 text-left outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <SeverityTag severity={issue.severity} />
        <span className="font-semibold text-fg" data-testid="issue-title">
          {issue.title}
        </span>
        <span className="ml-auto text-2xs text-muted">
          {issue.wells.length ? `${countOf(issue.wells.length, 'well')}${selected ? ', outlined on the plate' : ''}` : 'whole plate'}
        </span>
      </button>
      <p id={msgId} className="mt-1 leading-[1.45] text-fg/90">
        {issue.message}
      </p>
      {issue.wells.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1" aria-label="Wells">
          <span className="mr-0.5 text-2xs text-faint">Wells</span>
          {issue.wells.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => onOpenWell?.(w)}
              disabled={!onOpenWell}
              title={`Show well ${w}`}
              className="num h-5 rounded-[4px] border border-line-strong px-1.5 text-2xs font-medium text-fg outline-none hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-default"
            >
              {w}
            </button>
          ))}
        </div>
      )}
      {rows.length > 0 && (
        <table className="mt-1.5 w-full text-2xs" aria-label={`Numbers behind “${issue.title}”`}>
          <tbody>
            {shown.map(({ well, v }, i) => (
              <tr key={i} className="border-t border-line/60">
                <td className="w-12 py-0.5 pr-2 text-muted">{well ?? 'Plate'}</td>
                <td className="py-0.5 pr-2 text-muted">{v.label}</td>
                <td className="num py-0.5 text-right text-fg">{fmtIssueValue(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows.length > VALUES_SHOWN && (
        <button type="button" className="mt-1 text-2xs text-accent hover:underline" onClick={() => setAll((a) => !a)}>
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </li>
  )
}

// ------------------------------------------------------------------ pull-up and crosstalk

function LevelMark({ level }: { level: LeakLevel | null }) {
  if (level !== 'warning' && level !== 'problem') return null
  return (
    <>
      <SeverityIcon severity={level} size={10} className="inline align-[-1px]" />
      <span className="sr-only">, {LEAK_LEVEL_LABEL[level]}</span>
    </>
  )
}

const LEVEL_CELL: Record<LeakLevel, string> = {
  ok: 'text-fg',
  warning: 'bg-warn-soft font-semibold text-warn',
  problem: 'bg-danger-soft font-semibold text-danger',
}

const cap = (c: string) => `${c[0]!.toUpperCase()}${c.slice(1)}`

function Dye({ color }: { color: Color }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden className="inline-block size-2 rounded-[2px]" style={{ background: `var(--dye-${color})` }} />
      {color}
    </span>
  )
}

/** Dye × dye pull-up table: source rows, target columns. */
export function PullUpMatrix({ report }: { report: Pick<PlateQuality, 'pull_up' | 'limits'> }) {
  const dyes = pullUpDyes(report)
  if (!dyes.length) return <p className="text-xs text-muted">Pull-up was not measured (too few tall peaks).</p>
  return (
    <table className="text-2xs" data-testid="pull-up-matrix" aria-label="Pull-up: share of each source dye’s signal seen in each other dye">
      <thead>
        <tr>
          <th scope="col" className="px-1.5 py-1 text-left font-normal text-faint">
            from ↓ into →
          </th>
          {dyes.map((t) => (
            <th key={t} scope="col" className="px-1.5 py-1 text-right font-medium text-muted">
              <Dye color={t} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {dyes.map((s) => (
          <tr key={s} className="border-t border-line/60">
            <th scope="row" className="px-1.5 py-1 text-left font-medium text-muted">
              <Dye color={s} />
            </th>
            {dyes.map((t) => {
              if (s === t)
                return (
                  <td key={t} className="px-1.5 py-1 text-right text-faint" aria-label="same dye">
                    ·
                  </td>
                )
              const l = findLeak(report, s, t)
              const level = pullUpLevel(l?.fraction ?? null, report.limits)
              const title = !l
                ? 'Not measured'
                : l.fraction == null
                  ? `${cap(s)} into ${t}: not measured, only ${countOf(l.peaks, 'tall peak')} of ${s} to measure from`
                  : `${cap(s)} into ${t}: ${fmtFraction(l.fraction)} of the ${s} signal${l.fraction < 0 ? ` (negative: ${t} dips under ${s} peaks)` : ''}, from ${countOf(l.peaks, 'peak')}${l.spread != null ? `, spread ${fmtFraction(l.spread)}` : ''}; ${LEAK_LEVEL_LABEL[level ?? 'ok']}`
              return (
                <td
                  key={t}
                  className={cn('num px-1.5 py-1 text-right whitespace-nowrap', level ? LEVEL_CELL[level] : 'text-faint')}
                  title={title}
                  data-source={s}
                  data-target={t}
                  data-level={level ?? 'none'}
                >
                  {l?.fraction == null ? '–' : fmtFraction(l.fraction)}
                  <LevelMark level={level} />
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const DISTANCE_LABEL = (d: number) => (d === 1 ? 'Next capillary' : `${d} capillaries away`)

/** Crosstalk to capillaries 1, 2 and 3 away, from ordinary and from off-scale peaks. */
export function CrosstalkTable({ report }: { report: Pick<PlateQuality, 'crosstalk' | 'limits'> }) {
  const rows = crosstalkRows(report)
  if (!rows.length) return <p className="text-xs text-muted">Crosstalk was not measured (too few tall peaks).</p>
  const anySaturated = rows.some((r) => r.saturated)
  const cell = (x: (typeof rows)[number]['normal']) => {
    if (!x) return <td className="px-1.5 py-1 text-right text-faint">–</td>
    const level = crosstalkLevel(x, report.limits)
    const title =
      x.fraction == null
        ? `Not measured: only ${countOf(x.peaks, 'source peak')}`
        : `${fmtFraction(x.fraction)} of the signal${x.saturated ? ' of off-scale peaks' : ''} leaks into ${DISTANCE_LABEL(x.distance).toLowerCase()}, from ${countOf(x.peaks, 'peak')}; ${LEAK_LEVEL_LABEL[level ?? 'ok']}`
    return (
      <td
        className={cn('num px-1.5 py-1 text-right whitespace-nowrap', level ? LEVEL_CELL[level] : 'text-faint')}
        title={title}
        data-distance={x.distance}
        data-saturated={x.saturated}
        data-level={level ?? 'none'}
      >
        {x.fraction == null ? '–' : fmtFraction(x.fraction)}
        <LevelMark level={level} />
      </td>
    )
  }
  return (
    <table className="text-2xs" data-testid="crosstalk-table" aria-label="Crosstalk: share of a peak’s signal seen in nearby capillaries">
      <thead>
        <tr>
          <th scope="col" className="px-1.5 py-1 text-left font-normal text-faint">
            leaks into
          </th>
          <th scope="col" className="px-1.5 py-1 text-right font-medium text-muted">
            from peaks
          </th>
          {anySaturated && (
            <th scope="col" className="px-1.5 py-1 text-right font-medium text-muted">
              from off-scale peaks
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.distance} className="border-t border-line/60">
            <th scope="row" className="px-1.5 py-1 text-left font-medium text-muted">
              {DISTANCE_LABEL(r.distance)}
            </th>
            {cell(r.normal)}
            {anySaturated && cell(r.saturated)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** What the marks mean and what the default limits cover. */
export function LimitsLegend({ report }: { report: Pick<PlateQuality, 'limits'> }) {
  return (
    <div className="flex flex-col gap-1 text-2xs text-muted" data-testid="limits-legend">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <span className="inline-flex items-center gap-1">
          <SeverityIcon severity="warning" size={10} /> above the warning limit
        </span>
        <span className="inline-flex items-center gap-1">
          <SeverityIcon severity="problem" size={10} /> above the problem limit
        </span>
        <span>– not measured (too few peaks)</span>
      </div>
      <p className="leading-[1.45]">{limitsSentence(report.limits)} Hover a value for the number of peaks behind it.</p>
    </div>
  )
}

const EXPLAINED: Record<'crosstalk' | 'pull_up', string> = {
  crosstalk: 'Crosstalk from a nearby capillary',
  pull_up: 'Pull-up from another dye',
}

export function ControlsTable({
  report,
  hasPlateMap,
}: {
  report: Pick<PlateQuality, 'controls' | 'controls_checked'> & { limits?: Pick<QualityLimits, 'control_height_limit'> }
  hasPlateMap?: boolean
}) {
  if (!report.controls_checked)
    return (
      <p className="text-xs text-muted">
        {hasPlateMap
          ? 'Negative controls were not checked against the plate map yet. Check again to include them.'
          : 'Negative controls are checked once a plate map names them.'}
      </p>
    )
  if (!report.controls.length)
    return (
      <p className="text-xs text-muted">
        {report.limits
          ? `No peaks above ${fmtRfu(report.limits.control_height_limit)} RFU in the negative controls.`
          : 'No peaks above the calling limit in the negative controls.'}
      </p>
    )
  return (
    <table className="w-full text-2xs" data-testid="controls-table" aria-label="Peaks in negative controls">
      <thead>
        <tr className="text-faint">
          <th scope="col" className="px-1.5 py-1 text-left font-normal">
            Well
          </th>
          <th scope="col" className="px-1.5 py-1 text-left font-normal">
            Locus
          </th>
          <th scope="col" className="px-1.5 py-1 text-right font-normal">
            Tallest peak
          </th>
          <th scope="col" className="px-1.5 py-1 text-left font-normal">
            Explained by
          </th>
        </tr>
      </thead>
      <tbody>
        {report.controls.map((c: ControlSignal, i) => (
          <tr
            key={i}
            className="border-t border-line/60"
            title={`${c.sample}: ${countOf(c.peaks, 'peak')} above the limit, tallest ${fmtNumber(c.size, 1)} bp`}
          >
            <td className="num px-1.5 py-1 font-medium">{c.well}</td>
            <td className="px-1.5 py-1">
              <span className="inline-flex items-center gap-1">
                <span aria-hidden className="inline-block size-2 rounded-[2px]" style={{ background: `var(--dye-${c.color})` }} />
                {c.locus}
              </span>
            </td>
            <td className="num px-1.5 py-1 text-right">{fmtRfu(c.height)} RFU</td>
            <td className="px-1.5 py-1">
              {c.explained_by ? (
                <span className="text-muted">{EXPLAINED[c.explained_by]}</span>
              ) : (
                <span className="inline-flex items-center gap-1 font-medium text-danger">
                  <SeverityIcon severity="problem" size={10} /> Not explained
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ------------------------------------------------------------------ the panel

function Section({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <section className="flex flex-col gap-1.5" data-testid={testId} aria-label={title}>
      <h3 className="text-2xs font-semibold tracking-wide text-faint uppercase">{title}</h3>
      {children}
    </section>
  )
}

function fmtComputed(iso: string | null): string {
  return iso ? `${iso.slice(0, 16).replace('T', ' ')} UTC` : '–'
}

export function QualityPanel({
  view,
  loading,
  hasPlateMap,
  selectedIssue,
  onSelectIssue,
  onOpenWell,
}: {
  view: PlateQualityView | null
  loading?: boolean
  /** The plate has a plate map (so its negative controls can be checked). */
  hasPlateMap?: boolean
  selectedIssue: string | null
  onSelectIssue: (key: string | null) => void
  onOpenWell: (well: string) => void
}) {
  const { check, busy } = useCheckQuality()
  const exp = useExport('plate_quality', view?.plate_id ?? -1)
  if (!view) {
    return (
      <div className="grid flex-1 place-items-center bg-surface text-xs text-muted">
        {loading ? <Spinner /> : 'Could not load the quality report.'}
      </div>
    )
  }
  const report = view.report
  if (!report) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-2 bg-surface px-6 text-center"
        data-testid="quality-panel"
        data-state="unchecked"
      >
        <CircleDashed size={22} className="text-faint" aria-hidden />
        <h3 className="text-sm font-semibold">Quality not checked yet</h3>
        <p className="max-w-sm text-xs text-muted">
          {view.plate_label} was imported before quality checks existed. Checking measures every well’s ladder, signal and noise, the
          pull-up between dyes and the crosstalk between capillaries, and lists anything to look at.
        </p>
        <Button size="sm" variant="primary" onClick={() => check([view.plate_id])} disabled={busy}>
          {busy ? <Spinner className="size-3" /> : <ShieldCheck size={12} />} Check quality
        </Button>
      </div>
    )
  }
  const sorted = sortIssues(report.issues)
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface" data-testid="quality-panel" data-state={sorted.length ? 'issues' : 'clean'}>
      <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-2 py-1">
        <QualityIndicator summary={view.summary} className="font-medium" />
        <span className="text-2xs text-faint" title="When the quality report was computed">
          checked {fmtComputed(view.computed_at)}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button asChild size="sm" variant="ghost" title="Change plate quality limits in Settings">
            <Link to="/settings">
              <SlidersHorizontal size={12} /> Limits
            </Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => check([view.plate_id])}
            disabled={busy}
            title="Measure this plate’s quality again"
          >
            {busy ? <Spinner className="size-3" /> : <RefreshCw size={12} />} Check again
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void exp.run()}
            disabled={exp.busy}
            data-testid="export-quality"
            title="One row per well with its measures and the plate’s values"
          >
            {exp.busy ? <Spinner className="size-3" /> : <Download size={12} />} Export quality CSV
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-2.5">
        {view.summary?.outdated && (
          <p className="rounded-md bg-warn-soft px-2 py-1 text-xs text-warn" role="status">
            This report was made with an older version of the checks. Check again to bring it up to date.
          </p>
        )}
        {sorted.length ? (
          <IssueList issues={sorted} selected={selectedIssue} onSelect={onSelectIssue} onOpenWell={onOpenWell} />
        ) : (
          <div
            className="flex items-start gap-2 rounded-md border border-line bg-ok-soft/50 px-2.5 py-2 text-xs"
            data-testid="quality-clean"
          >
            <CircleCheck size={15} className="mt-px shrink-0 text-ok" aria-hidden />
            <div>
              <div className="font-semibold text-fg">No issues found</div>
              <p className="text-muted">
                Every well’s ladder, signal, noise and dye separation, and the plate’s pull-up and crosstalk, are within the usual range.
                The measurements are below.
              </p>
            </div>
          </div>
        )}
        <Section title="Pull-up between dyes" testId="quality-pull-up">
          <p className="text-2xs text-muted">
            Share of a dye’s signal that shows in another dye at the same point, over the plate. Negative values are dips.
          </p>
          <div className="overflow-x-auto">
            <PullUpMatrix report={report} />
          </div>
        </Section>
        <Section title="Crosstalk between capillaries" testId="quality-crosstalk">
          <p className="text-2xs text-muted">Share of a peak’s signal that shows in the same dye in nearby capillaries.</p>
          <div className="overflow-x-auto">
            <CrosstalkTable report={report} />
          </div>
          <LimitsLegend report={report} />
        </Section>
        <Section title="Negative controls" testId="quality-controls">
          <ControlsTable report={report} hasPlateMap={hasPlateMap} />
        </Section>
        <Section title="Plate">
          <p className="text-2xs text-muted">
            {countOf(report.wells.length, 'well')} measured; median ladder height{' '}
            {report.ladder_height == null ? '–' : `${fmtRfu(report.ladder_height)} RFU`}. Color the plate by a measure with the Quality view
            of the plate.
          </p>
        </Section>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ one well

/** The selected well's own quality measures and the issues that name it (well inspector). */
export function WellQualityBar({ report, well, onShowIssue }: { report: PlateQuality; well: string; onShowIssue: (key: string) => void }) {
  const w: WellQuality | undefined = report.wells.find((x) => x.well === well)
  if (!w) return null
  const issues = issuesForWell(report.issues, well)
  const fact = (label: string, value: ReactNode, title?: string, tone?: string) => (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap" title={title}>
      <span className="text-faint">{label}</span>
      <span className={cn('num text-fg', tone)}>{value}</span>
    </span>
  )
  const flagged = (f: WellQuality['flags'][number]) => (w.flags.includes(f) ? 'text-danger font-semibold' : undefined)
  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-line px-2 py-1 text-2xs"
      data-testid="well-quality"
      aria-label={`Quality of well ${well}`}
    >
      <span className="font-semibold text-muted">Quality</span>
      {w.capillary != null && fact('capillary', w.capillary)}
      {fact(
        'ladder',
        w.ladder_height == null ? 'none' : `${fmtRfu(w.ladder_height)} RFU`,
        `Median height of the ladder peaks${report.ladder_height != null ? `; plate median ${fmtRfu(report.ladder_height)} RFU` : ''}`,
        flagged('low_ladder'),
      )}
      {w.ladder_fade != null &&
        fact(
          'fade',
          fmtPercent(w.ladder_fade),
          'Height of the last third of the ladder peaks over the first third',
          flagged('ladder_fading'),
        )}
      {w.plate_error != null &&
        fact(
          'plate error',
          `${fmtNumber(w.plate_error, 2)} bp`,
          'Largest disagreement of this ladder with the plate’s other wells',
          flagged('ladder_disagrees'),
        )}
      {fact(
        'signal',
        w.signal == null ? '–' : `${fmtRfu(w.signal)} RFU`,
        'Strongest sample-dye signal in the sized range',
        flagged('weak_injection'),
      )}
      <span className="inline-flex items-baseline gap-1 whitespace-nowrap" title="Noise (standard deviation of the baseline) per dye, RFU">
        <span className="text-faint">noise</span>
        {w.dyes.map((d) => (
          <span key={d.color} className={cn('num inline-flex items-center gap-0.5', flagged('noisy') ?? 'text-fg')}>
            <span aria-hidden className="inline-block size-1.5 rounded-[1px]" style={{ background: `var(--dye-${d.color})` }} />
            <span className="sr-only">{d.color}</span>
            {fmtNumber(d.noise_sd, 1)}
          </span>
        ))}
      </span>
      {fact(
        'breakdowns',
        `${w.breakdowns} of ${w.tall_peaks}`,
        'Tall peaks at a spectral breakdown (another dye dips below its baseline under them), of the tall peaks checked',
        flagged('unseparated_dyes'),
      )}
      {w.spectral_deviation != null &&
        fact(
          'ladder pull-up off the plate’s',
          fmtFraction(w.spectral_deviation),
          `How far this capillary’s ladder pull-up into other dyes differs from the plate’s typical capillary; ${fmtFraction(report.limits.spectral_deviation_limit)} or more means the dyes are not separated`,
          flagged('unseparated_dyes'),
        )}
      {w.offscale_points > 0 && fact('off-scale', countOf(w.offscale_points, 'point'), 'Off-scale scans in the sample dyes', 'text-warn')}
      {w.flags.length > 0 && issues.length === 0 && <span className="text-muted">{w.flags.map((f) => WELL_FLAG_LABEL[f]).join(', ')}</span>}
      {issues.map((i) => (
        <button
          key={issueKey(i)}
          type="button"
          onClick={() => onShowIssue(issueKey(i))}
          className="inline-flex items-center gap-1 rounded px-1 font-medium text-fg outline-none hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-accent/40"
          title={`${SEVERITY_LABEL[i.severity]}: ${i.message}`}
          data-testid="well-issue"
        >
          <SeverityIcon severity={i.severity} size={11} />
          <span className="sr-only">{SEVERITY_LABEL[i.severity]}:</span>
          {i.title}
        </button>
      ))}
    </div>
  )
}
