/**
 * Exports: alleles (wide and long) and peak data as CSV, saved through the
 * transport (a save dialog in the desktop app, a download in the browser).
 * The engine refuses stale or unanalyzed loci unless told otherwise; this
 * screen says so up front and lets the user export anyway, knowingly.
 */
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { api } from '@/api/client'
import type { ProjectDetail, TextFile } from '@/api/bindings'
import { isRpcError, saveTextFile } from '@/api/transport'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/form/fields'
import { Spinner } from '@/components/ui/ProgressBar'
import { toastExported } from '@/features/projects-shared/exportCsv'
import { lociNeedingAnalysis } from '@/features/projects-shared/status'
import { StatusIcon } from '@/features/projects-shared/StatusBits'

type Kind = 'wide' | 'long' | 'peaks'

const EXPORTS: { kind: Kind; title: string; text: string; columns: string }[] = [
  {
    kind: 'wide',
    title: 'Alleles, one row per sample',
    text: 'One column per locus; every called allele of the sample at that locus, joined by “;” in size order. Empty when nothing was called (failed, no run, or no allele).',
    columns: 'Sample, then one column per locus',
  },
  {
    kind: 'long',
    title: 'Alleles, one row per allele',
    text: 'Each called allele of each sample at each locus, with its size and height; Proportion, its share of the called signal (height minus expected artifact, over every called peak), and Corrected Proportion, the same corrected for amplification bias; its probability; the sample’s model MOI; and whether the call is reviewed (True only while the call is unchanged since it was marked).',
    columns: 'Sample, Locus, Allele, Size, Height, Proportion, Corrected Proportion, Probability, MOI, Reviewed',
  },
  {
    kind: 'peaks',
    title: 'Peak data',
    text: 'Every peak of every reference run (failed calls are left out), called or not, with artifact expectation, flags, bin and probability: the columns of the old MicroSPAT peak export. Proportion and Corrected Proportion are shares of the called signal, the same numbers as in the long alleles export, and NA for peaks that are not called. The old meaning, height over every peak of the run, is the column Height Share of All Peaks; the last two give the deepest other-dye dip under the peak relative to its signal and whether it was rejected for a spectral breakdown.',
    columns:
      'Sample, Locus, Peak Height, Relative Peak Height, Proportion, Corrected Proportion, … Probability, Well, Artifact Flag, …, Crosstalk Flag, Height Share of All Peaks, Spectral Dip Ratio, Spectral Flag',
  },
]

export function ExportTab({ detail }: { detail: ProjectDetail }) {
  const p = detail.project
  const needs = lociNeedingAnalysis(detail.loci)
  const probStale = p.probabilities?.state === 'stale'
  const probNone = p.probabilities?.state === 'not_analyzed'
  const blocked = needs.length > 0 || probStale
  const [allowStale, setAllowStale] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = useMutation({
    mutationFn: async (k: Kind): Promise<TextFile | null> => {
      const params = { id: p.id, ...(allowStale ? { allow_stale: true } : {}) }
      const f =
        k === 'wide'
          ? await api.export_alleles_wide(params)
          : k === 'long'
            ? await api.export_alleles_long(params)
            : await api.export_peak_data(params)
      return (await saveTextFile(f.filename, f.content)) ? f : null
    },
    meta: { silent: true },
    onMutate: () => setError(null),
    onSuccess: (f) => f && toastExported(f),
    onError: (e) => setError(isRpcError(e) || e instanceof Error ? e.message : String(e)),
  })
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-bg" data-testid="export-tab">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4">
        {blocked || probNone ? (
          <div className="rounded border border-warn/30 bg-warn-soft p-3 text-xs" role="status" data-testid="export-warning">
            <p className="flex items-center gap-1.5 font-medium">
              <StatusIcon view={{ state: 'stale' }} size={13} /> Some results are not current
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
              {needs.map((l) => (
                <li key={l.locus_id}>
                  {l.label}:{' '}
                  {l.status.state === 'not_analyzed'
                    ? 'not analyzed — its column will be empty'
                    : `stale (${l.status.reasons.join('; ') || 'inputs changed'}) — the file would hold the previous calls`}
                </li>
              ))}
              {probStale && <li>Peak probabilities and MOI are stale — probabilities and MOI in the file would be the previous ones.</li>}
              {probNone && <li>Peak probabilities have not been calculated — Probability and MOI columns will be empty.</li>}
            </ul>
            {blocked && (
              <label className="mt-2 flex items-center gap-2">
                <Checkbox checked={allowStale} onChange={setAllowStale} aria-label="Export anyway" />
                Export anyway, with results that are not current
              </label>
            )}
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <StatusIcon view={{ state: 'current' }} size={13} /> Every locus and the probabilities are current. Curated calls are exported
            as curated.
          </p>
        )}
        {EXPORTS.map((e) => (
          <section key={e.kind} className="flex items-start gap-3 rounded border border-line bg-surface p-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold">{e.title}</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{e.text}</p>
              <p className="mt-1 font-mono text-2xs text-faint">{e.columns}</p>
            </div>
            <Button
              variant="primary"
              disabled={run.isPending || (blocked && !allowStale)}
              onClick={() => run.mutate(e.kind)}
              data-testid={`export-${e.kind}`}
            >
              {run.isPending && run.variables === e.kind ? <Spinner className="size-3" /> : <Download size={12} />} Export CSV
            </Button>
          </section>
        ))}
        {error && (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
