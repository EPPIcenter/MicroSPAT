/**
 * X-only view state for scatter plots (BinPlot, ArtifactPlot): wheel zoom
 * around the cursor, horizontal wheel/shift-wheel pan, reset. The domain is
 * kept in a ref; `onChange` is called so the owner can schedule a redraw.
 */
import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { inRect, type Rect } from './axes'
import { clampDomain, domainsEqual, linear, panDomain, pixelsToData, wheelPixels, wheelZoomFactor, zoomDomain, type Domain } from './scale'

export interface XView {
  domain: RefObject<Domain>
  set: (d: Domain) => void
  pan: (deltaData: number) => void
  zoomAt: (anchor: number, factor: number) => void
  reset: () => void
}

export function useXView(opts: {
  bounds: Domain
  initial: Domain
  minSpan: number
  onChange: () => void
  /** Element receiving wheel events and the plot rect within it. */
  target: RefObject<HTMLElement | null>
  getRect: () => Rect
}): XView {
  const domain = useRef<Domain>(opts.initial)
  const o = useRef(opts)
  o.current = opts

  const set = useCallback((d: Domain) => {
    const next = clampDomain(d, o.current.bounds, o.current.minSpan)
    if (domainsEqual(next, domain.current)) return
    domain.current = next
    o.current.onChange()
  }, [])
  const pan = useCallback((delta: number) => set(panDomain(domain.current, delta, o.current.bounds)), [set])
  const zoomAt = useCallback(
    (anchor: number, factor: number) => set(zoomDomain(domain.current, anchor, factor, o.current.bounds, o.current.minSpan)),
    [set],
  )
  const reset = useCallback(() => {
    domain.current = clampDomain(o.current.initial, o.current.bounds, o.current.minSpan)
    o.current.onChange()
  }, [])

  // Re-clamp or reset when bounds/initial change.
  const key = `${opts.bounds[0]}|${opts.bounds[1]}|${opts.initial[0]}|${opts.initial[1]}`
  useEffect(() => {
    domain.current = clampDomain(o.current.initial, o.current.bounds, o.current.minSpan)
    o.current.onChange()
  }, [key])

  useEffect(() => {
    const el = opts.target.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const b = el.getBoundingClientRect()
      const px = e.clientX - b.left
      const py = e.clientY - b.top
      const r = o.current.getRect()
      if (!inRect(r, px, py)) return
      e.preventDefault()
      const dx = wheelPixels(e.deltaX, e.deltaMode)
      const dy = wheelPixels(e.deltaY, e.deltaMode)
      if (Math.abs(dx) > Math.abs(dy) || e.shiftKey) {
        pan(pixelsToData(domain.current, r.w, Math.abs(dx) > Math.abs(dy) ? dx : dy))
        return
      }
      const x = linear(domain.current, [r.x, r.x + r.w])
      zoomAt(x.invert(px), wheelZoomFactor(dy))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [opts.target, pan, zoomAt])

  return { domain, set, pan, zoomAt, reset }
}
