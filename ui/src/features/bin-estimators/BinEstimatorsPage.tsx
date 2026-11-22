/**
 * Bin estimators. `/bin-estimators` lists them; `/bin-estimators/:id` is one
 * estimator's workspace: the bins of each locus (plot and table, edited in
 * place) and its samples. The tab and locus are in the query string:
 * `/bin-estimators/1?tab=bins&locus=3`.
 */
import { SetupSteps } from '@/features/projects-shared/SetupSteps'
import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ChevronLeft, Download, ListTree, Play } from 'lucide-react'
import { ListDetailLayout, Page, PageHeader } from '@/layouts/layouts'
import { Button } from '@/components/ui/Button'
import { EmptyState, NotFound } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/ProgressBar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { bypassUnsaved, useUnsavedChanges } from '@/lib/unsaved'
import { LocusStatusList } from '@/features/projects-shared/LocusStatusList'
import { ProjectHeader } from '@/features/projects-shared/ProjectHeader'
import { ProjectList } from '@/features/projects-shared/ProjectList'
import { useProject, useProjects } from '@/features/projects-shared/queries'
import { projectOverall } from '@/features/projects-shared/status'
import { BinsTab, type EditsByLocus } from './BinsTab'
import { SamplesTab } from '@/features/projects-shared/SamplesTab'
import { useExport } from '@/features/projects-shared/exportCsv'
import { isDirty, type BinEdits } from './model/edits'

const PATH = '/bin-estimators'

export default function BinEstimatorsPage() {
  const { id } = useParams()
  const projectId = id != null && /^\d+$/.test(id) ? Number(id) : null
  return projectId == null ? <EstimatorsIndex /> : <EstimatorWorkspace key={projectId} projectId={projectId} />
}

function EstimatorsIndex() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<number | null>(null)
  const none = useProjects('bin_estimator').data?.length === 0
  const detail = useProject(selected)
  return (
    <Page header={<PageHeader title="Bin estimators" icon={<ListTree />} subtitle="Allele bins from peak sizes across many runs" />}>
      <ListDetailLayout
        id="bin-estimators"
        listWidth={720}
        minListWidth={420}
        list={
          <ProjectList
            kind="bin_estimator"
            selectedId={selected}
            onSelect={setSelected}
            onOpen={(pid) => navigate(`${PATH}/${pid}`)}
            onCreated={(d) => navigate(`${PATH}/${d.project.id}`)}
            onDeleted={() => setSelected(null)}
          />
        }
        detail={
          selected == null && none ? (
            <SetupSteps current="bin_estimator" />
          ) : selected == null || !detail.data ? (
            <EmptyState title={selected == null ? 'Select a bin estimator' : 'Loading…'}>
              {selected == null &&
                'A bin estimator clusters the peak sizes of every run at its loci into allele bins, which you then check and adjust by hand. Genotyping calls a peak only inside a bin. Double-click an estimator, or press Enter, to open it.'}
            </EmptyState>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col bg-surface" data-testid="project-overview">
              <div className="border-b border-line p-3">
                <h2 className="text-[15px] font-semibold">{detail.data.project.title}</h2>
                {detail.data.project.description && <p className="mt-0.5 text-xs text-muted">{detail.data.project.description}</p>}
                <p className="mt-1 text-xs text-muted">{projectOverall(detail.data.project).sentence}</p>
                {detail.data.dependents.length > 0 && (
                  <p className="mt-1 text-xs text-muted">Used by {detail.data.dependents.map((d) => d.title).join(', ')}.</p>
                )}
                <Button className="mt-2" variant="primary" onClick={() => navigate(`${PATH}/${selected}`)}>
                  <Play size={12} /> Open bins
                </Button>
              </div>
              <LocusStatusList detail={detail.data} selected={null} onSelect={(l) => navigate(`${PATH}/${selected}?tab=bins&locus=${l}`)} className="min-h-0 flex-1" />
            </div>
          )
        }
      />
    </Page>
  )
}

const TABS = ['bins', 'samples'] as const
type Tab = (typeof TABS)[number]

function EstimatorWorkspace({ projectId }: { projectId: number }) {
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams()
  const project = useProject(projectId)
  const tab = (TABS as readonly string[]).includes(search.get('tab') ?? '') ? (search.get('tab') as Tab) : 'bins'
  const lv = search.get('locus')
  const locusId = lv != null && /^\d+$/.test(lv) ? Number(lv) : null
  const [edits, setEditsState] = useState<EditsByLocus>({})
  const setEdits = useCallback((lid: number, f: (s: BinEdits | undefined) => BinEdits) => {
    setEditsState((all) => {
      const next = f(all[lid])
      return next === all[lid] || next === undefined ? all : { ...all, [lid]: next }
    })
  }, [])
  const exp = useExport('bins', projectId)

  const select = useCallback(
    (sel: { tab?: Tab; locus?: number }, replace = false) => {
      setSearch(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (sel.tab) next.set('tab', sel.tab)
          if (sel.locus != null) next.set('locus', String(sel.locus))
          return next
        },
        { replace },
      )
    },
    [setSearch],
  )
  const onSelectLocus = useCallback((id: number, replace?: boolean) => select({ locus: id }, replace), [select])

  const dirtyLabels = useMemo(() => {
    const loci = project.data?.loci ?? []
    return Object.entries(edits)
      .filter(([, s]) => isDirty(s))
      .map(([k]) => loci.find((l) => l.locus_id === Number(k))?.label ?? k)
  }, [edits, project.data])
  useUnsavedChanges(dirtyLabels.length > 0, `bin edits at ${dirtyLabels.join(', ')}`)

  if (project.isLoading) return <div className="grid h-full place-items-center text-muted"><Spinner /></div>
  if (project.isError || !project.data) {
    return (
      <NotFound what="bin estimator" error={project.error ?? undefined} back={{ to: PATH, label: 'All bin estimators' }} />
    )
  }
  const detail = project.data
  if (detail.project.kind !== 'bin_estimator') {
    return <EmptyState title="Not a bin estimator" action={<Button asChild size="sm"><Link to={PATH}>All bin estimators</Link></Button>} />
  }
  const p = detail.project
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col" data-testid="bin-estimator-workspace" data-project={p.title}>
      <ProjectHeader
        detail={detail}
        leading={
          <Button asChild size="icon-sm" variant="ghost" aria-label="All bin estimators" title="All bin estimators">
            <Link to={PATH}>
              <ChevronLeft size={15} />
            </Link>
          </Button>
        }
        actions={
          <Button size="sm" variant="ghost" onClick={() => void exp.run()} disabled={exp.busy} data-testid="export-bins" title={dirtyLabels.length ? 'Exports the saved bins; unsaved edits are not included' : 'Every bin of every locus as CSV'}>
            {exp.busy ? <Spinner className="size-3" /> : <Download size={12} />} Export bins CSV
          </Button>
        }
        onDuplicated={(nid) => bypassUnsaved(() => navigate(`${PATH}/${nid}`))}
        onDeleted={() => bypassUnsaved(() => navigate(PATH))}
      />
      <Tabs value={tab} onValueChange={(v) => select({ tab: v as Tab })} className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TabsList className="shrink-0 bg-surface px-2">
          <TabsTrigger value="bins" data-tab="bins">
            Bins
            {dirtyLabels.length > 0 && <span className="ml-1 size-1.5 rounded-full bg-accent" aria-label="unsaved edits" />}
          </TabsTrigger>
          <TabsTrigger value="samples" data-tab="samples">
            Samples
            <span className="num ml-0.5 text-2xs text-faint">{p.all_samples ? 'all' : p.sample_count}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="bins" className="flex min-h-0 flex-col" forceMount hidden={tab !== 'bins'}>
          <BinsTab detail={detail} locusId={locusId} onSelectLocus={onSelectLocus} edits={edits} setEdits={setEdits} active={tab === 'bins'} />
        </TabsContent>
        <TabsContent value="samples" className="flex min-h-0 flex-col">
          <SamplesTab detail={detail} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
