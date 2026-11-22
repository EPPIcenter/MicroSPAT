/**
 * State of the guided tour: closed, asking whether to start (and loading the
 * demo study if the workspace lacks it), or running at a step.
 */
import { create } from 'zustand'
import { hasUnsavedChanges } from '@/lib/unsaved'
import { toast } from '@/stores/toasts'
import type { TourContext } from './model'

export type TourPhase =
  | { kind: 'idle' }
  /** The start dialog. `welcome` is the first-launch wording. */
  | { kind: 'intro'; welcome: boolean }
  | { kind: 'running'; index: number; context: TourContext }

interface TourState {
  phase: TourPhase
}

export const useTourStore = create<TourState>(() => ({ phase: { kind: 'idle' } }))

const OFFERED_KEY = 'microspat.tour.offered'

/** Whether the tour was ever offered or started on this computer. */
export function tourWasOffered(): boolean {
  try {
    return localStorage.getItem(OFFERED_KEY) != null
  } catch {
    // Without storage the offer would come back at every launch.
    return true
  }
}

function markOffered(): void {
  try {
    localStorage.setItem(OFFERED_KEY, '1')
  } catch {
    // ignore
  }
}

/**
 * Open the tour's start dialog. The tour moves between pages, so it does not
 * start over unsaved edits.
 */
export function openTour(opts: { welcome?: boolean } = {}): void {
  if (useTourStore.getState().phase.kind !== 'idle') return
  if (hasUnsavedChanges()) {
    toast.info('Save or discard your changes first', 'The tour moves between pages.')
    return
  }
  markOffered()
  useTourStore.setState({ phase: { kind: 'intro', welcome: opts.welcome ?? false } })
}

/** Start the tour from the start dialog (a dialog closed meanwhile stays closed). */
export function beginTour(context: TourContext): void {
  if (useTourStore.getState().phase.kind !== 'intro') return
  useTourStore.setState({ phase: { kind: 'running', index: 0, context } })
}

/** Move to step `index` of a running tour. */
export function goToStep(index: number): void {
  const { phase } = useTourStore.getState()
  if (phase.kind !== 'running') return
  useTourStore.setState({ phase: { ...phase, index } })
}

/** Close the start dialog or end the tour. */
export function closeTour(): void {
  if (useTourStore.getState().phase.kind === 'idle') return
  useTourStore.setState({ phase: { kind: 'idle' } })
}
