/**
 * Ordered list of ladder sizes: one small input per size, paste a whole list
 * into any input (or the text view), Sort to fix the order. A strip under the
 * list shows the spacing, which is what the fit's slope model relies on.
 */
import { useRef, useState } from 'react'
import { ArrowDownUp, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { fmtSize, parseSizeList, sortEntries, type SizeCheck } from './baseSizes'

export function BaseSizesEditor({
  entries,
  onChange,
  check,
  disabled,
  serverError,
}: {
  entries: string[]
  onChange: (entries: string[]) => void
  check: SizeCheck
  disabled?: boolean
  serverError?: string | null
}) {
  const [textMode, setTextMode] = useState(false)
  const [text, setText] = useState('')
  const [junk, setJunk] = useState<string[]>([])
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const focusAt = (i: number) => requestAnimationFrame(() => refs.current[i]?.focus())

  const points = entries.flatMap((e, i) => {
    const v = Number(e.trim())
    return e.trim() !== '' && Number.isFinite(v) ? [{ i, v }] : []
  })
  const values = points.map((p) => p.v)
  const unordered = Object.values(check.entryErrors).some((e) => e.startsWith('Smaller') || e.startsWith('Duplicate'))
  const lo = values.length ? Math.min(...values) : 0
  const hi = values.length ? Math.max(...values) : 1

  const set = (i: number, v: string) => {
    const next = [...entries]
    next[i] = v
    onChange(next)
  }
  const pasteAt = (i: number, pasted: string): boolean => {
    const { values: vals, invalid } = parseSizeList(pasted)
    if (vals.length + invalid.length <= 1) return false
    onChange([...entries.slice(0, i), ...vals.map(fmtSize), ...entries.slice(i + 1)])
    setJunk(invalid)
    return true
  }

  const applyText = () => {
    const { values: vals, invalid } = parseSizeList(text)
    onChange(vals.map(fmtSize))
    setJunk(invalid)
    setTextMode(false)
  }

  return (
    <div className="flex flex-col gap-1.5" data-testid="base-sizes">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted">Base sizes</span>
        <span className="num text-2xs text-faint">
          {values.length} sizes{values.length > 1 && ` · ${fmtSize(lo)}–${fmtSize(hi)} bp`}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {unordered && !textMode && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange(sortEntries(entries))}
              disabled={disabled}
              title="Sort and remove duplicates"
            >
              <ArrowDownUp size={12} /> Sort
            </Button>
          )}
          {textMode ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setTextMode(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" onClick={applyText}>
                Apply list
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => {
                setText(entries.filter((e) => e.trim() !== '').join(', '))
                setTextMode(true)
              }}
            >
              Edit as text
            </Button>
          )}
        </div>
      </div>
      {textMode ? (
        <textarea
          autoFocus
          value={text}
          rows={3}
          aria-label="Base sizes as text"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) applyText()
            if (e.key === 'Escape') {
              e.stopPropagation()
              setTextMode(false)
            }
          }}
          placeholder="50, 60, 90, 100 … (commas, spaces or new lines)"
          className="w-full rounded-[5px] border border-line-strong bg-surface px-2 py-1.5 font-mono text-xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
      ) : (
        <div className="flex flex-wrap gap-1" role="list" aria-label="Base sizes">
          {entries.map((e, i) => {
            const err = check.entryErrors[i]
            return (
              <div key={i} role="listitem" className="group relative">
                <input
                  ref={(el) => {
                    refs.current[i] = el
                  }}
                  value={e}
                  disabled={disabled}
                  inputMode="decimal"
                  aria-label={`Size ${i + 1}`}
                  aria-invalid={!!err}
                  title={err ?? `Size ${i + 1}`}
                  onChange={(ev) => set(i, ev.target.value)}
                  onPaste={(ev) => {
                    if (pasteAt(i, ev.clipboardData.getData('text'))) ev.preventDefault()
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || (ev.key === ',' && e.trim() !== '')) {
                      ev.preventDefault()
                      const next = [...entries]
                      next.splice(i + 1, 0, '')
                      onChange(next)
                      focusAt(i + 1)
                    } else if (ev.key === 'Backspace' && e === '' && entries.length > 1) {
                      ev.preventDefault()
                      onChange(entries.filter((_, k) => k !== i))
                      focusAt(Math.max(0, i - 1))
                    } else if (ev.key === 'ArrowLeft' && ev.currentTarget.selectionStart === 0 && i > 0) {
                      ev.preventDefault()
                      focusAt(i - 1)
                    } else if (ev.key === 'ArrowRight' && ev.currentTarget.selectionEnd === e.length && i < entries.length - 1) {
                      ev.preventDefault()
                      focusAt(i + 1)
                    }
                  }}
                  className={cn(
                    'num h-6 w-[58px] rounded-[4px] border border-line-strong bg-surface pr-4 pl-1.5 text-right text-xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/25',
                    err && 'border-danger bg-danger-soft',
                  )}
                />
                {!disabled && (
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={`Remove size ${e || i + 1}`}
                    onClick={() => onChange(entries.filter((_, k) => k !== i))}
                    className="absolute top-1/2 right-0.5 hidden -translate-y-1/2 rounded text-faint group-hover:block hover:text-danger"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            )
          })}
          {!disabled && (
            <input
              value=""
              aria-label="Add sizes"
              placeholder="+ add"
              onChange={(ev) => {
                onChange([...entries, ev.target.value])
                focusAt(entries.length)
              }}
              onPaste={(ev) => {
                ev.preventDefault()
                const { values: vals, invalid } = parseSizeList(ev.clipboardData.getData('text'))
                onChange([...entries.filter((x) => x.trim() !== ''), ...vals.map(fmtSize)])
                setJunk(invalid)
              }}
              className="h-6 w-[58px] rounded-[4px] border border-dashed border-line-strong bg-transparent px-1.5 text-xs outline-none placeholder:text-faint focus:border-accent"
            />
          )}
        </div>
      )}
      {values.length > 1 && !textMode && (
        <div className="relative h-3 rounded-sm bg-surface-2" aria-hidden title="Spacing of the sizes">
          {points.map(({ i, v }) => (
            <span
              key={i}
              className={cn('absolute top-0 bottom-0 w-px', check.entryErrors[i] ? 'w-0.5 bg-danger' : 'bg-accent')}
              style={{ left: `${((v - lo) / (hi - lo || 1)) * 100}%` }}
            />
          ))}
        </div>
      )}
      {(check.listError || junk.length > 0 || serverError) && (
        <div className="flex flex-col gap-0.5 text-2xs text-danger" role="alert">
          {serverError && <p>{serverError}</p>}
          {check.listError && <p>{check.listError}</p>}
          {Object.entries(check.entryErrors)
            .slice(0, 4)
            .map(([i, msg]) => (
              <p key={i}>
                Size {Number(i) + 1} ({entries[Number(i)]}): {msg}
              </p>
            ))}
          {junk.length > 0 && <p>Ignored text that is not a number: {junk.slice(0, 6).join(', ')}</p>}
        </div>
      )}
      {!check.listError && junk.length === 0 && !serverError && (
        <p className="text-2xs text-faint">
          Expected fragment sizes, increasing. Paste a list (commas or spaces) into any box; Enter adds a size.
        </p>
      )}
    </div>
  )
}
