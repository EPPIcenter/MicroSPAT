/**
 * Artifact estimators. `/artifact-estimators` lists them; `/artifact-estimators/:id`
 * is one estimator's workspace: the classes of each locus (plot, segments,
 * edits), an overview of every class of every locus, and the samples. Tab,
 * locus and class are in the query string:
 * `/artifact-estimators/2?tab=classes&locus=1&class=3`.
 */
import { SetupSteps } from '@/features/projects-shared/SetupSteps'
import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ChevronLeft, Download, Play, Waves } from 'lucide-react'
import { ListDetailLayout, Page, PageHeader } from '@/layouts/layouts'
import { Button } from '@/components/ui/Button'
import { EmptyState, NotFound } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/ProgressBar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { LocusStatusList } from '@/features/projects-shared/LocusStatusList'
import { ProjectHeader } from '@/features/projects-shared/ProjectHeader'
import { ProjectList } from '@/features/projects-shared/ProjectList'
import { useProject, useProjects } from '@/features/projects-shared/queries'
import { projectOverall } from '@/features/projects-shared/status'
import { SamplesTab } from '@/features/projects-shared/SamplesTab'
import { useExport } from '@/features/projects-shared/exportCsv'
import { ArtifactsTab, MODEL_HELP } from './ArtifactsTab'
import { OverviewTab } from './OverviewTab'

const PATH = '/artifact-estimators'

export default function ArtifactEstimatorsPage() {
  const { id } = useParams()
  const projectId = id != null && /^\d+$/.test(id) ? Number(id) : null
  return projectId == null ? <EstimatorsIndex /> : <EstimatorWorkspace key={projectId} projectId={projectId} />
}

function EstimatorsIndex() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<number | null>(null)
  const none = useProjects('artifact_estimator').data?.length === 0
  const detail = useProject(selected)
  return (
    <Page
      header={<PageHeader title="Artifact estimators" icon={<Waves />} subtitle="Stutter heights relative to the parent peak, by size" />}
    >
      <ListDetailLayout
        id="artifact-estimators"
        listWidth={720}
        minListWidth={420}
        list={
          <ProjectList
            kind="artifact_estimator"
            selectedId={selected}
            onSelect={setSelected}
            onOpen={(pid) => navigate(`${PATH}/${pid}`)}
            onCreated={(d) => navigate(`${PATH}/${d.project.id}`)}
            onDeleted={() => setSelected(null)}
          />
        }
        detail={
          selected == null && none ? (
            <SetupSteps current="artifact_estimator" />
          ) : selected == null || !detail.data ? (
            <EmptyState title={selected == null ? 'Select an artifact estimator' : 'Loading…'}>
              {selected == null && `${MODEL_HELP} Double-click an estimator, or press Enter, to open it.`}
            </EmptyState>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col bg-surface" data-testid="project-overview">
              <div className="border-b border-line p-3">
                <h2 className="text-[15px] font-semibold">{detail.data.project.title}</h2>
                {detail.data.project.description && <p className="mt-0.5 text-xs text-muted">{detail.data.project.description}</p>}
                <p className="mt-1 text-xs text-muted">{projectOverall(detail.data.project).sentence}</p>
                {detail.data.project.bin_estimator && (
                  <p className="mt-1 text-xs text-muted">Bins from {detail.data.project.bin_estimator.title}.</p>
                )}
                <div className="mt-2 flex gap-1.5">
                  <Button variant="primary" onClick={() => navigate(`${PATH}/${selected}`)}>
                    <Play size={12} /> Open classes
                  </Button>
                  <Button onClick={() => navigate(`${PATH}/${selected}?tab=overview`)}>Overview</Button>
                </div>
              </div>
              <LocusStatusList
                detail={detail.data}
                selected={null}
                onSelect={(l) => navigate(`${PATH}/${selected}?tab=classes&locus=${l}`)}
                className="min-h-0 flex-1"
              />
            </div>
          )
        }
      />
    </Page>
  )
}

const TABS = ['classes', 'overview', 'samples'] as const
type Tab = (typeof TABS)[number]

function EstimatorWorkspace({ projectId }: { projectId: number }) {
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams()
  const project = useProject(projectId)
  const tab = (TABS as readonly string[]).includes(search.get('tab') ?? '') ? (search.get('tab') as Tab) : 'classes'
  const num = (k: string) => {
    const v = search.get(k)
    return v != null && /^\d+$/.test(v) ? Number(v) : null
  }
  const exp = useExport('artifacts', projectId)

  const select = useCallback(
    (sel: { tab?: Tab; locus?: number; cls?: number | null }, replace = false) => {
      setSearch(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (sel.tab) next.set('tab', sel.tab)
          if (sel.locus != null) next.set('locus', String(sel.locus))
          if (sel.cls === null) next.delete('class')
          else if (sel.cls != null) next.set('class', String(sel.cls))
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
    return <NotFound what="artifact estimator" error={project.error ?? undefined} back={{ to: PATH, label: 'All artifact estimators' }} />
  }
  const detail = project.data
  if (detail.project.kind !== 'artifact_estimator') {
    return (
      <EmptyState
        title="Not an artifact estimator"
        action={
          <Button asChild size="sm">
            <Link to={PATH}>All artifact estimators</Link>
          </Button>
        }
      />
    )
  }
  const p = detail.project
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col" data-testid="artifact-estimator-workspace" data-project={p.title}>
      <ProjectHeader
        detail={detail}
        leading={
          <Button asChild size="icon-sm" variant="ghost" aria-label="All artifact estimators" title="All artifact estimators">
            <Link to={PATH}>
              <ChevronLeft size={15} />
            </Link>
          </Button>
        }
        actions={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void exp.run()}
            disabled={exp.busy}
            data-testid="export-equations"
            title="Every segment of every class as CSV"
          >
            {exp.busy ? <Spinner className="size-3" /> : <Download size={12} />} Export equations CSV
          </Button>
        }
        onDuplicated={(nid) => navigate(`${PATH}/${nid}`)}
        onDeleted={() => navigate(PATH)}
      />
      <Tabs value={tab} onValueChange={(v) => select({ tab: v as Tab })} className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TabsList className="shrink-0 bg-surface px-2">
          <TabsTrigger value="classes" data-tab="classes">
            Classes
          </TabsTrigger>
          <TabsTrigger value="overview" data-tab="overview">
            Overview
          </TabsTrigger>
          <TabsTrigger value="samples" data-tab="samples">
            Samples
            <span className="num ml-0.5 text-2xs text-faint">{p.all_samples ? 'all' : p.sample_count}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="classes" className="flex min-h-0 flex-col" forceMount hidden={tab !== 'classes'}>
          <ArtifactsTab detail={detail} locusId={num('locus')} classId={num('class')} onSelect={select} active={tab === 'classes'} />
        </TabsContent>
        <TabsContent value="overview" className="flex min-h-0 flex-col">
          <OverviewTab detail={detail} onOpen={(l, c) => select({ tab: 'classes', locus: l, cls: c })} />
        </TabsContent>
        <TabsContent value="samples" className="flex min-h-0 flex-col">
          <SamplesTab detail={detail} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
