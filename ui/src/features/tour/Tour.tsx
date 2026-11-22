/**
 * The guided tour. Mount once, inside the router (the app shell does).
 *
 * `openTour()` shows a start dialog; the tour needs the demo study, so the
 * dialog loads it when the workspace lacks it. While the tour runs, a layer
 * over the whole window dims the page, highlights the element the step
 * points at, and takes all pointer and keyboard input: the tour shows the
 * workspace, it cannot change it. Page shortcuts stay off as well, because
 * the card is a dialog (`lib/keys`).
 *
 * On the first launch with an empty workspace the start dialog opens by
 * itself, once per computer.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { TriangleAlert, X } from 'lucide-react'
import { api } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { ProgressBar, Spinner } from '@/components/ui/ProgressBar'
import { usePlates, plateKeys } from '@/features/plates/queries'
import { useAllProjects, useWorkspaceSamples } from '@/features/projects-shared/queries'
import { useTaskStore } from '@/stores/tasks'
import { findDemo, firstFailedWell, highlightRect, onPage, placeCard, sameRect, type Rect, type Size, type TourContext } from './model'
import { tourSteps } from './steps'
import { beginTour, closeTour, goToStep, openTour, tourWasOffered, useTourStore } from './store'

export function Tour() {
  const phase = useTourStore((s) => s.phase)
  useFirstLaunchOffer()
  if (phase.kind === 'intro') return <TourIntro welcome={phase.welcome} />
  if (phase.kind === 'running') return <TourOverlay index={phase.index} context={phase.context} />
  return null
}

/** Offer the tour once, at the first launch that finds an empty workspace. */
function useFirstLaunchOffer() {
  const qc = useQueryClient()
  useEffect(() => {
    if (tourWasOffered()) return
    let cancelled = false
    qc.fetchQuery({ queryKey: plateKeys.list, queryFn: () => api.list_plates() })
      .then((plates) => {
        if (!cancelled && plates.length === 0) openTour({ welcome: true })
      })
      // No engine yet: the shell reports that itself.
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [qc])
}

// ---------------------------------------------------------------- start dialog

function TourIntro({ welcome }: { welcome: boolean }) {
  const plates = usePlates()
  const projects = useAllProjects()
  const samples = useWorkspaceSamples()
  const loaded = plates.data != null && projects.data != null && samples.data != null
  const hasDemo = loaded && findDemo(plates.data, projects.data, samples.data) != null
  const hasOwnData = loaded && !hasDemo && (plates.data.length > 0 || projects.data.length > 0)
  const loadTask = useTaskStore((s) => Object.values(s.tasks).find((t) => t.kind === 'load_demo_data' && t.status === 'running'))

  const start = useMutation({
    mutationFn: async (): Promise<TourContext> => {
      if (!hasDemo) await api.load_demo_data()
      const [p, pr, s] = await Promise.all([api.list_plates(), api.list_projects({}), api.list_samples()])
      const found = findDemo(p, pr, s)
      if (!found) throw new Error('The demo study is not complete in this workspace.')
      const plate = await api.get_plate({ id: found.plateId })
      return { ...found, failedWell: firstFailedWell(plate.wells) }
    },
    onSuccess: beginTour,
    meta: { errorTitle: 'Could not start the tour' },
  })
  const loadError = plates.error ?? projects.error ?? samples.error
  const busy = start.isPending || !!loadTask

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && closeTour()}
      title={welcome ? 'Welcome to MicroSPAT' : 'Take the tour'}
      description={
        welcome ? 'New here? Take a five-minute guided tour of a finished study.' : 'A five-minute guided tour of a finished study.'
      }
      footer={
        <>
          <Button onClick={closeTour} data-testid="tour-cancel">
            {welcome ? 'Not now' : 'Cancel'}
          </Button>
          <Button variant="primary" disabled={!loaded || busy} onClick={() => start.mutate()} data-testid="tour-start">
            {busy && <Spinner className="size-3" />}
            {hasDemo ? 'Start the tour' : 'Load the demo study and start'}
          </Button>
        </>
      }
    >
      <div className="space-y-2.5" data-testid="tour-intro">
        <p>
          The tour goes from imported plates through calibration to reviewed calls and export. While it runs, the page is locked, so nothing
          you click can change the workspace.
        </p>
        {loadError && (
          <p className="flex gap-2 rounded-md bg-bad-soft px-2.5 py-2 text-xs text-bad" role="alert">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span>Could not read workspace status: {loadError instanceof Error ? loadError.message : String(loadError)}</span>
          </p>
        )}
        {hasOwnData ? (
          <p className="flex gap-2 rounded-md bg-warn-soft px-2.5 py-2 text-xs" role="note">
            <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warn" />
            <span>
              This workspace already holds data. The tour adds the demo study beside it: three plates, 288 samples, and six loci named PfB1
              to PfY2. To keep them apart, cancel and start the tour in a new workspace.
            </span>
          </p>
        ) : (
          <p className="text-muted">
            {hasDemo ? 'It uses the demo study in this workspace' : 'It first loads the demo study into this workspace'}: three synthetic
            plates, 288 samples, and six loci, already analyzed.
          </p>
        )}
        {busy && !hasDemo && (
          <div className="space-y-1" aria-live="polite">
            <ProgressBar value={loadTask?.progress ?? null} label="Loading the demo study" />
            <p className="text-2xs text-muted">{loadTask?.message ?? 'Loading the demo study…'}</p>
          </div>
        )}
        {welcome && <p className="text-xs text-muted">To start the tour later, open the workspace menu at the top of the sidebar.</p>}
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------- running

/** How long a step waits for its target before it shows the card without one. */
const TARGET_WAIT_MS = 1500
const DIM = 'rgba(8, 12, 20, 0.5)'

function windowSize(): Size {
  return { width: window.innerWidth, height: window.innerHeight }
}

/** The first match of `selector` that is laid out (a hidden tab's content is not). */
function visibleRect(selector: string): Rect | null {
  for (const el of document.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) {
      return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
    }
  }
  return null
}

interface Tracked {
  rect: Rect | null
  viewport: Size
}

/**
 * Follows the step's target as the page loads, resizes and scrolls. Until
 * the new step's target is on screen (or the wait runs out), the previous
 * step's rectangle is kept, so the highlight glides instead of blinking.
 */
function useTarget(selector: string | undefined, stepId: string): Tracked {
  const [tracked, setTracked] = useState<Tracked>(() => ({ rect: null, viewport: windowSize() }))
  useEffect(() => {
    let frame = 0
    let shown = false
    const started = performance.now()
    const tick = () => {
      const rect = selector ? visibleRect(selector) : null
      if (shown || rect != null || selector == null || performance.now() - started > TARGET_WAIT_MS) {
        shown = true
        const viewport = windowSize()
        setTracked((prev) =>
          sameRect(prev.rect, rect) && prev.viewport.width === viewport.width && prev.viewport.height === viewport.height
            ? prev
            : { rect, viewport },
        )
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [selector, stepId])
  return tracked
}

function TourOverlay({ index, context }: { index: number; context: TourContext }) {
  const steps = useMemo(() => tourSteps(context), [context])
  const last = steps.length - 1
  const at = Math.max(0, Math.min(last, index))
  const step = steps[at]
  const navigate = useNavigate()
  const location = useLocation()
  const titleId = useId()
  const cardRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const [cardSize, setCardSize] = useState<Size>({ width: 360, height: 240 })
  const { rect, viewport } = useTarget(step?.target, step?.id ?? '')

  // Open the step's page. Only when the step changes: the page then owns its URL.
  const here = useRef(location)
  useLayoutEffect(() => {
    here.current = location
  })
  const wanted = step?.path?.(context)
  useEffect(() => {
    if (wanted != null && !onPage(here.current, wanted)) void navigate(wanted)
  }, [wanted, step?.id, navigate])

  useLayoutEffect(() => {
    const el = cardRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setCardSize({ width: el.offsetWidth, height: el.offsetHeight }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true })
  }, [step?.id])

  // The tour has the keyboard: nothing reaches the page or its shortcuts.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {})
  useLayoutEffect(() => {
    keys.current = (e) => {
      e.stopPropagation()
      if (e.key === 'Escape') {
        e.preventDefault()
        closeTour()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (at < last) goToStep(at + 1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (at > 0) goToStep(at - 1)
      } else if (e.key === 'Tab') {
        // Keep focus on the card's buttons.
        e.preventDefault()
        const buttons = [...(cardRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
        const i = buttons.findIndex((b) => b === document.activeElement)
        buttons[(i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus()
      }
    }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e)
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  if (!step) return null
  const highlight = rect ? highlightRect(rect, viewport, step.pad ?? 6) : null
  const position = placeCard({ target: highlight, card: cardSize, viewport, prefer: step.prefer })

  return createPortal(
    <div
      className="fixed inset-0 z-[70]"
      data-testid="tour"
      data-step={step.id}
      data-placement={position.placement}
      onMouseDown={(e) => e.target === e.currentTarget && e.preventDefault()}
    >
      {highlight ? (
        <div
          className="pointer-events-none absolute rounded-md outline-2 outline-accent transition-[left,top,width,height] duration-200 motion-reduce:transition-none"
          style={{ ...highlight, boxShadow: `0 0 0 200vmax ${DIM}` }}
          data-testid="tour-highlight"
        />
      ) : (
        <div className="pointer-events-none absolute inset-0" style={{ background: DIM }} />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute w-[360px] max-w-[calc(100vw-24px)] rounded-lg border border-line bg-surface p-4 text-fg shadow-2xl transition-[left,top] duration-200 motion-reduce:transition-none"
        style={{ left: position.left, top: position.top }}
        data-testid="tour-card"
      >
        <div className="flex items-center gap-2">
          <span className="num text-2xs font-semibold tracking-wide text-faint uppercase">
            Tour · {at + 1} of {steps.length}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="-mt-1 -mr-1.5 ml-auto"
            aria-label="End the tour"
            title="End the tour (Esc)"
            onClick={closeTour}
          >
            <X size={14} />
          </Button>
        </div>
        <h2 id={titleId} className="mt-1 text-sm font-semibold">
          {step.title}
        </h2>
        <div className="mt-1.5 space-y-2 text-[13px] leading-relaxed text-muted" aria-live="polite">
          {step.body.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        <ProgressBar value={(at + 1) / steps.length} label="Tour progress" className="mt-3 h-1" />
        <div className="mt-3 flex items-center gap-1.5">
          <span className="text-2xs text-faint">← → to move · Esc to leave</span>
          <Button size="sm" className="ml-auto" disabled={at === 0} onClick={() => goToStep(at - 1)} data-testid="tour-back">
            Back
          </Button>
          <Button
            ref={nextRef}
            size="sm"
            variant="primary"
            onClick={() => (at < last ? goToStep(at + 1) : closeTour())}
            data-testid="tour-next"
          >
            {at < last ? 'Next' : 'Done'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
