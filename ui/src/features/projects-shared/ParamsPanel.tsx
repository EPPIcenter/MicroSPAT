/**
 * Parameters of one locus of a project: the kind's own group, peak filters
 * and scanning, each with help text and dirty markers. Saves only what
 * changed, to this locus, the checked loci, or every locus; "Save and
 * re-analyze" also analyzes those loci. Reset goes back to the kind's
 * defaults (the engine's, which differ per kind).
 *
 * Unsaved edits are registered with the app's leave guard (`lib/unsaved`),
 * so leaving the page or opening another workspace asks first. The form is
 * per locus: a page that switches locus or closes the panel itself can
 * watch `onDirtyChange` and ask before it does.
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ChevronRight, Play, RotateCcw, Undo2, X } from 'lucide-react'
import { api } from '@/api/client'
import type { ProjectDetail } from '@/api/bindings'
import type { ParamSchema, ParamValues } from '@/components/form/schema'
import { ParameterSections, useParameterForm } from '@/components/form/ParameterForm'
import { Button } from '@/components/ui/Button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/Menu'
import { Spinner } from '@/components/ui/ProgressBar'
import { cn } from '@/lib/cn'
import { useUnsavedChanges } from '@/lib/unsaved'
import { toast } from '@/stores/toasts'
import {
  changedByGroup,
  combinedSchema,
  flattenParams,
  paramGroupsFor,
  partialParams,
  prefixedSchema,
  type ParamGroupKey,
} from './paramsModel'
import { useAnalyze } from './ProjectHeader'
import { useLocusParams, useProjectTask } from './queries'

export type ParamScope = 'locus' | 'selected' | 'all'

export interface ParamsPanelProps {
  detail: ProjectDetail
  locusId: number
  /** Loci checked elsewhere on the page, for "apply to selected loci" (omit to hide that option). */
  selectedLocusIds?: readonly number[]
  /** Replace the kind's own schema (keys must match the engine section). */
  kindSchema?: ParamSchema
  /** Groups open at first; default: the kind's own group and filters. */
  defaultOpen?: ParamGroupKey[]
  onClose?: () => void
  /** Whether the form holds unsaved edits (false again when it unmounts). */
  onDirtyChange?: (dirty: boolean) => void
  className?: string
}

const GROUP_LABEL: Record<ParamGroupKey, string> = {
  scan: 'Scanning',
  filter: 'Peak filters',
  bins: 'Bin estimation',
  artifact: 'Artifact estimation',
  quant_bias: 'Quantification bias',
  genotyping: 'Calling',
}

export function ParamsPanel({
  detail,
  locusId,
  selectedLocusIds,
  kindSchema,
  defaultOpen,
  onClose,
  onDirtyChange,
  className,
}: ParamsPanelProps) {
  const project = detail.project
  const locus = detail.loci.find((l) => l.locus_id === locusId)
  const groups = useMemo(() => paramGroupsFor(project.kind, kindSchema), [project.kind, kindSchema])
  const schema = useMemo(() => combinedSchema(groups), [groups])
  const prefixed = useMemo(() => groups.map((g) => ({ g, schema: prefixedSchema(g) })), [groups])
  const view = useLocusParams(project.id, locusId)
  const saved = useMemo(() => flattenParams(view.data?.params, groups), [view.data, groups])
  // Remount the form per locus so edits never leak to another locus.
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col bg-surface', className)} data-testid="params-panel" data-locus={locus?.label}>
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
        <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Parameters</h2>
        <span className="text-xs font-medium">{locus?.label}</span>
        {view.data && (
          <span className={cn('text-2xs', view.data.is_default ? 'text-faint' : 'text-accent')}>
            {view.data.is_default ? 'defaults' : 'custom'}
          </span>
        )}
        {view.isFetching && <Spinner className="size-3" />}
        {onClose && (
          <Button size="icon-sm" variant="ghost" className="ml-auto" onClick={onClose} aria-label="Close parameters (P)" title="Close (P)">
            <X size={13} />
          </Button>
        )}
      </div>
      {view.data ? (
        <ParamsForm
          key={`${project.id}:${locusId}`}
          detail={detail}
          locusId={locusId}
          selectedLocusIds={selectedLocusIds ?? []}
          showSelected={selectedLocusIds !== undefined}
          schema={schema}
          groups={prefixed}
          saved={saved}
          isDefault={view.data.is_default}
          defaultOpen={defaultOpen ?? [groups[0]!.key, 'filter']}
          onDirtyChange={onDirtyChange}
        />
      ) : (
        <div className="grid flex-1 place-items-center text-muted">{view.isError ? 'Could not load parameters.' : <Spinner />}</div>
      )}
    </div>
  )
}

function ParamsForm({
  detail,
  locusId,
  selectedLocusIds,
  schema,
  groups,
  saved,
  isDefault,
  defaultOpen,
  showSelected,
  onDirtyChange,
}: {
  detail: ProjectDetail
  locusId: number
  selectedLocusIds: readonly number[]
  showSelected: boolean
  schema: ParamSchema
  groups: { g: { key: ParamGroupKey; slow?: boolean }; schema: ParamSchema }[]
  saved: ParamValues
  isDefault: boolean
  defaultOpen: ParamGroupKey[]
  onDirtyChange?: (dirty: boolean) => void
}) {
  const project = detail.project
  const form = useParameterForm(schema, saved)
  const locusLabel = detail.loci.find((l) => l.locus_id === locusId)?.label ?? 'a locus'
  useUnsavedChanges(form.isDirty, `parameter changes for ${locusLabel} in ${project.title}`)
  useEffect(() => onDirtyChange?.(form.isDirty), [form.isDirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])
  const [scope, setScope] = useState<ParamScope>('locus')
  const [open, setOpen] = useState<Set<ParamGroupKey>>(() => new Set(defaultOpen))
  const analyze = useAnalyze(project.id)
  const task = useProjectTask('analyze_project', project.title)
  const analyzing = analyze.isPending || task?.status === 'running'
  const selected = selectedLocusIds.filter((id) => detail.loci.some((l) => l.locus_id === id))
  const scopeIds =
    scope === 'locus' ? [locusId] : scope === 'selected' ? [...new Set([locusId, ...selected])] : detail.loci.map((l) => l.locus_id)
  const label = detail.loci.find((l) => l.locus_id === locusId)?.label ?? 'this locus'
  const byGroup = changedByGroup(form.dirty)
  // Not dirty but a wider scope: copy this locus's whole parameter set there.
  const copying = !form.isDirty && scope !== 'locus'

  const save = useMutation({
    mutationFn: async (thenAnalyze: boolean) => {
      const keys = copying ? Object.keys(form.values) : form.dirty
      const params = partialParams(form.values, keys)
      const out = await api.update_project_locus_params({
        project_id: project.id,
        params,
        ...(scope === 'all' ? {} : { locus_ids: scopeIds }),
      })
      if (thenAnalyze) analyze.mutate({ locus_ids: scopeIds })
      return out
    },
    meta: { errorTitle: 'Could not save parameters' },
    onSuccess: (_r, thenAnalyze) => {
      const where = scope === 'locus' ? label : scope === 'all' ? 'every locus' : `${scopeIds.length} loci`
      toast.success(`Parameters saved to ${where}`, thenAnalyze ? 'Re-analyzing…' : 'Results are stale until re-analyzed.')
    },
  })
  const reset = useMutation({
    mutationFn: (all: boolean) => api.reset_project_locus_params({ project_id: project.id, ...(all ? {} : { locus_ids: [locusId] }) }),
    meta: { errorTitle: 'Could not reset parameters' },
    onSuccess: (_r, all) => toast.success(all ? 'Every locus reset to defaults' : `${label} reset to defaults`),
  })

  const busy = save.isPending || reset.isPending
  const canSave = form.isValid && (form.isDirty || copying) && !busy

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSave) save.mutate(true)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && form.isDirty) {
          e.preventDefault()
          e.stopPropagation()
          form.revert()
        }
      }}
    >
      <div className="min-h-0 flex-1 overflow-auto">
        {groups.map(({ g, schema: s }) => {
          const isOpen = open.has(g.key)
          const n = byGroup[g.key] ?? 0
          return (
            <section key={g.key} className="border-b border-line" data-group={g.key}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen((o) => (o.has(g.key) ? new Set([...o].filter((x) => x !== g.key)) : new Set([...o, g.key])))}
                className="flex h-8 w-full items-center gap-1.5 px-3 text-left text-xs font-semibold hover:bg-surface-2"
              >
                <ChevronRight size={12} className={cn('text-faint transition-transform', isOpen && 'rotate-90')} />
                {GROUP_LABEL[g.key]}
                {g.slow && <span className="text-2xs font-normal text-faint">re-scans every run</span>}
                {n > 0 && <span className="ml-auto text-2xs font-normal text-accent">{n} unsaved</span>}
              </button>
              {isOpen && (
                <div className="flex flex-col gap-3 px-3 pt-1 pb-3">
                  {s.description && <p className="text-2xs leading-relaxed text-muted">{s.description}</p>}
                  <ParameterSections schema={s} form={form} disabled={busy} columnWidth={150} />
                </div>
              )}
            </section>
          )
        })}
      </div>
      <div className="flex shrink-0 flex-col gap-1.5 border-t border-line bg-surface px-3 py-2">
        <div className="flex items-center gap-1 text-2xs" role="radiogroup" aria-label="Apply to">
          <span className="mr-1 text-muted">Apply to</span>
          {(
            [
              ['locus', label],
              ...(showSelected ? [['selected', `selected (${selected.length})`]] : []),
              ['all', `all ${detail.loci.length} loci`],
            ] as [ParamScope, string][]
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={scope === v}
              disabled={v === 'selected' && selected.length === 0}
              onClick={() => setScope(v)}
              className={cn(
                'h-5 rounded-[4px] border px-1.5 disabled:opacity-40',
                scope === v ? 'border-accent bg-accent-soft text-fg' : 'border-line text-muted hover:text-fg',
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 truncate text-2xs text-muted" aria-live="polite">
            {form.isDirty
              ? `${form.dirty.length} unsaved change${form.dirty.length > 1 ? 's' : ''}`
              : copying
                ? `Copies all of ${label}'s parameters`
                : isDefault
                  ? 'Defaults'
                  : 'Custom parameters'}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label="Reset to defaults" title="Reset to defaults" disabled={busy}>
                  <RotateCcw size={12} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => reset.mutate(false)} disabled={isDefault}>
                  Reset {label} to defaults
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => reset.mutate(true)}>Reset every locus to defaults</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={form.revert}
              disabled={!form.isDirty || busy}
              aria-label="Discard edits (Esc)"
              title="Discard edits (Esc)"
            >
              <Undo2 size={12} />
            </Button>
            <Button size="sm" onClick={() => save.mutate(false)} disabled={!canSave} title="Save without analyzing; results go stale">
              {copying ? 'Copy' : 'Save'}
            </Button>
            <Button
              size="sm"
              variant="primary"
              type="submit"
              disabled={!canSave || analyzing}
              data-testid="params-save-analyze"
              title="Save, then re-analyze the affected loci (Enter)"
            >
              {save.isPending || analyzing ? <Spinner className="size-3" /> : <Play size={11} />}
              {copying ? 'Copy & re-analyze' : 'Save & re-analyze'}
            </Button>
          </div>
        </div>
      </div>
    </form>
  )
}
