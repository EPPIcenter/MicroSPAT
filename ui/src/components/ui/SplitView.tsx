/** Two resizable panes. The first pane's size persists per `id`. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface SplitViewProps {
  /** Storage key for the size; omit to not persist. */
  id?: string
  direction?: 'horizontal' | 'vertical'
  /** Initial size of the first pane in px. */
  defaultSize?: number
  minSize?: number
  /** Minimum size of the second pane in px. */
  minSecond?: number
  first: ReactNode
  second: ReactNode
  className?: string
}

/** Clamp the first pane size so both panes keep their minimums. */
export function clampSplit(size: number, total: number, minFirst: number, minSecond: number): number {
  const max = Math.max(minFirst, total - minSecond)
  return Math.round(Math.max(minFirst, Math.min(max, size)))
}

function readStoredSize(id: string | undefined): number | null {
  if (!id) return null
  try {
    const v = Number(localStorage.getItem(`microspat.split.${id}`))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

export function SplitView({
  id,
  direction = 'horizontal',
  defaultSize = 320,
  minSize = 160,
  minSecond = 240,
  first,
  second,
  className,
}: SplitViewProps) {
  const [stored, setStored] = useState<number | null>(() => readStoredSize(id))
  const size = stored ?? defaultSize
  const box = useRef<HTMLDivElement>(null)
  const horiz = direction === 'horizontal'

  const total = useCallback(() => {
    const r = box.current?.getBoundingClientRect()
    return r ? (horiz ? r.width : r.height) : 10000
  }, [horiz])

  const persist = useCallback(
    (next: number) => {
      setStored(next)
      if (!id) return
      try {
        localStorage.setItem(`microspat.split.${id}`, String(next))
      } catch {
        // ignore
      }
    },
    [id],
  )

  const reset = useCallback(() => {
    setStored(null)
    if (!id) return
    try {
      localStorage.removeItem(`microspat.split.${id}`)
    } catch {
      // ignore
    }
  }, [id])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const start = horiz ? e.clientX : e.clientY
    const startSize = size
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      const d = (horiz ? ev.clientX : ev.clientY) - start
      persist(clampSplit(startSize + d, total(), minSize, minSecond))
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 64 : 16
    const dec = horiz ? 'ArrowLeft' : 'ArrowUp'
    const inc = horiz ? 'ArrowRight' : 'ArrowDown'
    if (e.key === dec || e.key === inc) {
      e.preventDefault()
      persist(clampSplit(size + (e.key === inc ? step : -step), total(), minSize, minSecond))
    }
  }

  // Re-clamp when the container shrinks so the second pane keeps its minimum.
  const [boxSize, setBoxSize] = useState<number | null>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setBoxSize(total()))
    ro.observe(el)
    return () => ro.disconnect()
  }, [total])
  const shown = clampSplit(size, boxSize ?? size + minSecond, minSize, minSecond)

  return (
    <div ref={box} className={cn('flex min-h-0 min-w-0 flex-1', horiz ? 'flex-row' : 'flex-col', className)}>
      <div className="flex min-h-0 min-w-0 shrink-0 flex-col" style={horiz ? { width: shown } : { height: shown }}>
        {first}
      </div>
      <div
        role="separator"
        aria-orientation={horiz ? 'vertical' : 'horizontal'}
        aria-valuenow={shown}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        onDoubleClick={reset}
        className={cn('group relative z-10 shrink-0 bg-line outline-none', horiz ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize')}
      >
        <div
          className={cn(
            'absolute transition-colors group-hover:bg-accent/50 group-focus-visible:bg-accent group-active:bg-accent',
            horiz ? 'inset-y-0 -right-[2px] -left-[2px]' : 'inset-x-0 -top-[2px] -bottom-[2px]',
          )}
        />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{second}</div>
    </div>
  )
}
