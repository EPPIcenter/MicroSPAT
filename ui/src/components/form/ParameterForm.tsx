/** Renders a ParamSchema with dirty tracking, validation, save and reset. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw, Undo2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/ProgressBar'
import { CheckboxField, NumberField, SelectField, TextField, ToggleField } from './fields'
import {
  dirtyKeys,
  nonDefaultKeys,
  validateValues,
  withDefaults,
  defaultsOf,
  type ParamField,
  type ParamSchema,
  type ParamValue,
  type ParamValues,
} from './schema'

export interface ParameterFormState {
  values: ParamValues
  saved: ParamValues
  errors: Record<string, string>
  dirty: string[]
  isDirty: boolean
  isValid: boolean
  setValue: (key: string, v: ParamValue) => void
  /** Discard edits. */
  revert: () => void
  /** Set every field to its schema default (still needs saving). */
  resetToDefaults: () => void
}

/** Form state for a schema. `saved` is the server's current values. */
export function useParameterForm(schema: ParamSchema, saved: Partial<ParamValues> | null | undefined): ParameterFormState {
  const savedFull = useMemo(() => withDefaults(schema, saved), [schema, saved])
  const [values, setValues] = useState<ParamValues>(savedFull)
  const dirty = useMemo(() => dirtyKeys(schema, values, savedFull), [schema, values, savedFull])
  const prevSaved = useRef(savedFull)
  // When the server values change (save landed, another view edited them),
  // adopt them for fields the user has not touched.
  useEffect(() => {
    if (prevSaved.current === savedFull) return
    const prev = prevSaved.current
    prevSaved.current = savedFull
    setValues((cur) => {
      const next = { ...cur }
      for (const k of Object.keys(savedFull)) if (cur[k] === prev[k]) next[k] = savedFull[k] ?? null
      return next
    })
  }, [savedFull])
  const errors = useMemo(() => validateValues(schema, values), [schema, values])
  const setValue = useCallback((key: string, v: ParamValue) => setValues((s) => ({ ...s, [key]: v })), [])
  return {
    values,
    saved: savedFull,
    errors,
    dirty,
    isDirty: dirty.length > 0,
    isValid: Object.keys(errors).length === 0,
    setValue,
    revert: () => setValues(savedFull),
    resetToDefaults: () => setValues(defaultsOf(schema)),
  }
}

export interface ParameterFormProps {
  schema: ParamSchema
  /** Current saved values (missing keys use defaults). */
  values: Partial<ParamValues> | null | undefined
  /** Persist. May return a promise; the form shows busy until it settles. */
  onSave: (values: ParamValues, changed: string[]) => void | Promise<unknown>
  disabled?: boolean
  /** Label of the save button. */
  saveLabel?: string
  /** Minimum column width in px for the field grid. */
  columnWidth?: number
  /** Report dirty state upward (e.g. to warn before navigating). */
  onDirtyChange?: (dirty: boolean) => void
  className?: string
}

export function ParameterForm({
  schema,
  values,
  onSave,
  disabled,
  saveLabel = 'Save',
  columnWidth = 190,
  onDirtyChange,
  className,
}: ParameterFormProps) {
  const form = useParameterForm(schema, values)
  const [busy, setBusy] = useState(false)
  useEffect(() => onDirtyChange?.(form.isDirty), [form.isDirty, onDirtyChange])
  const nonDefault = nonDefaultKeys(schema, form.values)

  const save = async () => {
    if (!form.isValid || !form.isDirty) return
    setBusy(true)
    try {
      await onSave(form.values, form.dirty)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className={cn('flex min-h-0 flex-col', className)}
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && form.isDirty) {
          e.preventDefault()
          form.revert()
        }
      }}
      data-testid={`param-form-${schema.id}`}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-3">
        {schema.description && <p className="max-w-prose text-xs text-muted">{schema.description}</p>}
        <ParameterSections schema={schema} form={form} disabled={disabled || busy} columnWidth={columnWidth} />
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-line bg-surface px-3 py-2">
        <span className="text-xs text-muted" aria-live="polite">
          {form.isDirty
            ? `${form.dirty.length} unsaved change${form.dirty.length > 1 ? 's' : ''}`
            : nonDefault.length
              ? `${nonDefault.length} changed from default`
              : 'Defaults'}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={form.resetToDefaults}
            disabled={disabled || busy || nonDefault.length === 0}
            title="Set all fields to their defaults (then Save)"
          >
            <RotateCcw size={12} /> Defaults
          </Button>
          <Button size="sm" variant="ghost" onClick={form.revert} disabled={disabled || busy || !form.isDirty} title="Discard edits (Esc)">
            <Undo2 size={12} /> Revert
          </Button>
          <Button size="sm" variant="primary" type="submit" disabled={disabled || busy || !form.isDirty || !form.isValid}>
            {busy && <Spinner className="size-3" />}
            {saveLabel}
          </Button>
        </div>
      </div>
    </form>
  )
}

/**
 * The titled field groups of a schema, bound to a `useParameterForm` state.
 * ParameterForm uses it; custom layouts can too (with their own save bar).
 */
export function ParameterSections({
  schema,
  form,
  disabled,
  columnWidth = 190,
}: {
  schema: ParamSchema
  form: ParameterFormState
  disabled?: boolean
  columnWidth?: number
}) {
  return (
    <>
      {schema.sections.map((sec, i) => {
        const fields = sec.fields.filter((f) => !f.visibleWhen || f.visibleWhen(form.values))
        if (fields.length === 0) return null
        return (
          <fieldset key={sec.title ?? i} className="min-w-0" disabled={disabled}>
            {sec.title && (
              <legend className="mb-2 flex w-full items-center gap-2 text-2xs font-semibold tracking-wide text-faint uppercase">
                {sec.title}
                <span className="h-px flex-1 bg-line" />
              </legend>
            )}
            {sec.description && <p className="-mt-1 mb-2 text-xs text-muted">{sec.description}</p>}
            <div
              className="grid gap-x-4 gap-y-3"
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${columnWidth}px, 1fr))` }}
            >
              {fields.map((f) => (
                <SchemaField
                  key={f.key}
                  field={f}
                  value={form.values[f.key] ?? null}
                  error={form.errors[f.key]}
                  dirty={form.dirty.includes(f.key)}
                  disabled={disabled}
                  onChange={(v) => form.setValue(f.key, v)}
                />
              ))}
            </div>
          </fieldset>
        )
      })}
    </>
  )
}

function SchemaField({
  field: f,
  value,
  error,
  dirty,
  disabled,
  onChange,
}: {
  field: ParamField
  value: ParamValue
  error?: string
  dirty: boolean
  disabled?: boolean
  onChange: (v: ParamValue) => void
}) {
  const common = { label: f.label, help: f.help, error, dirty, disabled }
  switch (f.kind) {
    case 'number':
      return (
        <NumberField
          {...common}
          value={typeof value === 'number' ? value : null}
          onChange={onChange}
          unit={f.unit}
          min={f.min}
          max={f.max}
          step={f.step ?? (f.integer ? 1 : 0.1)}
          placeholder={f.nullable ? 'none' : undefined}
        />
      )
    case 'text':
      return <TextField {...common} value={typeof value === 'string' ? value : ''} onChange={onChange} placeholder={f.placeholder} />
    case 'select':
      return <SelectField {...common} value={String(value ?? '')} onChange={onChange} options={f.options} />
    case 'boolean':
      return f.variant === 'switch' ? (
        <ToggleField {...common} value={value === true} onChange={onChange} />
      ) : (
        <CheckboxField {...common} value={value === true} onChange={onChange} />
      )
  }
}
