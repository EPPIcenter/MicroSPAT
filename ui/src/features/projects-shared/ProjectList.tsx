/**
 * Projects of one kind: a sortable table with create, edit, duplicate and
 * delete. Deleting a project that another project links to is refused by
 * the engine; its message (naming the dependents) is shown in the dialog.
 * With no projects yet, the empty state says what the kind needs first (a
 * locus set, runs from a plate map, the estimators it links to) and links
 * there, so a new workspace can be set up in order.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '@/api/client'
import type { ProjectDetail, ProjectKind, ProjectSummary } from '@/api/bindings'
import { isRpcError } from '@/api/transport'
import { DataTable, type DataColumn } from '@/components/DataTable'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/Menu'
import { Spinner } from '@/components/ui/ProgressBar'
import { Field, TextInput } from '@/components/form/fields'
import { toast } from '@/stores/toasts'
import { KINDS } from './kinds'
import { ProjectFormDialog } from './ProjectFormDialog'
import { projectKeys, useAllProjects, useLocusSets, useProjects, useWorkspaceSamples } from './queries'
import { formatWhen, projectOverall } from './status'

export interface ProjectListProps {
  kind: ProjectKind
  selectedId: number | null
  /** Single click / arrow keys. */
  onSelect: (id: number | null) => void
  /** Double click / Enter; defaults to onSelect. */
  onOpen?: (id: number) => void
  /** After create or duplicate (e.g. navigate to the new project). */
  onCreated?: (p: ProjectDetail) => void
  /** After delete of the selected project. */
  onDeleted?: (id: number) => void
  /** Extra columns after the built-in ones. */
  extraColumns?: DataColumn<ProjectSummary>[]
  /** Extra toolbar content. */
  toolbar?: ReactNode
  className?: string
}

/** What a kind does, for its empty list. */
const PURPOSE: Record<ProjectKind, string> = {
  bin_estimator: 'A bin estimator clusters the peak sizes of every run at its loci into allele bins, which genotyping calls alleles from.',
  artifact_estimator: 'An artifact estimator measures stutter (peaks a fixed distance from a larger one) in runs with a single clone, so genotyping can tell a minor allele from stutter.',
  quant_bias_estimator: 'A quantification-bias estimator measures, from control mixtures of known proportions, how much PCR favours shorter alleles, so genotyping can correct allele shares.',
  genotyping:
    'A genotyping project calls alleles for a set of samples at the loci of a locus set, using bins from a bin estimator and, optionally, an artifact estimator and a quantification-bias estimator.',
}

export interface Prerequisite {
  /** Why nothing can be made yet. */
  text: string
  /** Where to make what is missing. */
  to: string
  label: string
}

/** The first thing a new project of `kind` needs that the workspace lacks, or null (null while loading too). */
export function usePrerequisite(kind: ProjectKind): Prerequisite | null {
  const sets = useLocusSets()
  const samples = useWorkspaceSamples()
  const all = useAllProjects()
  if (!sets.data || !samples.data || !all.data) return null
  if (sets.data.length === 0) return { text: 'Every project analyzes the loci of a locus set. Create loci (or import them from CSV), then a locus set.', to: '/locus-sets', label: 'Locus sets' }
  if (!samples.data.some((s) => s.run_count > 0))
    return { text: 'No sample has runs yet: import plates and apply a plate map, which assigns each well to a sample and its loci.', to: '/plates', label: 'Plates' }
  for (const l of KINDS[kind].links) {
    if (!l.required || all.data.some((p) => p.kind === l.kind)) continue
    const up = KINDS[l.kind]
    return { text: `It needs a ${up.noun.toLowerCase()} (${l.purpose[0]!.toLowerCase()}${l.purpose.slice(1, -1)}). Create and analyze one first.`, to: up.path, label: up.plural }
  }
  return null
}

export function ProjectList({ kind, selectedId, onSelect, onOpen, onCreated, onDeleted, extraColumns, toolbar, className }: ProjectListProps) {
  const info = KINDS[kind]
  const projects = useProjects(kind)
  const needs = usePrerequisite(kind)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<ProjectSummary | null>(null)
  const [duplicating, setDuplicating] = useState<ProjectSummary | null>(null)
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null)
  const selected = projects.data?.find((p) => p.id === selectedId) ?? null

  const columns = useMemo<DataColumn<ProjectSummary>[]>(
    () => [
      { id: 'title', header: 'Title', value: (p) => p.title, cell: (p) => <span className="font-medium">{p.title}</span>, width: 190 },
      { id: 'locus_set', header: 'Locus set', value: (p) => p.locus_set_label, width: 110 },
      { id: 'samples', header: 'Samples', value: (p) => p.sample_count, align: 'right', width: 74 },
      {
        id: 'status',
        header: 'Status',
        description: 'Loci with current results, and loci that are stale or never analyzed',
        value: (p) => p.stale_loci + p.unanalyzed_loci,
        searchable: false,
        cell: (p) => <OverallInline p={p} />,
        width: 150,
      },
      ...(extraColumns ?? []),
      { id: 'updated', header: 'Updated', value: (p) => p.updated_at, cell: (p) => <span className="num text-muted">{formatWhen(p.updated_at)}</span>, width: 120 },
    ],
    [extraColumns],
  )

  const actionsFor = (p: ProjectSummary | null) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label="Project actions" disabled={!p}>
          <MoreHorizontal size={14} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => p && setEditing(p)}>
          <Pencil size={13} /> Edit…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => p && setDuplicating(p)}>
          <Copy size={13} /> Duplicate…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem danger onSelect={() => p && setDeleting(p)}>
          <Trash2 size={13} /> Delete…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  let body: ReactNode
  if (projects.isLoading) body = <div className="grid flex-1 place-items-center text-muted"><Spinner /></div>
  else if (projects.isError)
    body = (
      <EmptyState title={`Could not load ${info.plural.toLowerCase()}`} action={<Button size="sm" onClick={() => void projects.refetch()}>Try again</Button>}>
        {(projects.error as Error).message}
      </EmptyState>
    )
  else if (!projects.data?.length)
    body = (
      <EmptyState
        title={`No ${info.plural.toLowerCase()} yet`}
        action={
          needs ? (
            <>
              <Button asChild variant="primary" data-testid="prerequisite-link">
                <Link to={needs.to}>Go to {needs.label}</Link>
              </Button>
              <Button disabled title={needs.text}>
                <Plus size={13} /> New {info.noun.toLowerCase()}
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => setCreating(true)} data-testid="new-project">
              <Plus size={13} /> New {info.noun.toLowerCase()}
            </Button>
          )
        }
      >
        <p>{PURPOSE[kind]}</p>
        {needs && (
          <p className="mt-1.5 text-warn" data-testid="prerequisite">
            {needs.text}
          </p>
        )}
      </EmptyState>
    )
  else
    body = (
      <DataTable
        data={projects.data}
        columns={columns}
        getRowId={(p) => String(p.id)}
        selectionMode="single"
        selected={selectedId != null ? [String(selectedId)] : []}
        onSelectionChange={(ids) => onSelect(ids[0] ? Number(ids[0]) : null)}
        onRowActivate={(p) => (onOpen ?? onSelect)(p.id)}
        ariaLabel={info.plural}
        filterPlaceholder={`Filter ${info.plural.toLowerCase()}…`}
        initialSort={[{ id: 'title', desc: false }]}
        toolbar={
          <>
            {toolbar}
            {actionsFor(selected)}
            <Button size="sm" variant="primary" onClick={() => setCreating(true)} data-testid="new-project">
              <Plus size={12} /> New
            </Button>
          </>
        }
      />
    )

  return (
    <div className={className ?? 'flex min-h-0 flex-1 flex-col'} data-testid="project-list">
      {body}
      <ProjectFormDialog kind={kind} open={creating} onOpenChange={setCreating} onSaved={onCreated} />
      <ProjectFormDialog kind={kind} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} project={editing ?? undefined} />
      <DuplicateDialog project={duplicating} onClose={() => setDuplicating(null)} onCreated={onCreated} />
      <DeleteDialog project={deleting} onClose={() => setDeleting(null)} onDeleted={onDeleted} />
    </div>
  )
}

function OverallInline({ p }: { p: ProjectSummary }) {
  const o = projectOverall(p)
  const cls = o.tone === 'ok' ? 'text-ok' : o.tone === 'warn' ? 'text-warn' : 'text-muted'
  return (
    <span className={`text-xs ${cls}`} title={o.sentence}>
      {o.tone === 'ok' ? `${p.locus_count} loci current` : o.label}
    </span>
  )
}

/** "Duplicate" with a title prompt. Exported for project pages that duplicate from their header. */
export function DuplicateDialog({ project, onClose, onCreated }: { project: ProjectSummary | null; onClose: () => void; onCreated?: (p: ProjectDetail) => void }) {
  const [title, setTitle] = useState('')
  const [prev, setPrev] = useState<ProjectSummary | null>(null)
  if (project !== prev) {
    setPrev(project)
    if (project) setTitle(`${project.title} (copy)`)
  }
  const dup = useMutation({
    mutationFn: () => api.duplicate_project({ id: project!.id, title: title.trim() }),
    meta: { errorTitle: 'Could not duplicate the project' },
    onSuccess: (d) => {
      toast.success(`Created ${d.project.title}`, 'Parameters and samples were copied.')
      onClose()
      onCreated?.(d)
    },
  })
  return (
    <Dialog
      open={!!project}
      onOpenChange={(o) => !o && onClose()}
      title={`Duplicate ${project?.title ?? ''}`}
      description={
        project?.kind === 'genotyping'
          ? 'The copy keeps the locus set, linked estimators, samples and every locus’s parameters. Calls are not copied: analyze the copy to call alleles.'
          : 'The copy keeps the locus set, links, samples, parameters and results.'
      }
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!title.trim() || dup.isPending} onClick={() => dup.mutate()}>
            {dup.isPending && <Spinner className="size-3" />} Duplicate
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (title.trim()) dup.mutate()
        }}
      >
        <Field label="Title of the copy" htmlFor="dup-title">
          <TextInput id="dup-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
      </form>
    </Dialog>
  )
}

/** Delete with confirmation; shows the engine's in-use message instead of closing. */
export function DeleteDialog({ project, onClose, onDeleted }: { project: ProjectSummary | null; onClose: () => void; onDeleted?: (id: number) => void }) {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [prev, setPrev] = useState<ProjectSummary | null>(null)
  if (project !== prev) {
    setPrev(project)
    setError(null)
  }
  const del = useMutation({
    mutationFn: (id: number) => api.delete_project({ id }),
    meta: { silent: true },
  })
  return (
    <ConfirmDialog
      open={!!project}
      onOpenChange={(o) => !o && onClose()}
      title={`Delete ${project?.title ?? ''}?`}
      description={
        error ? (
          <span className="text-danger" role="alert" data-testid="delete-error">
            {error}
          </span>
        ) : (
          'The project, its parameters and every result (including manual curation and comments) are deleted. Samples and runs are kept.'
        )
      }
      confirmLabel="Delete"
      destructive
      onConfirm={async () => {
        if (!project) return
        try {
          await del.mutateAsync(project.id)
          qc.removeQueries({ queryKey: projectKeys.detail(project.id) })
          toast.success(`Deleted ${project.title}`)
          onDeleted?.(project.id)
        } catch (e) {
          setError(isRpcError(e) || e instanceof Error ? e.message : String(e))
          throw e
        }
      }}
    />
  )
}
