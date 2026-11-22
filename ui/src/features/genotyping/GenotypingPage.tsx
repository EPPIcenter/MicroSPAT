/**
 * Genotyping projects. `/projects` lists them; `/projects/:id` is a
 * project's workspace with tabs (review, sample view, probabilities,
 * summary, samples, export: `tab=review|sample|probabilities|summary|samples|export`). The tab, locus and sample are in the query
 * string: `/projects/4?tab=review&locus=5&sample=93`.
 */
import { SetupSteps } from '@/features/projects-shared/SetupSteps'
import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ChevronLeft, FolderKanban, Play } from 'lucide-react'
import { ListDetailLayout, Page, PageHeader } from '@/layouts/layouts'
import { Button } from '@/components/ui/Button'
import { EmptyState, NotFound } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/ProgressBar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { cn } from '@/lib/cn'
import { LocusStatusList } from '@/features/projects-shared/LocusStatusList'
import { ProjectHeader } from '@/features/projects-shared/ProjectHeader'
import { ProjectList } from '@/features/projects-shared/ProjectList'
import { useProject, useProjects } from '@/features/projects-shared/queries'
import { projectOverall } from '@/features/projects-shared/status'
import { ExportTab } from './ExportTab'
import { ProbabilitiesTab } from './ProbabilitiesTab'
import { ReviewTab } from './review/ReviewTab'
import { SampleSetTab } from './SampleSetTab'
import { SampleView } from './SampleView'
import { SummaryTab } from './SummaryTab'
import { useSummary } from './queries'
import { ReviewProgressBar } from './review/parts'
import type { ProjectDetail } from '@/api/bindings'

export default function GenotypingPage() {
  const { id } = useParams()
  const projectId = id != null && /^\d+$/.test(id) ? Number(id) : null
  return projectId == null ? <ProjectsIndex /> : <ProjectWorkspace key={projectId} projectId={projectId} />
}

function ProjectsIndex() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<number | null>(null)
  const none = useProjects('genotyping').data?.length === 0
  const detail = useProject(selected)
  return (
    <Page header={<PageHeader title="Genotyping projects" icon={<FolderKanban />} subtitle="Call alleles in mixed samples" />}>
      <ListDetailLayout
        id="genotyping-projects"
        listWidth={720}
        minListWidth={420}
        list={
          <ProjectList
            kind="genotyping"
            selectedId={selected}
            onSelect={setSelected}
            onOpen={(pid) => navigate(`/projects/${pid}`)}
            onCreated={(d) => navigate(`/projects/${d.project.id}?tab=samples`)}
            onDeleted={() => setSelected(null)}
          />
        }
        detail={
          selected == null && none ? (
            <SetupSteps current="genotyping" />
          ) : selected == null || !detail.data ? (
            <EmptyState title={selected == null ? 'Select a project' : 'Loading…'}>
              {selected == null && 'Double-click a project, or press Enter, to open its review workspace.'}
            </EmptyState>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col bg-surface" data-testid="project-overview">
              <div className="border-b border-line p-3">
                <h2 className="text-[15px] font-semibold">{detail.data.project.title}</h2>
                {detail.data.project.description && <p className="mt-0.5 text-xs text-muted">{detail.data.project.description}</p>}
                <p className="mt-1 text-xs text-muted">{projectOverall(detail.data.project).sentence}</p>
                <Button className="mt-2" variant="primary" onClick={() => navigate(`/projects/${selected}`)}>
                  <Play size={12} /> Open review
                </Button>
              </div>
              <OverviewLoci detail={detail.data} onOpen={(l) => navigate(`/projects/${selected}?tab=review&locus=${l}`)} />
            </div>
          )
        }
      />
    </Page>
  )
}

/** Loci of the selected project with what is left to review, so a returning reviewer sees it before opening. */
function OverviewLoci({ detail, onOpen }: { detail: ProjectDetail; onOpen: (locusId: number) => void }) {
  const summary = useSummary(detail.project.id)
  const by = new Map((summary.data?.loci ?? []).map((l) => [l.locus_id, { calls: l.calls ?? 0, reviewed: l.reviewed ?? 0 }]))
  const total = [...by.values()].reduce((a, b) => ({ calls: a.calls + b.calls, reviewed: a.reviewed + b.reviewed }), {
    calls: 0,
    reviewed: 0,
  })
  return (
    <>
      {total.calls > 0 && (
        <div className="border-b border-line px-3 py-1.5">
          <ReviewProgressBar p={total} label="Review" testId="overview-review-progress" />
        </div>
      )}
      <LocusStatusList
        detail={detail}
        selected={null}
        onSelect={onOpen}
        className="min-h-0 flex-1"
        trailing={(l) => {
          const p = by.get(l.locus_id)
          return p && p.calls ? (
            <span className={cn('num text-2xs', p.reviewed >= p.calls ? 'text-ok' : 'text-muted')}>
              {p.reviewed}/{p.calls} reviewed
            </span>
          ) : null
        }}
      />
    </>
  )
}

const TABS = ['review', 'sample', 'probabilities', 'summary', 'samples', 'export'] as const
type Tab = (typeof TABS)[number]
const TAB_LABEL: Record<Tab, string> = {
  review: 'Review',
  sample: 'Sample view',
  probabilities: 'Probabilities',
  summary: 'Summary',
  samples: 'Samples',
  export: 'Export',
}

function ProjectWorkspace({ projectId }: { projectId: number }) {
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams()
  const project = useProject(projectId)
  const tab = (TABS as readonly string[]).includes(search.get('tab') ?? '') ? (search.get('tab') as Tab) : 'review'
  const num = (k: string) => {
    const v = search.get(k)
    return v != null && /^\d+$/.test(v) ? Number(v) : null
  }
  const locusId = num('locus')
  const sampleId = num('sample')

  const select = useCallback(
    (sel: { tab?: Tab; locus?: number; sample?: number | null }, replace = false) => {
      setSearch(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (sel.tab) next.set('tab', sel.tab)
          if (sel.locus != null) next.set('locus', String(sel.locus))
          if (sel.sample === null) next.delete('sample')
          else if (sel.sample != null) next.set('sample', String(sel.sample))
          return next
        },
        { replace },
      )
    },
    [setSearch],
  )

  if (project.isLoading)
    return (
      <div className="grid h-full place-items-center text-muted">
        <Spinner />
      </div>
    )
  if (project.isError || !project.data) {
    return <NotFound what="project" error={project.error ?? undefined} back={{ to: '/projects', label: 'All genotyping projects' }} />
  }
  const detail = project.data
  if (detail.project.kind !== 'genotyping') {
    return (
      <EmptyState
        title="Not a genotyping project"
        action={
          <Button asChild size="sm">
            <Link to="/projects">All genotyping projects</Link>
          </Button>
        }
      />
    )
  }
  const p = detail.project
  const probStale = p.probabilities?.state === 'stale'

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col" data-testid="genotyping-workspace" data-project={p.title}>
      <ProjectHeader
        detail={detail}
        leading={
          <Button asChild size="icon-sm" variant="ghost" aria-label="All genotyping projects" title="All genotyping projects">
            <Link to="/projects">
              <ChevronLeft size={15} />
            </Link>
          </Button>
        }
        onDuplicated={(nid) => navigate(`/projects/${nid}`)}
        onDeleted={() => navigate('/projects')}
      />
      <Tabs value={tab} onValueChange={(v) => select({ tab: v as Tab })} className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TabsList className="shrink-0 bg-surface px-2">
          {TABS.map((t) => (
            <TabsTrigger key={t} value={t} data-tab={t}>
              {TAB_LABEL[t]}
              {t === 'probabilities' && p.probabilities && p.probabilities.state !== 'current' && (
                <span
                  className={cn('ml-1 size-1.5 rounded-full', probStale ? 'bg-warn' : 'bg-faint')}
                  aria-label={probStale ? 'stale' : 'not calculated'}
                />
              )}
              {t === 'samples' && <span className="num ml-0.5 text-2xs text-faint">{p.sample_count}</span>}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="review" className="flex min-h-0 flex-col" forceMount hidden={tab !== 'review'}>
          <ReviewTab detail={detail} locusId={locusId} sampleId={sampleId} onSelect={select} active={tab === 'review'} />
        </TabsContent>
        <TabsContent value="sample" className="flex min-h-0 flex-col">
          <SampleView
            detail={detail}
            sampleId={sampleId}
            onSelectSample={(s) => select({ sample: s })}
            onOpenReview={(l, s) => select({ tab: 'review', locus: l, sample: s })}
          />
        </TabsContent>
        <TabsContent value="probabilities" className="flex min-h-0 flex-col">
          <ProbabilitiesTab detail={detail} />
        </TabsContent>
        <TabsContent value="summary" className="flex min-h-0 flex-col">
          <SummaryTab detail={detail} onOpenLocus={(l) => select({ tab: 'review', locus: l })} />
        </TabsContent>
        <TabsContent value="samples" className="flex min-h-0 flex-col">
          <SampleSetTab detail={detail} onOpenSample={(s) => select({ tab: 'sample', sample: s })} />
        </TabsContent>
        <TabsContent value="export" className="flex min-h-0 flex-col">
          <ExportTab detail={detail} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
