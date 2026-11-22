/**
 * App frame: sidebar (workspace menu, navigation, tasks, theme) + routed page.
 *
 * Switching workspace (new, open, from the menu, a shortcut or the desktop
 * app's native menu) asks first when a page holds unsaved edits
 * (`lib/unsaved`). After a switch nothing of the previous workspace may show,
 * and nothing may ask the new workspace for the previous one's items. So the
 * routed page is taken off screen before the engine changes workspace
 * (page-local drafts go with it, and a running tour ends); once it has, the
 * query cache is reset, the import panel is cleared, and the app opens
 * Plates. `leave` and `arrive` in `WorkspaceMenu` do this.
 */
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { create } from 'zustand'
import { Popover } from 'radix-ui'
import {
  ChevronsUpDown,
  CircleAlert,
  Compass,
  CircleCheck,
  Database,
  FilePlus2,
  FolderOpen,
  Keyboard,
  ListChecks,
  Monitor,
  Moon,
  Save,
  Sparkles,
  Sun,
  X,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { overlayOpen } from '@/lib/keys'
import { bypassUnsaved, hasUnsavedChanges, UnsavedChangesPrompt, unsavedDescriptions } from '@/lib/unsaved'
import { countOf } from '@/lib/format'
import { api } from '@/api/client'
import type { WorkspaceCounts } from '@/api/bindings'
import { hasNativePaths, onShellAction, pickOpenPath, pickSavePath, transportKind } from '@/api/transport'
import { sortTasks, useTaskStore, type TrackedTask } from '@/stores/tasks'
import { useThemeStore, type ThemePref } from '@/stores/theme'
import { toast } from '@/stores/toasts'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/Menu'
import { ProgressBar, Spinner } from '@/components/ui/ProgressBar'
import { Tooltip } from '@/components/ui/Tooltip'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useImportStore } from '@/features/plates/importStore'
import { Tour } from '@/features/tour/Tour'
import { closeTour, openTour } from '@/features/tour/store'
import { ALL_NAV_ITEMS, DEV_NAV, NAV, SETTINGS_NAV } from './nav'
import { openShortcuts, ShortcutSheet } from './shortcuts'
import { kbd, isMac } from '@/lib/platform'

/** Workspace switches in flight. While there is one, the routed page is not mounted. */
const useSwitching = create<{ n: number }>(() => ({ n: 0 }))

const EXT = ['microspat']

const COUNT_NOUNS: { key: keyof WorkspaceCounts; one: string; many: string }[] = [
  { key: 'plates', one: 'plate', many: 'plates' },
  { key: 'samples', one: 'sample', many: 'samples' },
  { key: 'loci', one: 'locus', many: 'loci' },
  { key: 'locus_sets', one: 'locus set', many: 'locus sets' },
  { key: 'ladders', one: 'ladder', many: 'ladders' },
]

/** ["3 plates", "288 samples", "1 locus set", …] in a fixed order. */
export function workspaceCounts(c: WorkspaceCounts): string[] {
  return COUNT_NOUNS.map(({ key, one, many }) => countOf(c[key], one, many))
}

export function workspaceCountsText(c: WorkspaceCounts): string {
  return workspaceCounts(c).join(' · ')
}

/** The browser tab / window title: section, workspace, app ("Plates · run12.microspat · MicroSPAT"). */
export function documentTitle(pathname: string, workspace: string | null | undefined): string {
  const section = [...ALL_NAV_ITEMS, DEV_NAV].find((i) => pathname === i.path || pathname.startsWith(`${i.path}/`))?.label
  return [section, workspace, 'MicroSPAT'].filter(Boolean).join(' · ')
}

export function AppShell() {
  const switching = useSwitching((s) => s.n > 0)
  const { pathname } = useLocation()
  const info = useQuery({ queryKey: ['workspace'], queryFn: () => api.get_workspace_info(), meta: { silent: true } })
  useEffect(() => {
    document.title = documentTitle(pathname, info.data?.name)
  }, [pathname, info.data?.name])
  return (
    <div className="flex h-full min-h-0">
      <Sidebar />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg">
        {switching ? (
          <div role="status" aria-label="Switching workspace" className="grid h-full place-items-center text-muted">
            <Spinner />
          </div>
        ) : (
          <Outlet />
        )}
      </main>
      <UnsavedChangesPrompt />
      <ShortcutSheet />
      <Tour />
    </div>
  )
}

function Sidebar() {
  // The gallery is for developers: never listed in a production build.
  const showDev = import.meta.env.DEV
  return (
    <nav aria-label="Main" className="flex w-[212px] shrink-0 flex-col border-r border-line bg-surface-2">
      <WorkspaceMenu />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {NAV.map((g) => (
          <div key={g.label} className="mt-3">
            <div className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-faint uppercase">{g.label}</div>
            <ul className="flex flex-col gap-px">
              {g.items.map((item) => (
                <li key={item.path}>
                  <SideLink to={item.path} icon={<item.icon />} label={item.label} />
                </li>
              ))}
            </ul>
          </div>
        ))}
        {showDev && (
          <div className="mt-3">
            <div className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-faint uppercase">Developer</div>
            <SideLink to={DEV_NAV.path} icon={<DEV_NAV.icon />} label={DEV_NAV.label} />
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-1 border-t border-line p-2">
        <SideLink to={SETTINGS_NAV.path} icon={<SETTINGS_NAV.icon />} label={SETTINGS_NAV.label} />
        <TaskTray />
        <div className="flex items-center gap-1">
          <ThemeSwitch />
          <Tooltip content="Keyboard shortcuts (?)">
            <button
              type="button"
              onClick={openShortcuts}
              aria-label="Keyboard shortcuts"
              className="grid h-6 w-6 place-items-center rounded-md text-faint hover:bg-surface-3 hover:text-fg"
              data-testid="open-shortcuts"
            >
              <Keyboard size={13} />
            </button>
          </Tooltip>
          {transportKind() === 'mock' && (
            <Tooltip content="Mock transport: no engine, fake data. Open without ?mock to use the engine.">
              <Badge tone="warn" className="ml-auto">
                mock
              </Badge>
            </Tooltip>
          )}
        </div>
      </div>
    </nav>
  )
}

function SideLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex h-7 items-center gap-2 rounded-[5px] px-2 text-[13px] text-muted outline-none hover:bg-surface-3 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 [&_svg]:size-[15px] [&_svg]:shrink-0',
          isActive && 'bg-surface font-medium text-fg shadow-xs ring-1 ring-line [&_svg]:text-accent',
        )
      }
    >
      {icon}
      <span className="truncate">{label}</span>
    </NavLink>
  )
}

// ---------------------------------------------------------------- workspace

function WorkspaceMenu() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const native = hasNativePaths()
  const info = useQuery({ queryKey: ['workspace'], queryFn: () => api.get_workspace_info(), meta: { silent: true } })
  // A switch waiting for "Discard and …" while a page holds unsaved edits.
  const [guard, setGuard] = useState<{ verb: string; what: string[]; run: () => void } | null>(null)

  /**
   * First half of a switch, before the engine changes workspace: take the
   * routed page off screen, now. Its queries name items of the workspace
   * being left (a project, a plate). Three things would refetch them from
   * the new workspace, where they do not exist, and each failure is an error
   * toast: the engine's `changed` events for the switch, which arrive before
   * its reply; resetting the cache under a mounted page; and a page mounted
   * again before the route has changed.
   */
  const leave = () => {
    setGuard(null)
    closeTour()
    flushSync(() => useSwitching.setState((s) => ({ n: s.n + 1 })))
  }
  /**
   * Second half, when the engine call has ended. After a switch, drop what
   * the previous workspace left in the cache and the stores and open Plates;
   * after a failure the page comes back where it was. The page may mount
   * only when the route has changed: `flushSync` makes the router draw the
   * new location before `navigate` resolves (without it the change is a
   * transition, and the page would mount at the old URL first).
   */
  const arrive = async (switched: boolean) => {
    try {
      if (!switched) return
      useImportStore.getState().reset()
      useTaskStore.getState().clearFinished()
      void qc.resetQueries()
      await bypassUnsaved(() => navigate('/plates', { flushSync: true }))
    } finally {
      useSwitching.setState((s) => ({ n: s.n - 1 }))
    }
  }
  /** Run an engine call that replaces the workspace. */
  const switchWorkspace = async <T,>(run: () => Promise<T>): Promise<T> => {
    leave()
    let switched = false
    try {
      const result = await run()
      switched = true
      return result
    } finally {
      await arrive(switched)
    }
  }
  const guarded = (verb: string, run: () => void) => {
    if (hasUnsavedChanges()) setGuard({ verb, what: unsavedDescriptions(), run })
    else run()
  }

  const create = useMutation({
    mutationFn: async () => {
      const path = native ? await pickSavePath('analysis.microspat', EXT) : null
      if (native && !path) return null
      return switchWorkspace(() => api.new_workspace({ path }))
    },
    meta: { errorTitle: 'Could not create workspace' },
  })
  const open = useMutation({
    mutationFn: async () => {
      const path = await pickOpenPath(EXT)
      return path ? switchWorkspace(() => api.open_workspace({ path })) : null
    },
    meta: { errorTitle: 'Could not open workspace' },
  })
  const saveAs = useMutation({
    mutationFn: async () => {
      const path = await pickSavePath(info.data?.name ?? 'analysis.microspat', EXT)
      return path ? api.save_workspace_as({ path }) : null
    },
    onSuccess: (w) => w && toast.success('Workspace saved', w.path ?? undefined),
    meta: { errorTitle: 'Could not save workspace' },
  })
  const demo = useMutation({
    mutationFn: () => api.load_demo_data(),
    onSuccess: (r) => {
      const imported = r.plates.filter((p) => p.status === 'imported').length
      toast.success('Demo data loaded', `${imported} plate${imported === 1 ? '' : 's'} imported`)
    },
    meta: { errorTitle: 'Could not load demo data' },
  })

  // Workspace actions by name, for shortcuts and the desktop app's native menu.
  // One dialog at a time: a native menu accelerator and the keydown handler
  // below can both fire for the same keystroke.
  const dialogOpen = useRef(false)
  const shellOpening = useRef(false)
  const demoRunning = useTaskStore((s) => Object.values(s.tasks).some((t) => t.kind === 'load_demo_data' && t.status === 'running'))
  const actions = useRef<Record<string, () => void>>({})
  useEffect(() => {
    const busySwitching = () => shellOpening.current || useSwitching.getState().n > 0
    const once = (run: () => Promise<unknown>) => () => {
      if (dialogOpen.current || busySwitching()) return
      dialogOpen.current = true
      // Errors are toasted by the mutation cache.
      run()
        .catch(() => {})
        .finally(() => {
          dialogOpen.current = false
        })
    }
    actions.current = {
      new_workspace: () =>
        !busySwitching() &&
        guarded(
          'create a new workspace',
          once(() => create.mutateAsync()),
        ),
      open_workspace: () =>
        !busySwitching() &&
        guarded(
          'open another workspace',
          once(() => open.mutateAsync()),
        ),
      save_workspace_as: once(() => saveAs.mutateAsync()),
      load_demo_data: () => {
        const running = Object.values(useTaskStore.getState().tasks).some((t) => t.kind === 'load_demo_data' && t.status === 'running')
        if (demo.isPending || running || busySwitching()) return
        closeTour()
        demo.mutate()
      },
      start_tour: () => !busySwitching() && openTour(),
      open_settings: () => {
        if (busySwitching()) return
        closeTour()
        void navigate('/settings')
      },
      // A .microspat file from the OS: the desktop app opens it by itself, so
      // it is too late to ask about unsaved edits. It announces the open
      // before it starts, then says how it ended.
      workspace_opening: () => {
        if (shellOpening.current) return
        shellOpening.current = true
        leave()
      },
      workspace_opened: () => {
        if (!shellOpening.current) leave()
        shellOpening.current = false
        void arrive(true)
      },
      workspace_open_failed: () => {
        if (!shellOpening.current) return
        shellOpening.current = false
        void arrive(false)
      },
    }
  })
  useEffect(() => onShellAction((a) => actions.current[a]?.()), [])

  // Global shortcuts for workspace actions and settings.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || overlayOpen() || e.altKey) return
      const mod = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
      if (!mod) return
      const k = e.key.toLowerCase()
      if (k === ',' && !e.shiftKey) {
        e.preventDefault()
        actions.current.open_settings?.()
        return
      }
      if (!native) return
      if (k === 'o' && !e.shiftKey) {
        e.preventDefault()
        actions.current.open_workspace?.()
      } else if (k === 's' && e.shiftKey) {
        e.preventDefault()
        actions.current.save_workspace_as?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [native])

  const name = info.data?.name ?? (info.isError ? 'No engine' : 'Workspace')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-tour="workspace-menu"
          className="m-2 mb-0 flex h-11 items-center gap-2 rounded-md px-2 text-left outline-none hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-accent/40 data-[state=open]:bg-surface-3"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-accent text-accent-fg">
            <Database size={14} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] leading-tight font-semibold tracking-wide text-faint">MicroSPAT</span>
            <span className="block truncate text-[13px] leading-tight font-medium" title={info.data?.path ?? undefined}>
              {name}
            </span>
          </span>
          <ChevronsUpDown size={14} className="shrink-0 text-faint" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Workspace</DropdownMenuLabel>
        {info.data && (
          <div className="px-2 pb-1.5 text-2xs text-muted">
            <div className="truncate" title={info.data.path ?? undefined}>
              {info.data.path ?? 'Not saved yet'}
            </div>
            <ul className="num mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5" aria-label={workspaceCountsText(info.data.counts)}>
              {workspaceCounts(info.data.counts).map((c) => (
                <li key={c} className="whitespace-nowrap">
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => actions.current.new_workspace?.()}>
          <FilePlus2 /> New workspace…
        </DropdownMenuItem>
        {native && (
          <>
            <DropdownMenuItem onSelect={() => actions.current.open_workspace?.()} shortcut={kbd('⌘O')}>
              <FolderOpen /> Open…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.current.save_workspace_as?.()} shortcut={kbd('⇧⌘S')}>
              <Save /> Save as…
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => actions.current.load_demo_data?.()} disabled={demo.isPending || demoRunning}>
          <Sparkles /> Load demo data
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openTour()}>
          <Compass /> Take the tour
        </DropdownMenuItem>
      </DropdownMenuContent>
      <ConfirmDialog
        open={guard != null}
        onOpenChange={(o) => !o && setGuard(null)}
        destructive
        title="Discard unsaved changes?"
        description={
          guard && (
            <span data-testid="workspace-unsaved-prompt">
              You have unsaved{' '}
              {guard.what.length === 1 ? guard.what[0] : `${guard.what.slice(0, -1).join(', ')} and ${guard.what[guard.what.length - 1]}`}.
              To {guard.verb}, they are discarded.
            </span>
          )
        }
        cancelLabel="Keep editing"
        confirmLabel="Discard and continue"
        onConfirm={() => {
          const run = guard?.run
          setGuard(null)
          run?.()
        }}
      />
    </DropdownMenu>
  )
}

// ---------------------------------------------------------------- tasks

function TaskTray() {
  const tasksMap = useTaskStore((s) => s.tasks)
  const dismiss = useTaskStore((s) => s.dismiss)
  const clearFinished = useTaskStore((s) => s.clearFinished)
  const tasks = sortTasks(tasksMap)
  const running = tasks.filter((t) => t.status === 'running')
  const failed = tasks.filter((t) => t.status === 'failed')
  const [open, setOpen] = useState(false)

  // Finished tasks fade from the tray after a while; failures stay.
  useEffect(() => {
    const done = tasks.filter((t) => t.status === 'done')
    if (done.length === 0) return
    const timer = setTimeout(() => done.forEach((t) => dismiss(t.id)), 6000)
    return () => clearTimeout(timer)
  }, [tasks, dismiss])

  const head = running[0]
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Background tasks"
          data-testid="task-tray"
          className="flex min-h-8 w-full flex-col justify-center gap-1 rounded-md px-2 py-1 text-left text-xs text-muted outline-none hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <span className="flex items-center gap-2">
            {running.length ? (
              <Spinner className="size-3 text-accent" />
            ) : failed.length ? (
              <CircleAlert size={13} className="text-danger" />
            ) : (
              <ListChecks size={13} />
            )}
            <span className="min-w-0 flex-1 truncate">
              {head ? head.label : failed.length ? `${failed.length} task${failed.length > 1 ? 's' : ''} failed` : 'No running tasks'}
            </span>
            {running.length > 1 && <span className="num text-2xs text-faint">+{running.length - 1}</span>}
          </span>
          {head && <ProgressBar value={head.progress} label={head.label} className="h-1" />}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="end"
          sideOffset={10}
          className="z-50 w-80 rounded-lg border border-line bg-surface shadow-xl data-[state=open]:animate-[fade-in_100ms_ease-out]"
        >
          <div className="flex h-9 items-center border-b border-line px-3">
            <span className="text-xs font-semibold">Tasks</span>
            {tasks.some((t) => t.status !== 'running') && (
              <button type="button" onClick={clearFinished} className="ml-auto text-2xs text-muted hover:text-fg">
                Clear finished
              </button>
            )}
          </div>
          <ul className="max-h-80 overflow-auto p-1">
            {tasks.length === 0 && <li className="p-4 text-center text-xs text-muted">Nothing running.</li>}
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} onDismiss={() => dismiss(t.id)} />
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function TaskRow({ task: t, onDismiss }: { task: TrackedTask; onDismiss: () => void }) {
  return (
    <li className="group flex gap-2 rounded-md px-2 py-2 hover:bg-surface-2">
      <span className="mt-0.5">
        {t.status === 'running' ? (
          <Spinner className="size-3 text-accent" />
        ) : t.status === 'done' ? (
          <CircleCheck size={13} className="text-ok" />
        ) : (
          <CircleAlert size={13} className="text-danger" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-medium">{t.label}</span>
          {t.progress != null && t.status === 'running' && (
            <span className="num ml-auto text-2xs text-muted">{Math.round(t.progress * 100)}%</span>
          )}
        </div>
        {t.status === 'running' && <ProgressBar value={t.progress} className="mt-1.5 h-1" />}
        {t.message && <div className={cn('mt-1 text-2xs', t.status === 'failed' ? 'text-danger' : 'text-muted')}>{t.message}</div>}
      </div>
      {t.status !== 'running' && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="self-start text-faint opacity-0 group-hover:opacity-100 hover:text-fg"
        >
          <X size={12} />
        </button>
      )}
    </li>
  )
}

// ---------------------------------------------------------------- theme

function ThemeSwitch() {
  const pref = useThemeStore((s) => s.pref)
  const setPref = useThemeStore((s) => s.setPref)
  const opts: { v: ThemePref; icon: React.ReactNode; label: string }[] = [
    { v: 'light', icon: <Sun size={13} />, label: 'Light' },
    { v: 'dark', icon: <Moon size={13} />, label: 'Dark' },
    { v: 'system', icon: <Monitor size={13} />, label: 'Follow system' },
  ]
  return (
    <div role="radiogroup" aria-label="Theme" className="flex rounded-md border border-line bg-surface p-0.5">
      {opts.map((o) => (
        <Tooltip key={o.v} content={o.label}>
          <button
            type="button"
            role="radio"
            aria-checked={pref === o.v}
            aria-label={o.label}
            onClick={() => setPref(o.v)}
            className={cn('grid h-5 w-6 place-items-center rounded-[4px] text-faint hover:text-fg', pref === o.v && 'bg-surface-3 text-fg')}
          >
            {o.icon}
          </button>
        </Tooltip>
      ))}
    </div>
  )
}
