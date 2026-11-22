/** Form controls and labeled field wrappers. Compact, keyboard-friendly. */
import { Checkbox as RCheckbox, Select as RSelect, Switch as RSwitch } from 'radix-ui'
import { Check, ChevronDown, CircleHelp } from 'lucide-react'
import { useId, useState, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Tooltip } from '@/components/ui/Tooltip'
import { formatNumber, parseNumber } from './schema'

const inputCls =
  'h-7 w-full min-w-0 rounded-[5px] border border-line-strong bg-surface px-2 text-[13px] text-fg shadow-xs outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:bg-surface-2 disabled:text-muted aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/25'

// ------------------------------------------------------------------ wrapper

export interface FieldProps {
  label: ReactNode
  /** Tooltip with the parameter description. */
  help?: ReactNode
  error?: string | null
  /** Small text below the control when there is no error. */
  hint?: ReactNode
  /** Marks the field changed-but-unsaved. */
  dirty?: boolean
  htmlFor?: string
  className?: string
  /** Put a checkbox/switch beside the label instead of below it. */
  inline?: boolean
  children: ReactNode
}

export function Field({ label, help, error, hint, dirty, htmlFor, className, inline, children }: FieldProps) {
  const labelEl = (
    <span className="flex min-w-0 items-center gap-1">
      <label htmlFor={htmlFor} className="truncate text-xs font-medium text-muted">
        {label}
      </label>
      {help && (
        <Tooltip content={<div className="whitespace-pre-line">{help}</div>} side="top" align="start">
          <button type="button" tabIndex={-1} aria-label="About this parameter" className="text-faint hover:text-fg">
            <CircleHelp size={12} />
          </button>
        </Tooltip>
      )}
      {dirty && <span aria-label="unsaved change" title="Unsaved change" className="size-1.5 shrink-0 rounded-full bg-accent" />}
    </span>
  )
  if (inline) {
    return (
      <div className={cn('flex flex-col gap-0.5', className)}>
        <div className="flex h-7 items-center gap-2">
          {children}
          {labelEl}
        </div>
        {error && <p className="text-2xs text-danger">{error}</p>}
      </div>
    )
  }
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      {labelEl}
      {children}
      {error ? (
        <p role="alert" className="text-2xs leading-tight text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-2xs leading-tight text-faint">{hint}</p>
      ) : null}
    </div>
  )
}

// ------------------------------------------------------------------ controls

export function TextInput({ className, ...p }: ComponentProps<'input'>) {
  return <input className={cn(inputCls, className)} {...p} />
}

export interface NumberInputProps
  extends Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type' | 'min' | 'max' | 'step'> {
  value: number | null
  /** Called with the parsed value on every edit (NaN while unparsable). */
  onChange: (v: number | null) => void
  unit?: string
  min?: number
  max?: number
  step?: number
}

/**
 * Number input that keeps the typed text (so "0." or "1e" don't get eaten),
 * steps with Up/Down (Shift ×10), and shows a unit suffix.
 */
export function NumberInput({ value, onChange, unit, min, max, step = 1, className, onBlur, onKeyDown, ...p }: NumberInputProps) {
  const [text, setText] = useState(formatNumber(value))
  const [focused, setFocused] = useState(false)
  // Follow external changes unless the user is typing something equivalent.
  // Adjusted while rendering, not in an effect: an effect's update lands in a
  // later render, so a table row would briefly show a bin's new label with its
  // old numbers (and a test reading the cell right after an edit saw them).
  const [seen, setSeen] = useState(value)
  if (!Object.is(seen, value)) {
    setSeen(value)
    if (!focused || parseNumber(text) !== value) setText(formatNumber(value))
  }
  const stepBy = (dir: 1 | -1, mult: number) => {
    const base = typeof value === 'number' && Number.isFinite(value) ? value : (min ?? 0)
    let next = +(base + dir * step * mult).toPrecision(12)
    if (min !== undefined) next = Math.max(min, next)
    if (max !== undefined) next = Math.min(max, next)
    setText(formatNumber(next))
    onChange(next)
  }
  return (
    <div className={cn('relative flex items-center', className)}>
      <input
        {...p}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={text}
        className={cn(inputCls, 'num text-right', unit && 'pr-[calc(var(--unit-w)+0.75rem)]')}
        style={{ ['--unit-w' as string]: `${(unit?.length ?? 0) * 0.55}rem` }}
        onFocus={(e) => {
          setFocused(true)
          p.onFocus?.(e)
        }}
        onChange={(e) => {
          setText(e.target.value)
          onChange(parseNumber(e.target.value))
        }}
        onBlur={(e) => {
          setFocused(false)
          if (Number.isFinite(value as number)) setText(formatNumber(value))
          onBlur?.(e)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            stepBy(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey ? 10 : e.altKey ? 0.1 : 1)
          }
          onKeyDown?.(e)
        }}
      />
      {unit && <span className="pointer-events-none absolute right-2 text-2xs text-faint">{unit}</span>}
    </div>
  )
}

export interface SelectInputProps {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: ReactNode }[]
  id?: string
  disabled?: boolean
  placeholder?: string
  className?: string
  'aria-invalid'?: boolean
  'aria-label'?: string
}

export function SelectInput({ value, onChange, options, id, disabled, placeholder, className, ...aria }: SelectInputProps) {
  return (
    <RSelect.Root value={value} onValueChange={onChange} disabled={disabled}>
      <RSelect.Trigger id={id} className={cn(inputCls, 'flex items-center justify-between gap-2 text-left', className)} {...aria}>
        <RSelect.Value placeholder={placeholder} />
        <RSelect.Icon>
          <ChevronDown size={13} className="text-faint" />
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content
          position="popper"
          sideOffset={3}
          className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-line bg-surface p-1 text-[13px] shadow-xl"
        >
          <RSelect.Viewport>
            {options.map((o) => (
              <RSelect.Item
                key={o.value}
                value={o.value}
                className="relative flex h-7 cursor-default items-center rounded-[4px] pr-2 pl-6 outline-none select-none data-[highlighted]:bg-accent-soft"
              >
                <RSelect.ItemIndicator className="absolute left-1.5">
                  <Check size={13} />
                </RSelect.ItemIndicator>
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  )
}

export function Checkbox({
  checked,
  onChange,
  id,
  disabled,
  className,
  'aria-label': ariaLabel,
}: {
  checked: boolean | 'indeterminate'
  onChange: (v: boolean) => void
  id?: string
  disabled?: boolean
  className?: string
  'aria-label'?: string
}) {
  return (
    <RCheckbox.Root
      id={id}
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onCheckedChange={(v) => onChange(v === true)}
      className={cn(
        'grid size-4 shrink-0 place-items-center rounded-[4px] border border-line-strong bg-surface shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent',
        className,
      )}
    >
      <RCheckbox.Indicator className="text-accent-fg">
        {checked === 'indeterminate' ? <span className="block h-0.5 w-2 bg-current" /> : <Check size={12} strokeWidth={3} />}
      </RCheckbox.Indicator>
    </RCheckbox.Root>
  )
}

export function Switch({
  checked,
  onChange,
  id,
  disabled,
  'aria-label': ariaLabel,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  id?: string
  disabled?: boolean
  'aria-label'?: string
}) {
  return (
    <RSwitch.Root
      id={id}
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onCheckedChange={onChange}
      className="relative h-4 w-7 shrink-0 rounded-full bg-line-strong outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 data-[state=checked]:bg-accent"
    >
      <RSwitch.Thumb className="block size-3 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[14px]" />
    </RSwitch.Root>
  )
}

// ------------------------------------------------------------------ labeled fields

type Common = Omit<FieldProps, 'children' | 'htmlFor' | 'inline'> & { disabled?: boolean }

export function NumberField({
  value,
  onChange,
  unit,
  min,
  max,
  step,
  placeholder,
  ...f
}: Common & Pick<NumberInputProps, 'value' | 'onChange' | 'unit' | 'min' | 'max' | 'step' | 'placeholder'>) {
  const id = useId()
  return (
    <Field {...f} htmlFor={id}>
      <NumberInput
        id={id}
        value={value}
        onChange={onChange}
        unit={unit}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        disabled={f.disabled}
        aria-invalid={!!f.error}
      />
    </Field>
  )
}

export function TextField({
  value,
  onChange,
  placeholder,
  ...f
}: Common & { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const id = useId()
  return (
    <Field {...f} htmlFor={id}>
      <TextInput
        id={id}
        value={value}
        placeholder={placeholder}
        disabled={f.disabled}
        aria-invalid={!!f.error}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  )
}

export function SelectField({
  value,
  onChange,
  options,
  ...f
}: Common & { value: string; onChange: (v: string) => void; options: { value: string; label: ReactNode }[] }) {
  const id = useId()
  return (
    <Field {...f} htmlFor={id}>
      <SelectInput id={id} value={value} onChange={onChange} options={options} disabled={f.disabled} aria-invalid={!!f.error} />
    </Field>
  )
}

export function CheckboxField({ value, onChange, ...f }: Common & { value: boolean; onChange: (v: boolean) => void }) {
  const id = useId()
  return (
    <Field {...f} htmlFor={id} inline>
      <Checkbox id={id} checked={value} onChange={onChange} disabled={f.disabled} />
    </Field>
  )
}

export function ToggleField({ value, onChange, ...f }: Common & { value: boolean; onChange: (v: boolean) => void }) {
  const id = useId()
  return (
    <Field {...f} htmlFor={id} inline>
      <Switch id={id} checked={value} onChange={onChange} disabled={f.disabled} />
    </Field>
  )
}
