/**
 * Create or edit a project of any kind: title, description, locus set (on
 * create), and the upstream estimators the kind requires or allows. Each
 * estimator picker lists only projects of the right kind and explains why a
 * project cannot be used (it must cover every locus of the locus set).
 */
import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { api } from '@/api/client'
import type { ProjectDetail, ProjectKind, ProjectSummary } from '@/api/bindings'
import { isRpcError } from '@/api/transport'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/ProgressBar'
import { Field, SelectInput, TextField, TextInput } from '@/components/form/fields'
import { toast } from '@/stores/toasts'
import { linkCandidates } from './compat'
import { createParams, KINDS, linkValues, type LinkField } from './kinds'
import { useAllProjects, useLoci, useLocusSets } from './queries'

export interface ProjectFormDialogProps {
  kind: ProjectKind
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Edit this project; omit to create one. */
  project?: ProjectSummary
  /** After a successful create or update. */
  onSaved?: (p: ProjectDetail) => void
}

const NONE = 'none'

export function ProjectFormDialog(props: ProjectFormDialogProps) {
  // Remount on open so the form starts from the project's current values.
  if (!props.open) return <Dialog open={false} onOpenChange={props.onOpenChange} title="" />
  return <ProjectForm key={props.project?.id ?? 'new'} {...props} />
}

function ProjectForm({ kind, open, onOpenChange, project, onSaved }: ProjectFormDialogProps) {
  const info = KINDS[kind]
  const editing = !!project
  const projects = useAllProjects()
  const sets = useLocusSets()
  const loci = useLoci()
  const [title, setTitle] = useState(project?.title ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [locusSetId, setLocusSetId] = useState<number | null>(project?.locus_set_id ?? null)
  const [links, setLinks] = useState<Partial<Record<LinkField, number | null>>>(project ? linkValues(project) : {})
  const [error, setError] = useState<string | null>(null)

  const effectiveSet = locusSetId ?? (sets.data?.length === 1 ? sets.data[0]!.id : null)
  const labels = useMemo(() => new Map((loci.data ?? []).map((l) => [l.id, l.label])), [loci.data])
  const candidates = useMemo(
    () =>
      Object.fromEntries(
        info.links.map((l) => [l.field, linkCandidates(l, projects.data ?? [], sets.data ?? [], effectiveSet, labels, project?.id)]),
      ),
    [info.links, projects.data, sets.data, effectiveSet, labels, project?.id],
  )

  // A new project's required link defaults to the only estimator that fits, as the locus set does.
  const chosenLinks = useMemo(() => {
    const out = { ...links }
    if (editing) return out
    for (const l of info.links) {
      if (!l.required || out[l.field] != null) continue
      const ok = (candidates[l.field] ?? []).filter((c) => c.ok)
      if (ok.length === 1) out[l.field] = ok[0]!.project.id
    }
    return out
  }, [links, editing, info.links, candidates])

  const titleError = title.trim() === '' ? 'Required' : null
  const missingLink = info.links.find((l) => l.required && chosenLinks[l.field] == null)
  const badLink = info.links.find((l) => {
    const id = chosenLinks[l.field]
    return id != null && candidates[l.field]?.find((c) => c.project.id === id)?.ok === false
  })
  const canSave = !titleError && effectiveSet != null && !missingLink && !badLink

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        const upd: Parameters<typeof api.update_project>[0] = { id: project.id }
        if (title.trim() !== project.title) upd.title = title.trim()
        if (description.trim() !== project.description) upd.description = description.trim()
        const before = linkValues(project)
        for (const l of info.links) {
          const v = links[l.field] ?? null
          if (v === (before[l.field] ?? null)) continue
          if (l.field === 'bin_estimator_id') {
            if (v != null) upd.bin_estimator_id = v
          } else upd[l.field] = v
        }
        return api.update_project(upd)
      }
      return api.create_project(createParams(kind, { title, description, locus_set_id: effectiveSet!, links: chosenLinks }))
    },
    meta: { silent: true },
    onSuccess: (d) => {
      toast.success(editing ? `Saved ${d.project.title}` : `Created ${d.project.title}`)
      onOpenChange(false)
      onSaved?.(d)
    },
    onError: (e) => setError(isRpcError(e) || e instanceof Error ? e.message : String(e)),
  })

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${project.title}` : `New ${info.noun.toLowerCase()}`}
      description={editing ? 'Changing a linked estimator makes every locus stale until it is re-analyzed.' : undefined}
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canSave || save.isPending} onClick={() => save.mutate()} data-testid="project-form-save">
            {save.isPending && <Spinner className="size-3" />}
            {editing ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (canSave) save.mutate()
        }}
      >
        <TextField label="Title" value={title} onChange={setTitle} error={title !== '' || project ? titleError : null} placeholder="e.g. Kisumu 2026 cohort" />
        <Field label="Description" htmlFor="project-description">
          <TextInput id="project-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
        </Field>
        <Field
          label="Locus set"
          hint={editing ? 'The locus set cannot be changed. Duplicate the project to use another.' : 'The loci this project analyzes.'}
        >
          <SelectInput
            aria-label="Locus set"
            value={effectiveSet != null ? String(effectiveSet) : ''}
            onChange={(v) => setLocusSetId(Number(v))}
            disabled={editing}
            placeholder={sets.isLoading ? 'Loading…' : sets.data?.length ? 'Choose a locus set' : 'No locus sets: create one under Locus sets'}
            options={(sets.data ?? []).map((s) => ({ value: String(s.id), label: `${s.label} (${s.locus_ids.length} loci)` }))}
          />
        </Field>
        {info.links.map((l) => {
          const list = candidates[l.field] ?? []
          const value = chosenLinks[l.field] ?? null
          const chosen = list.find((c) => c.project.id === value)
          const noun = KINDS[l.kind].noun
          return (
            <Field
              key={l.field}
              label={`${noun}${l.required ? '' : ' (optional)'}`}
              help={l.purpose}
              error={chosen && !chosen.ok ? chosen.note : null}
              hint={
                chosen?.note ??
                (list.length === 0
                  ? `No ${noun.toLowerCase()}s yet.${l.required ? ` Create one under ${KINDS[l.kind].plural} first.` : ''}`
                  : list.every((c) => !c.ok) && effectiveSet != null
                    ? `None covers every locus of this locus set.`
                    : l.purpose)
              }
            >
              <SelectInput
                aria-label={noun}
                value={value != null ? String(value) : l.required ? '' : NONE}
                onChange={(v) => setLinks((s) => ({ ...s, [l.field]: v === NONE ? null : Number(v) }))}
                placeholder={`Choose a ${noun.toLowerCase()}`}
                options={[
                  ...(l.required ? [] : [{ value: NONE, label: <span className="text-muted">None</span> }]),
                  ...list.map((c) => ({
                    value: String(c.project.id),
                    label: (
                      <span className={c.ok ? undefined : 'text-faint'} title={c.note ?? undefined}>
                        {c.project.title}
                        <span className="ml-1.5 text-2xs text-faint">
                          {c.project.locus_set_label}
                          {!c.ok && ' · incompatible'}
                          {c.ok && c.note && ' · not current'}
                        </span>
                      </span>
                    ),
                  })),
                ]}
              />
            </Field>
          )
        })}
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded border border-danger/30 bg-danger-soft px-2.5 py-2 text-xs text-fg">
            <AlertTriangle size={13} className="mt-px shrink-0 text-danger" />
            {error}
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}
