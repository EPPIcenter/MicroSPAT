/**
 * Drop target + "choose files" button. Resolves to engine-usable paths:
 * native paths in Tauri, uploaded temp paths in the browser.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Upload } from 'lucide-react'
import { cn } from '@/lib/cn'
import { onNativeFileDrop, pickFiles, uploadFiles, type PickFilesOptions, type PickedFile } from '@/api/transport'
import { toast } from '@/stores/toasts'
import { Spinner } from './ProgressBar'

export interface FileDropZoneProps extends PickFilesOptions {
  onFiles: (files: PickedFile[]) => void
  title?: string
  hint?: ReactNode
  disabled?: boolean
  compact?: boolean
  className?: string
}

function matches(name: string, exts?: string[]) {
  if (!exts || exts.length === 0) return true
  const lower = name.toLowerCase()
  return exts.some((e) => lower.endsWith(`.${e.toLowerCase().replace(/^\./, '')}`))
}

export function FileDropZone({
  onFiles,
  title = 'Drop files here or click to choose',
  hint,
  disabled,
  compact,
  className,
  ...opts
}: FileDropZoneProps) {
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const latest = useRef({ onFiles, opts, disabled })
  useLayoutEffect(() => {
    latest.current = { onFiles, opts, disabled }
  })

  useEffect(
    () =>
      onNativeFileDrop((e) => {
        const r = ref.current?.getBoundingClientRect()
        const inside = !!r && e.x >= r.left && e.x <= r.right && e.y >= r.top && e.y <= r.bottom
        if (e.type === 'over') setOver(inside)
        else if (e.type === 'leave') setOver(false)
        else {
          setOver(false)
          if (!inside || latest.current.disabled) return
          const files = e.paths
            .filter((p) => latest.current.opts.directory || matches(p, latest.current.opts.extensions))
            .map((p) => ({ path: p, name: p.split(/[\\/]/).pop() ?? p }))
          if (files.length) latest.current.onFiles(latest.current.opts.multiple ? files : files.slice(0, 1))
        }
      }),
    [],
  )

  const run = async (fn: () => Promise<PickedFile[]>) => {
    setBusy(true)
    try {
      const files = await fn()
      if (files.length) onFiles(files)
    } catch (e) {
      toast.error('Could not read files', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || busy}
      onClick={() => run(() => pickFiles(opts))}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const files = Array.from(e.dataTransfer.files).filter((f) => matches(f.name, opts.extensions))
        if (files.length === 0) {
          toast.error('No matching files', opts.extensions ? `Expected ${opts.extensions.map((x) => `.${x}`).join(', ')}` : undefined)
          return
        }
        void run(() => uploadFiles(opts.multiple ? files : files.slice(0, 1)))
      }}
      className={cn(
        'flex w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-line-strong bg-surface-2/50 text-center text-xs text-muted transition-colors hover:border-accent hover:text-fg disabled:opacity-50',
        compact ? 'flex-row px-3 py-2' : 'px-4 py-6',
        over && 'border-accent bg-accent-soft text-fg',
        className,
      )}
    >
      {busy ? <Spinner /> : <Upload size={compact ? 14 : 18} className="text-faint" />}
      <span className="font-medium text-fg">{title}</span>
      {hint && !compact && <span className="text-2xs text-muted">{hint}</span>}
    </button>
  )
}
