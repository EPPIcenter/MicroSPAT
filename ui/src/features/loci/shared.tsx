/**
 * Small pieces shared by the setup pages (ladders, loci, locus sets, samples):
 * engine error text, inline banners, a bulk delete dialog that reports each
 * refusal with the engine's message, a CSV text/file input, and a dye filter.
 */
import { useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CircleX, FileUp, Info } from 'lucide-react'
import type { Color } from '@/api/bindings'
import { COLORS } from '@/api/helpers'
import { isRpcError } from '@/api/transport'
import { cn } from '@/lib/cn'
import { countOf } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Spinner } from '@/components/ui/ProgressBar'

/** The message to show for a failed call: the engine's own text when there is one. */
export function errorText(e: unknown): string {
  if (isRpcError(e)) return e.message
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}

export function errorCode(e: unknown): string | null {
  if (isRpcError(e)) return e.code
  if (e && typeof e === 'object' && 'code' in e) return String((e as { code: unknown }).code)
  return null
}

export function Banner({
  tone = 'info',
  children,
  className,
  action,
}: {
  tone?: 'info' | 'warn' | 'danger'
  children: ReactNode
  className?: string
  action?: ReactNode
}) {
  const Icon = tone === 'danger' ? CircleX : tone === 'warn' ? AlertTriangle : Info
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs leading-snug',
        tone === 'info' && 'border-line bg-surface-2 text-muted',
        tone === 'warn' && 'border-warn/30 bg-warn-soft text-fg',
        tone === 'danger' && 'border-danger/30 bg-danger-soft text-fg',
        className,
      )}
    >
      <Icon size={14} className={cn('mt-px shrink-0', tone === 'warn' && 'text-warn', tone === 'danger' && 'text-danger')} />
      <div className="min-w-0 flex-1">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export interface DeleteItem {
  id: number
  label: string
}

/**
 * Confirm and delete items one by one. Items the engine refuses (in use) stay
 * listed with its message; the dialog closes only when everything went.
 */
export function BulkDeleteDialog({
  open,
  onOpenChange,
  items,
  noun,
  nounPlural,
  onDelete,
  onDeleted,
  note,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: readonly DeleteItem[]
  noun: string
  nounPlural?: string
  onDelete: (id: number) => Promise<unknown>
  /** Called with the ids that were deleted. */
  onDeleted?: (ids: number[]) => void
  note?: ReactNode
}) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [failures, setFailures] = useState<Record<number, string>>({})
  const failed = items.filter((i) => failures[i.id] !== undefined)
  const done = Object.keys(failures).length > 0

  const close = (v: boolean) => {
    if (busy) return
    if (!v) setFailures({})
    onOpenChange(v)
  }

  const run = async () => {
    setBusy(true)
    setProgress(0)
    const fails: Record<number, string> = {}
    const deleted: number[] = []
    let n = 0
    // A few at a time: the engine serializes writes anyway, this just hides latency.
    const queue = [...items]
    const worker = async () => {
      for (let it = queue.shift(); it; it = queue.shift()) {
        try {
          await onDelete(it.id)
          deleted.push(it.id)
        } catch (e) {
          fails[it.id] = errorText(e)
        }
        setProgress(++n)
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, items.length) }, worker))
    setBusy(false)
    if (deleted.length) onDeleted?.(deleted)
    if (Object.keys(fails).length === 0) {
      setFailures({})
      onOpenChange(false)
    } else setFailures(fails)
  }

  const what = items.length === 1 ? `${noun} ${items[0]!.label}` : countOf(items.length, noun, nounPlural)
  return (
    <Dialog
      open={open}
      onOpenChange={close}
      width="sm"
      title={done ? `Could not delete ${countOf(failed.length, noun, nounPlural)}` : `Delete ${what}?`}
      footer={
        done ? (
          <Button onClick={() => close(false)}>Close</Button>
        ) : (
          <>
            <Button onClick={() => close(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void run()} disabled={busy || items.length === 0} data-testid="confirm-delete">
              {busy && <Spinner className="size-3" />}
              {busy ? `Deleting ${progress}/${items.length}…` : 'Delete'}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <ul className="flex flex-col gap-2" data-testid="delete-failures">
          {failed.map((f) => (
            <li key={f.id}>
              <Banner tone="danger">
                <span className="font-medium">{f.label}</span>: {failures[f.id]}
              </Banner>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col gap-2 text-xs text-muted">
          {items.length > 1 && items.length <= 12 && <p className="text-fg">{items.map((i) => i.label).join(', ')}</p>}
          {note}
          <p>This cannot be undone. Anything still in use is refused and listed here.</p>
        </div>
      )}
    </Dialog>
  )
}

/** CSV input: paste text, choose a file, or drop one on the box. */
export function CsvTextInput({
  value,
  onChange,
  placeholder,
  fileLabel = 'Choose CSV file…',
  rows = 8,
}: {
  value: string
  onChange: (text: string, fileName?: string) => void
  placeholder?: string
  fileLabel?: string
  rows?: number
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const readFile = async (f: File | undefined) => {
    if (!f) return
    setFileName(f.name)
    onChange(await f.text(), f.name)
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => fileRef.current?.click()}>
          <FileUp size={12} /> {fileLabel}
        </Button>
        <span className="truncate text-2xs text-muted">{fileName ? `Loaded ${fileName}` : 'or paste the CSV below'}</span>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="hidden"
          data-testid="csv-file-input"
          onChange={(e) => {
            void readFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      <textarea
        value={value}
        rows={rows}
        spellCheck={false}
        placeholder={placeholder}
        aria-label="CSV text"
        onChange={(e) => {
          setFileName(null)
          onChange(e.target.value)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          void readFile(e.dataTransfer.files[0])
        }}
        className={cn(
          'w-full resize-y rounded-[5px] border border-line-strong bg-surface px-2 py-1.5 font-mono text-xs text-fg outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/25',
          over && 'border-accent bg-accent-soft',
        )}
      />
    </div>
  )
}

/** Toggle chips for the five dyes; an empty selection means all. */
export function DyeFilter({
  value,
  onChange,
  counts,
}: {
  value: readonly Color[]
  onChange: (v: Color[]) => void
  counts?: Partial<Record<Color, number>>
}) {
  return (
    <div role="group" aria-label="Filter by dye" className="flex items-center gap-1">
      {COLORS.map((c) => {
        const on = value.includes(c)
        return (
          <button
            key={c}
            type="button"
            aria-pressed={on}
            title={`Show only ${c} loci (click again to clear)`}
            onClick={() => onChange(on ? value.filter((x) => x !== c) : [...value, c])}
            className={cn(
              'flex h-6 items-center gap-1 rounded-[5px] border px-1.5 text-2xs text-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40',
              on ? 'border-accent bg-accent-soft text-fg' : 'border-line bg-surface',
            )}
          >
            <span aria-hidden className="size-2 rounded-[2px]" style={{ background: `var(--dye-${c})` }} />
            {c}
            {counts && <span className="num text-faint">{counts[c] ?? 0}</span>}
          </button>
        )
      })}
    </div>
  )
}

export const DYE_OPTIONS = COLORS.map((c) => ({
  value: c,
  label: (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: `var(--dye-${c})` }} />
      {c[0]!.toUpperCase() + c.slice(1)}
    </span>
  ),
}))
