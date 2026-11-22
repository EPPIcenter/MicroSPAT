/**
 * Unsaved-changes guard, shared by every page that holds edits the engine
 * has not stored yet.
 *
 * A page calls `useUnsavedChanges(dirty, what)` while it has edits. Leaving
 * the page (any navigation that changes the path: another section, another
 * item of the same section, the browser's back button) then asks first, in
 * one dialog that `<UnsavedChangesPrompt />` (mounted once by the app shell)
 * draws. Changes of the query string alone (`?well=B02`) are not blocked:
 * pages keep their edits across those. Reloading or closing the browser tab
 * gets the browser's own "leave site?" prompt.
 *
 * Navigations the page starts itself after saving or discarding (creating
 * an item and opening it, Cancel, Delete) go through `bypassUnsaved(fn)` so
 * they are not blocked by edits that were just resolved.
 */
import { useEffect, useId, useRef } from 'react'
import { useBlocker } from 'react-router'
import { create } from 'zustand'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

interface UnsavedState {
  /** What each registered source holds, e.g. "ladder edits", by hook id. */
  sources: Record<string, string>
}

const useUnsavedStore = create<UnsavedState>(() => ({ sources: {} }))

let bypassing = 0

/** Whether anything on screen holds unsaved edits (for actions outside routing, like opening a workspace). */
export function hasUnsavedChanges(): boolean {
  return Object.keys(useUnsavedStore.getState().sources).length > 0
}

/** Descriptions of the unsaved edits, e.g. ["ladder edits on 2 wells"]. */
export function unsavedDescriptions(): string[] {
  return Object.values(useUnsavedStore.getState().sources)
}

/**
 * Register unsaved edits while `dirty` is true. `what` says what would be
 * lost, as a noun phrase ("changes to HD ROX 400", "ladder edits on 3 wells").
 */
export function useUnsavedChanges(dirty: boolean, what: string): void {
  const id = useId()
  useEffect(() => {
    if (!dirty) return
    useUnsavedStore.setState((s) => ({ sources: { ...s.sources, [id]: what } }))
    return () =>
      useUnsavedStore.setState((s) => {
        const { [id]: _gone, ...rest } = s.sources
        return { sources: rest }
      })
  }, [dirty, what, id])
}

/** Run `fn` (which navigates) without the guard: for navigations that follow a save or an explicit discard. */
export function bypassUnsaved<T>(fn: () => T): T {
  bypassing++
  try {
    return fn()
  } finally {
    bypassing--
  }
}

/** The one confirmation dialog for leaving with unsaved edits. Mount once, inside the router. */
export function UnsavedChangesPrompt() {
  const sources = useUnsavedStore((s) => s.sources)
  const dirty = Object.keys(sources).length > 0
  // Read the store when the navigation happens, not at render: a page may
  // resolve its edits and navigate in the same event handler.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => bypassing === 0 && hasUnsavedChanges() && currentLocation.pathname !== nextLocation.pathname)

  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Older engines need a return value to show their prompt.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  // Edits resolved while the dialog was open: let the navigation through.
  useEffect(() => {
    if (blocker.state === 'blocked' && !dirty) blocker.proceed()
  }, [blocker, dirty])

  // Confirming closes the dialog too; that close must not cancel the navigation.
  const confirmed = useRef(false)
  const what = Object.values(sources)
  return (
    <ConfirmDialog
      open={blocker.state === 'blocked' && dirty}
      onOpenChange={(o) => {
        if (!o && !confirmed.current && blocker.state === 'blocked') blocker.reset()
        confirmed.current = false
      }}
      destructive
      title="Discard unsaved changes?"
      description={
        <span data-testid="unsaved-prompt">
          {what.length === 1 ? `You have unsaved ${what[0]}.` : `You have unsaved ${what.slice(0, -1).join(', ')} and ${what[what.length - 1]}.`} Leaving this
          page discards {what.length === 1 ? 'them' : 'all of them'}.
        </span>
      }
      cancelLabel="Keep editing"
      confirmLabel="Discard and leave"
      onConfirm={() => {
        confirmed.current = true
        if (blocker.state === 'blocked') blocker.proceed()
      }}
    />
  )
}
