/**
 * Quantification-bias estimators. `/quant-bias` lists them; `/quant-bias/:id`
 * is one estimator with tabs: per-locus β (`tab=locus&locus=5`), the
 * overview across loci, and the control mixtures it is estimated from.
 *
 * PCR amplifies shorter fragments more efficiently, so short alleles look
 * over-represented in a mixture's peak heights. From control mixtures
 * (known strains in known proportions) the estimator measures that effect
 * per locus as β, which genotyping projects use to correct allele shares.
 */
import { SetupSteps } from '@/features/projects-shared/SetupSteps'
import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ChevronLeft, Download, Play, Scale } from 'lucide-react'
import type { ProjectSummary } from '@/api/bindings'
import type { DataColumn } from '@/components/DataTable'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState, NotFound } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/ProgressBar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { ListDetailLayout, Page, PageHeader } from '@/layouts/layouts'
import { cn } from '@/lib/cn'
import { KINDS } from '@/features/projects-shared/kinds'
import { LocusStatusList } from '@/features/projects-shared/LocusStatusList'
import { ProjectHeader } from '@/features/projects-shared/ProjectHeader'
import { ProjectList } from '@/features/projects-shared/ProjectList'
import { useProject, useProjects } from '@/features/projects-shared/queries'
import { useExport } from '@/features/projects-shared/exportCsv'
import { lociNeedingAnalysis, projectOverall } from '@/features/projects-shared/status'
import { fitIssues, fmtBeta } from './model/beta'
import { LocusTab } from './LocusTab'
import { MixturesTab } from './MixturesTab'
import { OverviewTab } from './OverviewTab'
import { useAllLocusQuantBias } from './queries'

const PATH = KINDS.quant_bias_estimator.path

export default function QuantBiasPage() {
  const { id } = useParams()
  const projectId = id != null && /^\d+$/.test(id) ? Number(id) : null
  return projectId == null ? <Index /> : <Workspace key={projectId} projectId={projectId} />
}

function Index() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<number | null>(null)
  const none = useProjects('quant_bias_estimator').data?.length === 0
  const detail = useProject(selected)
  const extra = useMemo<DataColumn<ProjectSummary>[]>(
    () => [{ id: 'bins', header: 'Bin estimator', value: (p) => p.bin_estimator?.title ?? '', width: 130 }],
    [],
  )
  return (
    <Page header={<PageHeader title="Quantification bias" icon={<Scale />} subtitle="Correct allele shares for PCR's preference for short fragments" />}>
      <ListDetailLayout
        id="quant-bias-projects"
        listWidth={760}
        minListWidth={420}
        list={
          <ProjectList
            kind="quant_bias_estimator"
            selectedId={selected}
            onSelect={setSelected}
            onOpen={(pid) => navigate(`${PATH}/${pid}`)}
            onCreated={(d) => navigate(`${PATH}/${d.project.id}?tab=mixtures`)}
            onDeleted={() => setSelected(null)}
            extraColumns={extra}
          />
        }
        detail={
          selected == null && none ? (
            <SetupSteps current="quant_bias_estimator" />
          ) : selected == null ? (
            <EmptyState icon={<Scale />} title="Select an estimator">
              <p>
                In a mixed infection, peak heights stand in for how much of the sample each clone makes up. PCR amplifies shorter fragments more efficiently, so short alleles look
                over-represented.
              </p>
              <p className="mt-1.5">
                A quantification-bias estimator measures that effect per locus from control mixtures (lab strains mixed in known proportions). Genotyping projects that link it correct
                their allele shares. Double-click an estimator to open it.
              </p>
            </EmptyState>
          ) : !detail.data ? (
            <EmptyState title="Loading…" />
          ) : (
            <Preview projectId={selected} onOpen={(q) => navigate(`${PATH}/${selected}${q}`)} />
          )
        }
      />
    </Page>
  )
}

function Preview({ projectId, onOpen }: { projectId: number; onOpen: (query: string) => void }) {
  const detail = useProject(projectId).data!
  const qs = useAllLocusQuantBias(
    projectId,
    detail.loci.map((l) => l.locus_id),
  )
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface" data-testid="project-overview">
      <div className="border-b border-line p-3">
        <h2 className="text-[15px] font-semibold">{detail.project.title}</h2>
        {detail.project.description && <p className="mt-0.5 text-xs text-muted">{detail.project.description}</p>}
        <p className="mt-1 text-xs text-muted">
          {detail.project.sample_count} control mixtures · {projectOverall(detail.project).sentence}
        </p>
        <div className="mt-2 flex gap-2">
          <Button variant="primary" onClick={() => onOpen('')}>
            <Play size={12} /> Open
          </Button>
          <Button onClick={() => onOpen('?tab=mixtures')}>Mixtures</Button>
        </div>
      </div>
      <LocusStatusList
        detail={detail}
        selected={null}
        onSelect={(l) => onOpen(`?tab=locus&locus=${l}`)}
        className="min-h-0 flex-1"
        trailing={(l) => {
          const est = qs.find((q) => q.data?.locus_id === l.locus_id)?.data?.estimate
          if (est === undefined) return null
          const bad = fitIssues(est).some((i) => i.level === 'danger')
          return <span className={cn('num text-xs', bad ? 'font-semibold text-danger' : 'text-muted')}>{est ? `β ${fmtBeta(est.beta)}` : 'no β'}</span>
        }}
      />
    </div>
  )
}

const TABS = ['locus', 'overview', 'mixtures'] as const
type Tab = (typeof TABS)[number]
const TAB_LABEL: Record<Tab, string> = { locus: 'Per locus', overview: 'Overview', mixtures: 'Control mixtures' }

function Workspace({ projectId }: { projectId: number }) {
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams()
  const project = useProject(projectId)
  const exp = useExport('peaks', projectId)
  const [confirmExport, setConfirmExport] = useState(false)
  const tab = (TABS as readonly string[]).includes(search.get('tab') ?? '') ? (search.get('tab') as Tab) : 'locus'
  const lv = search.get('locus')
  const locusId = lv != null && /^\d+$/.test(lv) ? Number(lv) : null

  const select = useCallback(
    (sel: { tab?: Tab; locus?: number }, replace = false) =>
      setSearch(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (sel.tab) next.set('tab', sel.tab)
          if (sel.locus != null) next.set('locus', String(sel.locus))
          return next
        },
        { replace },
      ),
    [setSearch],
  )
  const onSelectLocus = useCallback((l: number, replace?: boolean) => select({ locus: l }, replace), [select])

  if (project.isLoading)
    return (
      <div className="grid h-full place-items-center text-muted">
        <Spinner />
      </div>
    )
  const back = (
    <Button asChild size="sm">
      <Link to={PATH}>All quantification-bias estimators</Link>
    </Button>
  )
  if (project.isError || !project.data)
    return (
      <NotFound what="quantification-bias estimator" error={project.error ?? undefined} back={{ to: PATH, label: 'All quantification-bias estimators' }} />
    )
  const detail = project.data
  if (detail.project.kind !== 'quant_bias_estimator') return <EmptyState title="Not a quantification-bias estimator" action={back} />
  const p = detail.project
  const stale = p.stale_loci > 0
  const notCurrent = lociNeedingAnalysis(detail.loci)

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col" data-testid="quant-bias-workspace" data-project={p.title}>
      <ProjectHeader
        detail={detail}
        selectedLocusIds={locusId != null ? [locusId] : undefined}
        leading={
          <Button asChild size="icon-sm" variant="ghost" aria-label="All quantification-bias estimators" title="All quantification-bias estimators">
            <Link to={PATH}>
              <ChevronLeft size={15} />
            </Link>
          </Button>
        }
        actions={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => (notCurrent.length ? setConfirmExport(true) : void exp.run())}
            disabled={exp.busy || p.sample_count === 0}
            data-testid="export-peaks"
            title={p.sample_count === 0 ? 'Assign control mixtures and analyze first' : "Every peak of each mixture's reference run, with its control, true share, observed and corrected share, and whether it entered the fit"}
          >
            {exp.busy ? <Spinner className="size-3" /> : <Download size={12} />} Export peak data CSV
          </Button>
        }
        onDuplicated={(nid) => navigate(`${PATH}/${nid}`)}
        onDeleted={() => navigate(PATH)}
      />
      <ConfirmDialog
        open={confirmExport}
        onOpenChange={setConfirmExport}
        title="Export results that are not current?"
        description={
          <span data-testid="export-not-current">
            {notCurrent.map((l) => `${l.label} is ${l.status.state === 'not_analyzed' ? 'not analyzed (no rows)' : 'stale (the file would hold the previous analysis)'}`).join('; ')}.
            Re-analyze first for current numbers.
          </span>
        }
        confirmLabel="Export anyway"
        onConfirm={() => exp.run({ allowStale: true })}
      />
      <Tabs value={tab} onValueChange={(v) => select({ tab: v as Tab })} className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TabsList className="shrink-0 bg-surface px-2">
          {TABS.map((t) => (
            <TabsTrigger key={t} value={t} data-tab={t}>
              {TAB_LABEL[t]}
              {t === 'overview' && stale && <span className="ml-1 size-1.5 rounded-full bg-warn" aria-label="some loci stale" />}
              {t === 'mixtures' && <span className="num ml-0.5 text-2xs text-faint">{p.sample_count}</span>}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="locus" className="flex min-h-0 flex-col" forceMount hidden={tab !== 'locus'}>
          <LocusTab detail={detail} locusId={locusId} onSelectLocus={onSelectLocus} onOpenMixtures={() => select({ tab: 'mixtures' })} active={tab === 'locus'} />
        </TabsContent>
        <TabsContent value="overview" className="flex min-h-0 flex-col">
          <OverviewTab detail={detail} onOpenLocus={(l) => select({ tab: 'locus', locus: l })} />
        </TabsContent>
        <TabsContent value="mixtures" className="flex min-h-0 flex-col">
          <MixturesTab detail={detail} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
