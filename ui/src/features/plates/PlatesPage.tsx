/**
 * Plates: import plates of FSA files, check every well's ladder sizing, fix
 * failed ladders by hand, apply plate maps, and check signal per dye.
 * Route `/plates/:id?well=A01`: the plate and well are in the URL.
 */
import { countOf } from '@/lib/format'
import { useEffect, useState } from 'react'
import { bypassUnsaved } from '@/lib/unsaved'
import { useNavigate, useParams } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { Compass, Grid3x3, ShieldCheck, Sparkles, Upload } from 'lucide-react'
import { api } from '@/api/client'
import { ListDetailLayout, Page, PageHeader } from '@/layouts/layouts'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/ProgressBar'
import { useTaskRunning } from '@/stores/tasks'
import { toast } from '@/stores/toasts'
import { openTour } from '@/features/tour/store'
import { ImportDialog } from './ImportDialog'
import { useImportStore } from './importStore'
import { PlateDetailView } from './PlateDetailView'
import { PlateList } from './PlateList'
import { useLadders, usePlates } from './queries'
import { useCheckQuality } from './useCheckQuality'

export default function PlatesPage() {
  const { id } = useParams()
  const plateId = id != null && /^\d+$/.test(id) ? Number(id) : null
  const navigate = useNavigate()
  const plates = usePlates()
  const ladders = useLadders()
  const [importOpen, setImportOpen] = useState(false)
  const importing = useImportStore((s) => s.running)
  const demoRunning = useTaskRunning('load_demo_data')
  const [selected, setSelected] = useState<string[]>(plateId != null ? [String(plateId)] : [])
  const { check, busy: checking } = useCheckQuality()
  // Plates imported before quality checks, or checked with an older version of them.
  const unchecked = plates.data?.filter((p) => p.quality == null || p.quality.outdated).length ?? 0

  // Follow the URL when it changes from elsewhere (links, back/forward).
  const [prevId, setPrevId] = useState(plateId)
  if (prevId !== plateId) {
    setPrevId(plateId)
    if (plateId != null && !selected.includes(String(plateId))) setSelected([String(plateId)])
  }

  // Open the first plate when none is chosen.
  const first = plates.data?.[0]?.id
  useEffect(() => {
    if (plateId == null && first != null) navigate(`/plates/${first}`, { replace: true })
  }, [plateId, first, navigate])

  const demo = useMutation({
    mutationFn: () => api.load_demo_data(),
    meta: { errorTitle: 'Could not load demo data' },
    onSuccess: (r) => toast.success('Demo data loaded', `${r.plates.filter((p) => p.status === 'imported').length} plates imported`),
  })

  const header = (
    <PageHeader
      title="Plates"
      icon={<Grid3x3 />}
      subtitle={plates.data ? countOf(plates.data.length, 'plate') : undefined}
      actions={
        <>
          {unchecked > 0 && (
            <Button
              size="sm"
              onClick={() => check()}
              disabled={checking}
              title={`Measure the quality of the ${unchecked === 1 ? 'plate' : `${unchecked} plates`} not checked yet (imported before quality checks, or checked with older checks)`}
              data-testid="check-quality"
            >
              {checking ? <Spinner className="size-3" /> : <ShieldCheck size={12} />} Check quality of {countOf(unchecked, 'plate')}
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={() => setImportOpen(true)} data-testid="open-import">
            {importing ? <Spinner className="size-3" /> : <Upload size={12} />} {importing ? 'Importing…' : 'Import plates'}
          </Button>
        </>
      }
    />
  )

  let body: React.ReactNode
  if (plates.isLoading) {
    body = (
      <div className="grid flex-1 place-items-center text-muted">
        <Spinner />
      </div>
    )
  } else if (plates.isError) {
    body = (
      <EmptyState title="Could not load plates" action={<Button size="sm" onClick={() => void plates.refetch()}>Try again</Button>}>
        {(plates.error as Error).message}
      </EmptyState>
    )
  } else if (!plates.data?.length) {
    body = (
      <EmptyState
        icon={<Grid3x3 />}
        title="No plates yet"
        action={
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => setImportOpen(true)}>
              <Upload size={13} /> Import plates
            </Button>
            <Button onClick={() => demo.mutate()} disabled={demo.isPending || demoRunning}>
              {demo.isPending || demoRunning ? <Spinner className="size-3" /> : <Sparkles size={13} />} Load demo data
            </Button>
            <Button variant="ghost" onClick={() => openTour()} data-testid="empty-take-tour">
              <Compass size={13} /> Take the tour
            </Button>
          </div>
        }
      >
        Import zip archives or folders of .fsa files from a capillary run. Each well’s size ladder is fitted on import; then check the plate here, fix failed ladders, and apply a plate map.
      </EmptyState>
    )
  } else {
    body = (
      <ListDetailLayout
        id="plates"
        listWidth={380}
        minListWidth={260}
        list={
          <PlateList
            plates={plates.data}
            // A single selection follows the URL: when leaving was cancelled (unsaved ladder edits), the open plate stays selected.
            selected={selected.length === 1 && plateId != null && selected[0] !== String(plateId) ? [String(plateId)] : selected}
            onSelectionChange={(ids) => {
              setSelected(ids)
              if (ids.length === 1 && ids[0] !== String(plateId)) navigate(`/plates/${ids[0]}`)
            }}
            onOpen={(pid) => navigate(`/plates/${pid}`)}
            onDeleted={(ids) => {
              setSelected([])
              // Its unsaved ladder edits went with it.
              if (plateId != null && ids.includes(plateId)) bypassUnsaved(() => navigate('/plates'))
            }}
          />
        }
        detail={
          plateId != null ? (
            <PlateDetailView key="detail" plateId={plateId} ladders={ladders.data ?? []} />
          ) : (
            <EmptyState title="Select a plate" />
          )
        }
      />
    )
  }

  return (
    <Page header={header}>
      {body}
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} ladders={ladders.data ?? []} />
    </Page>
  )
}
