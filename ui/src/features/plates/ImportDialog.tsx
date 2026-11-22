/**
 * Import plates: choose or drop zips, folders and loose .fsa files, choose
 * the ladder, start. The import is an engine task; the dialog can be closed
 * while it runs and shows the per-plate outcome when it finishes.
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { FileArchive, Folder, FileText, X } from 'lucide-react'
import type { Ladder, PlateImportOutcome } from '@/api/bindings'
import { Badge, StatusChip } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { FileDropZone } from '@/components/ui/FileDropZone'
import { ProgressBar, Spinner } from '@/components/ui/ProgressBar'
import { Field, SelectInput } from '@/components/form/fields'
import { sortTasks, useTaskStore } from '@/stores/tasks'
import { cn } from '@/lib/cn'
import { describeFiles, qualityFindings, sortOutcomes, summarizeImport } from './model/importSummary'
import { useImportStore } from './importStore'
import { SizingCountsInline } from './parts'
import { QualityIndicator, SeverityIcon } from './QualityPanel'

export function ImportDialog({
  open,
  onOpenChange,
  ladders,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  ladders: readonly Ladder[]
}) {
  const s = useImportStore()
  const navigate = useNavigate()
  const groups = useMemo(() => describeFiles(s.files), [s.files])
  const task = useTaskStore((st) => sortTasks(st.tasks).find((t) => t.kind === 'import_plates' && t.status === 'running'))
  // Last ladder used for an import, else the one most plates use.
  const mostUsed = ladders.reduce<Ladder | undefined>((b, l) => (!b || l.plate_count > b.plate_count ? l : b), undefined)
  const ladderId = s.ladderId != null && ladders.some((l) => l.id === s.ladderId) ? s.ladderId : (mostUsed?.id ?? null)
  const ready = s.files.length > 0 && ladderId != null && !s.running

  const start = () => {
    if (ladderId != null && ladderId !== s.ladderId) s.setLadder(ladderId)
    void s.start()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Import plates"
      description="Zip archives or folders of one plate each, or loose .fsa files (grouped by the plate name stored in the files). Every well is sized with the chosen ladder."
      width="lg"
      footer={
        <>
          {s.outcomes && !s.running && (
            <Button variant="ghost" className="mr-auto" onClick={s.reset}>
              Import more
            </Button>
          )}
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {s.running ? 'Run in background' : 'Close'}
          </Button>
          {!s.outcomes && (
            <Button variant="primary" onClick={start} disabled={!ready} data-testid="start-import">
              {s.running ? <Spinner className="size-3" /> : null}
              {s.running ? 'Importing…' : `Import${s.files.length ? ` ${groups.length} item${groups.length === 1 ? '' : 's'}` : ''}`}
            </Button>
          )}
        </>
      }
    >
      {s.outcomes ? (
        <Outcomes
          outcomes={s.outcomes}
          onOpen={(id, quality) => {
            onOpenChange(false)
            navigate(`/plates/${id}${quality ? '?tab=quality' : ''}`)
          }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <FileDropZone
              multiple
              extensions={['zip', 'fsa']}
              disabled={s.running}
              title="Choose or drop files"
              hint=".zip archives and .fsa files"
              onFiles={s.addFiles}
            />
            <FileDropZone
              directory
              multiple
              disabled={s.running}
              title="Choose a folder"
              hint="A plate’s folder of .fsa files"
              onFiles={s.addFiles}
            />
          </div>
          {groups.length > 0 && (
            <ul className="flex max-h-48 flex-col divide-y divide-line overflow-auto rounded-md border border-line" aria-label="Files to import">
              {groups.map((g) => (
                <li key={g.key} className="flex h-8 items-center gap-2 px-2 text-xs">
                  {g.detail === 'zip archive' ? (
                    <FileArchive size={13} className="text-faint" />
                  ) : g.detail === 'folder' ? (
                    <Folder size={13} className="text-faint" />
                  ) : (
                    <FileText size={13} className="text-faint" />
                  )}
                  <span className="truncate font-medium text-fg">{g.label}</span>
                  <span className="text-muted">{g.detail}</span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="ml-auto"
                    aria-label={`Remove ${g.label}`}
                    disabled={s.running}
                    onClick={() => s.removeFiles(g.paths)}
                  >
                    <X size={12} />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Field label="Ladder" help="The size standard run in every well of these plates. You can switch a plate to another ladder later; that re-sizes it.">
            <SelectInput
              aria-label="Ladder"
              value={ladderId == null ? '' : String(ladderId)}
              onChange={(v) => s.setLadder(Number(v))}
              disabled={s.running}
              placeholder="Choose a ladder"
              options={ladders.map((l) => ({
                value: String(l.id),
                label: `${l.label} · ${l.spec.color} · ${l.spec.base_sizes.length} sizes`,
              }))}
            />
          </Field>
          {s.running && (
            <div className="flex flex-col gap-1.5 rounded-md border border-line bg-surface-2 p-2.5" role="status" aria-live="polite">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{task?.label ?? 'Importing…'}</span>
                <span className="num text-muted">{task?.progress != null ? `${Math.round(task.progress * 100)}%` : ''}</span>
              </div>
              <ProgressBar value={task?.progress ?? null} label="Import progress" />
              <span className="truncate text-2xs text-muted">{task?.message ?? 'Starting'}</span>
              <span className="text-2xs text-faint">You can close this dialog; the import keeps running and the plates appear as they finish.</span>
            </div>
          )}
          {s.error && (
            <p className="rounded-md border border-danger/40 bg-danger-soft px-2.5 py-2 text-xs text-danger" role="alert">
              {s.error}
            </p>
          )}
        </div>
      )}
    </Dialog>
  )
}

const STATUS = {
  imported: { chip: 'ok', label: 'Imported' },
  duplicate: { chip: 'flagged', label: 'Duplicate' },
  failed: { chip: 'failed', label: 'Failed' },
} as const

function Outcomes({ outcomes, onOpen }: { outcomes: PlateImportOutcome[]; onOpen: (id: number, quality?: boolean) => void }) {
  const sum = summarizeImport(outcomes)
  const rows = sortOutcomes(outcomes)
  const findings = qualityFindings(outcomes)
  return (
    <div className="flex flex-col gap-2" data-testid="import-outcomes">
      <div className={cn('flex items-center gap-2 text-sm font-medium', sum.tone === 'danger' ? 'text-danger' : sum.tone === 'warn' ? 'text-warn' : 'text-ok')}>
        {sum.headline}
      </div>
      {sum.imported > 0 && (
        <p className="text-xs text-muted">
          {sum.wells.toLocaleString('en-US')} wells sized
          {sum.unsized ? `; ${sum.unsized} did not size and can be fixed by hand in the plate view.` : '.'}
        </p>
      )}
      {findings.length > 0 && (
        <div className="flex flex-col gap-0.5 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-xs" data-testid="import-quality" role="status">
          <span className="text-muted">The quality check found something to look at:</span>
          {findings.map((f) => (
            <span key={f.plateId} className="flex items-center gap-1.5">
              <SeverityIcon severity={f.worst} />
              <span className="text-fg">{f.text}</span>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onOpen(f.plateId, true)} aria-label={`Show the quality report of ${f.label}`}>
                Show report
              </Button>
            </span>
          ))}
        </div>
      )}
      <ul className="flex max-h-[44vh] flex-col divide-y divide-line overflow-auto rounded-md border border-line">
        {rows.map((o, i) => (
          <li key={`${o.label}-${i}`} className="flex flex-col gap-0.5 px-2.5 py-1.5 text-xs">
            <div className="flex items-center gap-2">
              <StatusChip status={STATUS[o.status].chip} label={STATUS[o.status].label} />
              <span className="truncate font-medium text-fg">{o.label}</span>
              {o.status === 'imported' && o.sizing && <SizingCountsInline counts={o.sizing} total={o.well_count} className="ml-1" />}
              {o.status === 'imported' && <QualityIndicator summary={o.quality} short className="ml-1 min-w-0" />}
              {o.status === 'imported' && o.plate_id != null && (
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onOpen(o.plate_id as number)}>
                  Open
                </Button>
              )}
            </div>
            <div className="flex gap-2 pl-0.5 text-2xs text-muted">
              <span className="truncate" title={o.source}>
                {o.source}
              </span>
              {o.well_count > 0 && <Badge>{o.well_count} wells</Badge>}
            </div>
            {o.message && <div className={cn('text-2xs', o.status === 'failed' ? 'text-danger' : 'text-muted')}>{o.message}</div>}
          </li>
        ))}
      </ul>
    </div>
  )
}
