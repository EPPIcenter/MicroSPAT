/** Canvas sizing for crisp drawing at any device-pixel ratio. */
import { useEffect, useRef, useState } from 'react'

export interface CanvasSize {
  width: number
  height: number
  dpr: number
}

/**
 * Track an element's CSS size with ResizeObserver. Returns a ref to attach
 * and the latest size (0x0 until measured).
 */
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0, dpr: 1 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const r = el.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      setSize((s) =>
        s.width === Math.floor(r.width) && s.height === Math.floor(r.height) && s.dpr === dpr
          ? s
          : { width: Math.floor(r.width), height: Math.floor(r.height), dpr },
      )
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    // DPR changes when a window moves between displays.
    const mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    mq.addEventListener('change', update)
    return () => {
      ro.disconnect()
      mq.removeEventListener('change', update)
    }
  }, [])
  return [ref, size] as const
}

/** Size the backing store and return a context scaled to CSS pixels. */
export function prepareCanvas(canvas: HTMLCanvasElement, size: CanvasSize): CanvasRenderingContext2D | null {
  const w = Math.max(1, Math.round(size.width * size.dpr))
  const h = Math.max(1, Math.round(size.height * size.dpr))
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
  ctx.clearRect(0, 0, size.width, size.height)
  return ctx
}

/** Coalesce redraw requests into one per animation frame. */
export function createFrameScheduler(draw: () => void) {
  let handle = 0
  return {
    request() {
      if (handle) return
      handle = requestAnimationFrame(() => {
        handle = 0
        draw()
      })
    },
    cancel() {
      if (handle) cancelAnimationFrame(handle)
      handle = 0
    },
    /**
     * Draw now if a frame is pending. Call before hit testing against what
     * the last draw recorded: a click can arrive between a state change and
     * the next animation frame, and must see the new state, not the old one.
     */
    flush() {
      if (!handle) return
      cancelAnimationFrame(handle)
      handle = 0
      draw()
    },
  }
}
