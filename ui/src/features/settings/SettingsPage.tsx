/** Workspace quality limits (stored in the workspace file) and application preferences (stored in this browser). */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Monitor, Moon, RotateCcw, Settings as SettingsIcon, Sun, Undo2 } from 'lucide-react'
import type { Settings, UpdateSettingsParams } from '@/api/bindings'
import { api } from '@/api/client'
import { apiQuery } from '@/api/query'
import { transportKind } from '@/api/transport'
import { workspaceCountsText } from '@/app/AppShell'
import { ParameterSections, useParameterForm } from '@/components/form/ParameterForm'
import { nonDefaultKeys } from '@/components/form/schema'
import { SelectField } from '@/components/form/fields'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/ProgressBar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { QUALITY_MEASURES, type QualityMeasure } from '@/features/plates/model/quality'
import { Page, PageHeader } from '@/layouts/layouts'
import { cn } from '@/lib/cn'
import { countOf } from '@/lib/format'
import { overlayOpen } from '@/lib/keys'
import { useUnsavedChanges } from '@/lib/unsaved'
import { countSavedPanels, resetPanelSizes, usePreferencesStore, type PlateMode } from '@/stores/preferences'
import { useThemeStore, type ThemePref } from '@/stores/theme'
import { toast } from '@/stores/toasts'
import { settingsToValues, valuesToUpdate, workspaceSettingsSchema } from './model'

type Tab = 'workspace' | 'application'

export default function SettingsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('workspace')
  const settings = useQuery(apiQuery(['settings'], 'get_settings'))
  const savedValues = useMemo(() => (settings.data ? settingsToValues(settings.data) : null), [settings.data])
  const form = useParameterForm(workspaceSettingsSchema, savedValues)
  useUnsavedChanges(form.isDirty, 'workspace settings')

  const save = useMutation({
    mutationFn: ({ patch }: { patch: UpdateSettingsParams; count: number; reset: boolean }) => api.update_settings(patch),
    meta: { errorTitle: 'Could not save settings' },
    onSuccess: (s, vars) => {
      qc.setQueryData<Settings>(['settings'], s)
      toast.success(
        'Settings saved',
        vars.reset
          ? 'Restored default limits. Plate quality reports now use the defaults.'
          : `${countOf(vars.count, 'limit')} changed. Plate quality reports now use the new limits.`,
      )
    },
  })

  const { isDirty, revert } = form
  const saving = save.isPending
  useEffect(() => {
    if (tab !== 'workspace' || !isDirty || saving) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !overlayOpen()) {
        e.preventDefault()
        revert()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab, isDirty, saving, revert])

  return (
    <Page header={<PageHeader icon={<SettingsIcon />} title="Settings" subtitle="Workspace quality limits and application preferences" />}>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex min-h-0 flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="workspace">
            Workspace
            {form.isDirty && <span className="size-1.5 rounded-full bg-accent" aria-label="unsaved changes" />}
          </TabsTrigger>
          <TabsTrigger value="application">Application</TabsTrigger>
        </TabsList>
        <TabsContent value="workspace" className="flex flex-col">
          {settings.isPending ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner className="size-4" />
            </div>
          ) : (
            <WorkspaceTab
              form={form}
              disabled={!settings.data}
              busy={save.isPending}
              onSave={(patch, count) => save.mutate({ patch, count, reset: patch.reset_defaults === true })}
            />
          )}
        </TabsContent>
        <TabsContent value="application" className="overflow-auto">
          <ApplicationTab />
        </TabsContent>
      </Tabs>
    </Page>
  )
}

// ------------------------------------------------------------------ workspace tab

function WorkspaceTab({
  form,
  disabled,
  busy,
  onSave,
}: {
  form: ReturnType<typeof useParameterForm>
  disabled: boolean
  busy: boolean
  onSave: (patch: UpdateSettingsParams, count: number) => void
}) {
  const nonDefault = nonDefaultKeys(workspaceSettingsSchema, form.values)
  const off = disabled || busy

  return (
    <form
      data-testid="settings-form"
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault()
        if (form.isDirty && form.isValid && !busy) {
          onSave(valuesToUpdate(form.values, form.dirty), form.dirty.length)
        }
      }}
    >
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="flex max-w-4xl flex-col gap-5">
          <p className="text-xs text-muted">Saved inside this workspace file. Changing limits updates stored plate quality reports at once.</p>
          <ParameterSections schema={workspaceSettingsSchema} form={form} disabled={off} columnWidth={210} />
        </div>
      </div>
      <div className="sticky bottom-0 flex shrink-0 items-center gap-2 border-t border-line bg-surface px-4 py-2">
        <span className="text-xs text-muted" aria-live="polite">
          {form.isDirty
            ? `${form.dirty.length} unsaved change${form.dirty.length > 1 ? 's' : ''}`
            : nonDefault.length
              ? `${nonDefault.length} changed from default`
              : 'Defaults'}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={form.resetToDefaults}
            disabled={off || nonDefault.length === 0}
            title="Set all limits to their defaults (then Save)"
          >
            <RotateCcw size={12} /> Defaults
          </Button>
          <Button size="sm" variant="ghost" onClick={form.revert} disabled={off || !form.isDirty} title="Discard edits (Esc)">
            <Undo2 size={12} /> Revert
          </Button>
          <Button size="sm" variant="primary" type="submit" disabled={off || !form.isDirty || !form.isValid}>
            {busy && <Spinner className="size-3" />}
            Save
          </Button>
        </div>
      </div>
    </form>
  )
}

// ------------------------------------------------------------------ application tab

const THEMES: { value: ThemePref; label: string; icon: ReactNode }[] = [
  { value: 'light', label: 'Light', icon: <Sun size={13} /> },
  { value: 'dark', label: 'Dark', icon: <Moon size={13} /> },
  { value: 'system', label: 'Follow system', icon: <Monitor size={13} /> },
]

const PLATE_MODES: { value: PlateMode; label: string }[] = [
  { value: 'ladder', label: 'Ladder' },
  { value: 'signal', label: 'Signal' },
  { value: 'quality', label: 'Quality' },
]

function Section({ title, description, children, testId }: { title: string; description?: string; children: ReactNode; testId?: string }) {
  return (
    <section className="flex flex-col gap-2" data-testid={testId}>
      <h2 className="flex items-center gap-2 text-2xs font-semibold tracking-wide text-faint uppercase">
        {title}
        <span className="h-px flex-1 bg-line" />
      </h2>
      {description && <p className="text-xs text-muted">{description}</p>}
      {children}
    </section>
  )
}

function ApplicationTab() {
  const themePref = useThemeStore((s) => s.pref)
  const setThemePref = useThemeStore((s) => s.setPref)
  const plateMode = usePreferencesStore((s) => s.plateMode)
  const setPlateMode = usePreferencesStore((s) => s.setPlateMode)
  const qualityMeasure = usePreferencesStore((s) => s.qualityMeasure)
  const setQualityMeasure = usePreferencesStore((s) => s.setQualityMeasure)
  const [panels, setPanels] = useState(countSavedPanels)

  return (
    <div className="flex max-w-3xl flex-col gap-6 p-4">
      <p className="text-xs text-muted">Kept in this browser for every workspace. Changes apply immediately.</p>

      <Section title="Appearance">
        <div role="radiogroup" aria-label="Theme" className="flex flex-wrap gap-1.5">
          {THEMES.map((t) => {
            const on = themePref === t.value
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setThemePref(t.value)}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-[5px] border px-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-accent/25',
                  on ? 'border-accent bg-accent/10 font-medium text-fg' : 'border-line-strong bg-surface text-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                {t.icon}
                {t.label}
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="Plates defaults" description="What the plate view shows when you open a plate.">
        <div className="grid gap-x-4 gap-y-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
          <SelectField label="Default plate view" value={plateMode} onChange={(v) => setPlateMode(v as PlateMode)} options={PLATE_MODES} />
          <SelectField
            label="Default quality measure"
            value={qualityMeasure}
            onChange={(v) => setQualityMeasure(v as QualityMeasure)}
            options={[...QUALITY_MEASURES]}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={panels === 0}
            onClick={() => {
              const n = resetPanelSizes()
              setPanels(countSavedPanels())
              toast.success('Panel sizes reset', `${countOf(n, 'panel')} back to the default size.`)
            }}
          >
            <RotateCcw size={12} /> Reset panel sizes
          </Button>
          <span className="text-xs text-muted">{panels === 0 ? 'All panels use their default size.' : `${countOf(panels, 'panel')} resized.`}</span>
        </div>
      </Section>

      <WorkspaceInfoSection />

      <Section title="Where other settings live">
        <ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-muted">
          <li>Ladder fitting and peak scanning parameters belong to each ladder, on the Ladders page.</li>
          <li>Analysis parameters for each project and locus are on the Parameters tab inside each estimator and genotyping project.</li>
          <li>Internal measurement constants are fixed and cannot be changed.</li>
        </ul>
      </Section>
    </div>
  )
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function WorkspaceInfoSection() {
  const info = useQuery(apiQuery(['workspace'], 'get_workspace_info'))
  const rows: [string, ReactNode][] = info.data
    ? [
        ['Workspace name', info.data.name],
        ['Path', info.data.path ?? 'Untitled workspace (not saved yet)'],
        ['File size', fmtBytes(info.data.file_size)],
        ['Contents', workspaceCountsText(info.data.counts)],
        ['Schema version', String(info.data.schema_version)],
        ['App version', info.data.app_version],
        ['Transport', transportKind()],
      ]
    : []
  return (
    <Section title="Workspace and app info" testId="settings-workspace-info">
      {info.isPending ? (
        <Spinner className="size-4" />
      ) : (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="min-w-0 break-all text-fg">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </Section>
  )
}
