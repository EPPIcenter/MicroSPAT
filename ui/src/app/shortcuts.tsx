/**
 * The keyboard shortcut sheet: `?` anywhere (outside text fields and
 * dialogs) lists the current section's shortcuts and the app's own. A page
 * can open it too (`openShortcuts()`), as the review status bar does.
 */
import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { create } from 'zustand'
import { hasNativePaths } from '@/api/transport'
import { Dialog } from '@/components/ui/Dialog'
import { Kbd } from '@/components/ui/Kbd'
import { SHORTCUTS as REVIEW_SHORTCUTS } from '@/features/genotyping/model/navigation'
import { shortcutBlocked } from '@/lib/keys'
import { ALL_NAV_ITEMS } from './nav'
import { kbd } from '@/lib/platform'

export interface Shortcut {
  keys: string[]
  label: string
}

interface ShortcutGroup {
  title: string
  items: Shortcut[]
}

/** Shortcuts by section path, as each page implements them. */
export const SECTION_SHORTCUTS: Record<string, ShortcutGroup[]> = {
  '/plates': [
    {
      title: 'Plate',
      items: [
        { keys: ['[', ']'], label: 'Previous / next well' },
        { keys: ['P', 'N'], label: 'Previous / next well to check (failed, flagged, off-scale)' },
        { keys: ['L', 'S', 'Q'], label: 'Ladder view / signal view / quality view' },
        { keys: ['E'], label: 'Edit the well’s ladder' },
        { keys: ['Del'], label: 'Delete the selected plates (plate list)' },
      ],
    },
    {
      title: 'Editing a ladder',
      items: [
        { keys: [kbd('⌘↵')], label: 'Apply' },
        { keys: ['Esc'], label: 'Discard' },
        { keys: ['Del'], label: 'Remove the selected peak' },
      ],
    },
  ],
  '/samples': [{ title: 'Sample', items: [{ keys: ['↑', '↓'], label: 'Previous / next run (runs list focused)' }] }],
  '/ladders': [
    {
      title: 'Ladder',
      items: [
        { keys: ['Esc'], label: 'Revert unsaved changes' },
        { keys: [kbd('⌘↵')], label: 'Apply the sizes typed as text' },
      ],
    },
  ],
  '/controls': [
    {
      title: 'Allele grid',
      items: [
        { keys: ['↑', '↓'], label: 'Choose among the bins' },
        { keys: ['↵', 'Tab'], label: 'Next locus' },
        { keys: ['-'], label: 'No allele' },
        { keys: ['Esc'], label: 'Revert the locus' },
        { keys: [kbd('⌘S')], label: 'Save' },
      ],
    },
  ],
  '/bin-estimators': [
    {
      title: 'Bins',
      items: [
        { keys: [kbd('⌘S')], label: 'Save the bins of this locus' },
        { keys: [kbd('⌘Z'), kbd('⇧⌘Z')], label: 'Undo / redo' },
        { keys: ['P'], label: 'Show or hide parameters' },
        { keys: ['G'], label: 'Show or hide the repeat grid' },
      ],
    },
    {
      title: 'Bin plot (focused)',
      items: [
        { keys: ['Del'], label: 'Delete the selected bin' },
        { keys: ['←', '→'], label: 'Nudge it (⇧ ×10)' },
        { keys: ['[', ']'], label: 'Narrower / wider' },
        { keys: ['Tab'], label: 'Select the next bin' },
        { keys: ['0'], label: 'Reset the zoom' },
      ],
    },
  ],
  '/artifact-estimators': [
    {
      title: 'Artifact classes',
      items: [
        { keys: ['J', 'K'], label: 'Next / previous class' },
        { keys: ['P'], label: 'Show or hide parameters' },
        { keys: ['Del'], label: 'Remove the selected breakpoint (plot focused)' },
      ],
    },
  ],
  '/quant-bias': [
    {
      title: 'Per locus',
      items: [
        { keys: ['[', ']'], label: 'Previous / next locus' },
        { keys: ['P'], label: 'Show or hide parameters' },
        { keys: ['←', '→'], label: 'Step through the plot’s points (plot focused)' },
      ],
    },
  ],
  // `?` is listed once, under Anywhere.
  '/projects': [{ title: 'Review', items: REVIEW_SHORTCUTS.filter((s) => !s.keys.includes('?')) }],
  '/settings': [{ title: 'Settings', items: [{ keys: ['Esc'], label: 'Revert unsaved changes' }] }],
}

const PLOTS: ShortcutGroup = {
  title: 'Traces and plots',
  items: [
    { keys: ['←', '→'], label: 'Pan' },
    { keys: ['+', '−'], label: 'Zoom' },
    { keys: ['↑', '↓'], label: 'Scale y' },
    { keys: ['A'], label: 'Y axis back to auto' },
    { keys: ['0'], label: 'Reset the view' },
  ],
}

export const useShortcutSheet = create<{ open: boolean }>(() => ({ open: false }))

export function openShortcuts(): void {
  useShortcutSheet.setState({ open: true })
}

/** Mount once (the app shell): listens for `?` and draws the sheet. */
export function ShortcutSheet() {
  const open = useShortcutSheet((s) => s.open)
  const { pathname } = useLocation()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.metaKey || e.ctrlKey || e.altKey || shortcutBlocked(e)) return
      e.preventDefault()
      openShortcuts()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const section = ALL_NAV_ITEMS.find((i) => pathname === i.path || pathname.startsWith(`${i.path}/`))
  const app: ShortcutGroup = {
    title: 'Anywhere',
    items: [
      { keys: ['?'], label: 'Show these shortcuts' },
      { keys: [kbd('⌘,')], label: 'Open settings' },
      ...(hasNativePaths()
        ? [
            { keys: [kbd('⌘O')], label: 'Open a workspace' },
            { keys: [kbd('⇧⌘S')], label: 'Save the workspace as…' },
          ]
        : []),
    ],
  }
  const groups = [...(section ? (SECTION_SHORTCUTS[section.path] ?? []) : []), PLOTS, app]
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => useShortcutSheet.setState({ open: o })}
      title={section ? `${section.label}: keyboard shortcuts` : 'Keyboard shortcuts'}
      description="Page shortcuts work anywhere on the page except while typing in a field."
      width="lg"
    >
      <div className="gap-6 text-xs sm:columns-2" data-testid="shortcut-sheet">
        {groups.map((g) => (
          <section key={g.title} className="mb-4 break-inside-avoid">
            <h3 className="mb-1.5 text-2xs font-semibold tracking-wide text-faint uppercase">{g.title}</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {g.items.map((s) => (
                <div key={s.label} className="contents">
                  <dt className="flex items-center gap-1 whitespace-nowrap">
                    {s.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </dt>
                  <dd className="text-muted">{s.label}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  )
}
