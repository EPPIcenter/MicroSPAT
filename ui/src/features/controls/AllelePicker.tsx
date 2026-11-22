/**
 * Searchable allele picker for one locus: a text box that filters the
 * locus's bins by label or size, with "none" for no allele. Built for filling
 * a whole panel from the keyboard: type a label or a size, Enter picks the
 * first match and moves to the next locus (Shift+Enter: previous), Tab picks
 * it and moves on, Esc reverts, "-" or "none" clears.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Popover } from 'radix-ui'
import type { Bin } from '@/api/bindings'
import { cn } from '@/lib/cn'
import { filterBins, isNoneQuery } from './model'

type Option = { kind: 'none' } | { kind: 'bin'; bin: Bin }

export interface AllelePickerProps {
  bins: readonly Bin[] | undefined
  value: number | null
  onChange: (binId: number | null) => void
  /** Move focus to the next (+1) or previous (−1) picker. */
  onAdvance?: (dir: 1 | -1) => void
  label: string
  invalid?: boolean
  disabled?: boolean
  className?: string
  inputRef?: (el: HTMLInputElement | null) => void
}

export function AllelePicker({ bins, value, onChange, onAdvance, label, invalid, disabled, className, inputRef }: AllelePickerProps) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [typed, setTyped] = useState(false)
  const [hi, setHi] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  // Set once a choice is committed, so the blur that follows (Enter/Tab move focus) does not commit again.
  const done = useRef(false)
  const current = bins?.find((b) => b.id === value) ?? null

  const options = useMemo<Option[]>(() => {
    if (!bins) return []
    if (typed && isNoneQuery(query)) return [{ kind: 'none' }]
    const found = filterBins(bins, typed ? query : '').map((bin) => ({ kind: 'bin' as const, bin }))
    return typed && query.trim() ? found : [{ kind: 'none' }, ...found]
  }, [bins, query, typed])

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector(`[data-index="${hi}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [hi, open, options])

  const reset = () => {
    setOpen(false)
    setTyped(false)
    setQuery('')
  }
  const commit = (o: Option | undefined) => {
    if (!o) return
    done.current = true
    onChange(o.kind === 'none' ? null : o.bin.id)
    reset()
  }
  const openList = () => {
    done.current = false
    setOpen(true)
    setTyped(false)
    setQuery('')
    const all: Option[] = [{ kind: 'none' }, ...filterBins(bins ?? [], '').map((bin) => ({ kind: 'bin' as const, bin }))]
    const i = all.findIndex((o) => (o.kind === 'none' ? value == null : o.bin.id === value))
    setHi(Math.max(0, i))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) openList()
      else setHi((h) => Math.max(0, Math.min(options.length - 1, h + (e.key === 'ArrowDown' ? 1 : -1))))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (typed && query.trim() === '') commit({ kind: 'none' })
      else if (open && (typed || options[hi])) commit(options[hi])
      onAdvance?.(e.shiftKey ? -1 : 1)
    } else if (e.key === 'Tab') {
      if (typed) commit(query.trim() === '' ? { kind: 'none' } : options[hi])
      else reset()
    } else if (e.key === 'Escape') {
      if (open || typed) {
        e.preventDefault()
        e.stopPropagation()
        reset()
      }
    }
  }

  const text = typed ? query : (current?.label ?? '')
  const optId = (i: number) => `${listId}-o${i}`
  return (
    <Popover.Root open={open && !disabled && !!bins}>
      <Popover.Anchor asChild>
        <div className={cn('relative min-w-0', className)}>
          <input
            ref={inputRef}
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && options[hi] ? optId(hi) : undefined}
            aria-invalid={invalid || undefined}
            disabled={disabled}
            value={text}
            placeholder={bins ? 'none' : 'loading…'}
            autoComplete="off"
            spellCheck={false}
            data-value={value ?? ''}
            onFocus={(e) => {
              e.currentTarget.select()
              openList()
            }}
            onClick={() => !open && openList()}
            onChange={(e) => {
              done.current = false
              setQuery(e.target.value)
              setTyped(true)
              setOpen(true)
              setHi(0)
            }}
            onBlur={() => {
              // A click elsewhere keeps an unambiguous typed choice; anything else reverts.
              if (typed && !done.current) {
                const exact = options.find((o) => o.kind === 'bin' && o.bin.label.toLowerCase() === query.trim().toLowerCase())
                if (query.trim() === '' || isNoneQuery(query)) commit({ kind: 'none' })
                else if (exact) commit(exact)
                else if (options.length === 1) commit(options[0])
              }
              reset()
            }}
            onKeyDown={onKeyDown}
            className={cn(
              'h-7 w-full min-w-0 rounded-[5px] border border-line-strong bg-surface px-2 text-[13px] text-fg tabular-nums shadow-xs outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:bg-surface-2',
              invalid && 'border-danger focus:ring-danger/25',
            )}
          />
          {current && !typed && (
            <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-2xs text-faint tabular-nums">
              {current.base_size.toFixed(2)} bp
            </span>
          )}
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={3}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-56 overflow-hidden rounded-md border border-line bg-surface p-1 text-[13px] shadow-xl"
        >
          <div ref={listRef} id={listId} role="listbox" aria-label={`${label} alleles`} className="max-h-64 overflow-y-auto">
            {options.length === 0 && <div className="px-2 py-1.5 text-xs text-muted">No bin matches “{query}”. Esc reverts.</div>}
            {options.map((o, i) => {
              const selected = o.kind === 'none' ? value == null : o.bin.id === value
              return (
                <div
                  key={o.kind === 'none' ? 'none' : o.bin.id}
                  id={optId(i)}
                  role="option"
                  aria-selected={selected}
                  data-index={i}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    commit(o)
                  }}
                  onMouseMove={() => setHi(i)}
                  className={cn(
                    'flex h-7 cursor-default items-center gap-2 rounded-[4px] px-2',
                    i === hi && 'bg-accent-soft',
                    selected && 'font-semibold',
                  )}
                >
                  {o.kind === 'none' ? (
                    <span className="text-muted italic">none</span>
                  ) : (
                    <>
                      <span className="min-w-10 tabular-nums">{o.bin.label}</span>
                      <span className="text-xs text-muted tabular-nums">{o.bin.base_size.toFixed(2)} bp</span>
                      <span className="ml-auto text-2xs text-faint tabular-nums">{o.bin.peak_count} peaks</span>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
