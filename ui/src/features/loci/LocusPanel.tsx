/** Side panel editor for one locus (or a new one). Engine errors show at the field they concern. */
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import type { Color, Locus, LocusSet } from '@/api/bindings'
import { api } from '@/api/client'
import { countOf } from '@/lib/format'
import { NumberField, SelectField, TextField } from '@/components/form/fields'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/ProgressBar'
import { toast } from '@/stores/toasts'
import { Banner, DYE_OPTIONS, errorCode, errorText } from './shared'

type FieldKey = 'label' | 'color' | 'range' | 'repeat' | 'form'

interface Draft {
  label: string
  color: Color
  min: number | null
  max: number | null
  repeat: number | null
}

const fromLocus = (l?: Locus): Draft =>
  l
    ? { label: l.label, color: l.color, min: l.min_base_length, max: l.max_base_length, repeat: l.nucleotide_repeat_length }
    : { label: '', color: 'blue', min: null, max: null, repeat: null }

/** Which field an engine error is about. */
export function locusErrorField(code: string | null, message: string): FieldKey {
  if (code === 'conflict') return 'label'
  if (code === 'in_use') return 'color'
  if (/size range|min|max/i.test(message)) return 'range'
  if (/repeat/i.test(message)) return 'repeat'
  if (/label/i.test(message)) return 'label'
  return 'form'
}

export function LocusPanel({
  locus,
  sets,
  overlapsWith,
  onCreated,
  onCancel,
  onDelete,
}: {
  locus?: Locus
  sets: readonly LocusSet[]
  overlapsWith?: string[]
  onCreated?: (l: Locus) => void
  onCancel?: () => void
  onDelete?: () => void
}) {
  const qc = useQueryClient()
  const [d, setD] = useState<Draft>(() => fromLocus(locus))
  const [err, setErr] = useState<{ field: FieldKey; message: string } | null>(null)
  const saved = fromLocus(locus)
  const dirty = {
    label: d.label.trim() !== saved.label,
    color: d.color !== saved.color,
    min: d.min !== saved.min,
    max: d.max !== saved.max,
    repeat: d.repeat !== saved.repeat,
  }
  const isDirty = !locus || Object.values(dirty).some(Boolean)

  const local: Partial<Record<FieldKey, string>> = {}
  if (d.label.trim() === '' && (locus || d.label !== '')) local.label = 'Required'
  const num = (v: number | null) => v !== null && Number.isFinite(v)
  if (d.min !== null && !num(d.min)) local.range = 'Min must be a number'
  else if (d.max !== null && !num(d.max)) local.range = 'Max must be a number'
  else if (num(d.min) && num(d.max) && !(d.min! >= 0 && d.min! < d.max!)) local.range = 'Needs 0 ≤ min < max'
  if (d.repeat !== null && !(num(d.repeat) && d.repeat! > 0 && d.repeat! <= 100)) local.repeat = 'A positive number of bases'
  const complete = d.label.trim() !== '' && num(d.min) && num(d.max) && num(d.repeat)
  const valid = complete && Object.keys(local).length === 0

  const save = useMutation({
    meta: { silent: true },
    mutationFn: () =>
      locus
        ? api.update_locus({
            id: locus.id,
            label: dirty.label ? d.label.trim() : undefined,
            color: dirty.color ? d.color : undefined,
            min_base_length: dirty.min ? d.min! : undefined,
            max_base_length: dirty.max ? d.max! : undefined,
            nucleotide_repeat_length: dirty.repeat ? d.repeat! : undefined,
          })
        : api.create_locus({
            label: d.label.trim(),
            color: d.color,
            min_base_length: d.min!,
            max_base_length: d.max!,
            nucleotide_repeat_length: d.repeat!,
          }),
    onMutate: () => setErr(null),
    onSuccess: (l) => {
      qc.setQueryData<Locus[]>(['loci'], (old) => (old ? (locus ? old.map((x) => (x.id === l.id ? l : x)) : [...old, l]) : old))
      if (locus) toast.success('Locus saved', l.label)
      else {
        toast.success('Locus created', l.label)
        setD(fromLocus())
        onCreated?.(l)
      }
    },
    onError: (e) => setErr({ field: locusErrorField(errorCode(e), errorText(e)), message: errorText(e) }),
  })
  const fieldErr = (k: FieldKey) => (err?.field === k ? err.message : null) ?? local[k] ?? null
  const set = (patch: Partial<Draft>) => {
    setD((x) => ({ ...x, ...patch }))
    setErr(null)
  }
  const busy = save.isPending
  const setNames = sets.filter((s) => locus?.locus_set_ids.includes(s.id)).map((s) => s.label)

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      aria-label={locus ? `Locus ${locus.label}` : 'New locus'}
      onSubmit={(e) => {
        e.preventDefault()
        if (valid && isDirty && !busy) save.mutate()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && locus && isDirty) {
          e.preventDefault()
          setD(fromLocus(locus))
          setErr(null)
        }
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
        <fieldset className="flex flex-col gap-3" disabled={busy}>
          <TextField
            label="Label"
            value={d.label}
            onChange={(v) => set({ label: v })}
            error={fieldErr('label')}
            dirty={!!locus && dirty.label}
            help="Unique name of the locus (case-insensitive)."
          />
          <SelectField
            label="Dye"
            value={d.color}
            onChange={(v) => set({ color: v as Color })}
            options={DYE_OPTIONS}
            error={fieldErr('color')}
            dirty={!!locus && dirty.color}
            hint={locus && locus.run_count > 0 ? `Fixed while ${countOf(locus.run_count, 'run')} use it` : undefined}
            disabled={busy || (!!locus && locus.run_count > 0)}
            help="Dye the locus primers are labeled with. Cannot change while plate maps assign runs to the locus."
          />
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Min size"
              unit="bp"
              value={d.min}
              onChange={(v) => set({ min: v })}
              dirty={!!locus && dirty.min}
              step={1}
              help="Smallest allele size to look for. With Max size, this is the window where peaks are assigned to this locus."
            />
            <NumberField
              label="Max size"
              unit="bp"
              value={d.max}
              onChange={(v) => set({ max: v })}
              dirty={!!locus && dirty.max}
              step={1}
              help="Largest allele size to look for."
            />
          </div>
          {fieldErr('range') && (
            <p role="alert" className="-mt-2 text-2xs text-danger">
              {fieldErr('range')}
            </p>
          )}
          <NumberField
            label="Repeat length"
            unit="bp"
            value={d.repeat}
            onChange={(v) => set({ repeat: v })}
            error={fieldErr('repeat')}
            dirty={!!locus && dirty.repeat}
            step={1}
            help="Length of the microsatellite repeat unit in bases (2 for a dinucleotide, 3 for a trinucleotide…). Stutter peaks sit one repeat apart."
          />
        </fieldset>
        {overlapsWith && overlapsWith.length > 0 && (
          <Banner tone="danger">
            Overlaps {overlapsWith.join(', ')} on the {d.color} dye. Peaks in the shared range can be assigned to the wrong locus.
          </Banner>
        )}
        {locus && locus.run_count > 0 && (dirty.min || dirty.max) && (
          <Banner tone="info">Changing the size range recomputes the signal of its {countOf(locus.run_count, 'run')}.</Banner>
        )}
        {err?.field === 'form' && <Banner tone="danger">{err.message}</Banner>}
        {locus && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-line pt-3 text-xs">
            <dt className="text-muted">Runs</dt>
            <dd className="num">{locus.run_count.toLocaleString('en-US')}</dd>
            <dt className="text-muted">Locus sets</dt>
            <dd>{setNames.length ? setNames.join(', ') : <span className="text-faint">none</span>}</dd>
          </dl>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 border-t border-line bg-surface px-3 py-2">
        {locus && onDelete && (
          <Button size="sm" variant="danger-ghost" onClick={onDelete}>
            <Trash2 size={12} /> Delete
          </Button>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {locus ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={!isDirty || busy}
              onClick={() => {
                setD(fromLocus(locus))
                setErr(null)
              }}
            >
              Revert
            </Button>
          ) : (
            onCancel && (
              <Button size="sm" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            )
          )}
          <Button size="sm" variant="primary" type="submit" disabled={!valid || !isDirty || busy}>
            {busy && <Spinner className="size-3" />}
            {locus ? 'Save' : 'Create locus'}
          </Button>
        </div>
      </div>
    </form>
  )
}
