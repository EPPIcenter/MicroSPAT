/** Import loci from CSV with a preview of what will be created or rejected. */
import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, CircleX } from 'lucide-react'
import type { Locus } from '@/api/bindings'
import { api } from '@/api/client'
import { cn } from '@/lib/cn'
import { countOf } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { DyeChip } from '@/components/ui/Badge'
import { Dialog } from '@/components/ui/Dialog'
import { Spinner } from '@/components/ui/ProgressBar'
import { toast } from '@/stores/toasts'
import { LOCI_CSV_HEADER, previewLociCsv, validRowsCsv } from './importPreview'
import { findOverlaps } from './overlap'
import { Banner, CsvTextInput, errorText } from './shared'

const EXAMPLE = `${LOCI_CSV_HEADER.join(',')}\nPfPK2,150,210,3,blue\nTA1,160,200,3,green`

export function ImportLociDialog({
  open,
  onOpenChange,
  existing,
  onImported,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  existing: readonly Locus[]
  onImported?: (created: Locus[]) => void
}) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const labels = useMemo(() => existing.map((l) => l.label), [existing])
  const preview = useMemo(() => (text.trim() ? previewLociCsv(text, labels) : null), [text, labels])
  const imp = useMutation({
    meta: { silent: true },
    mutationFn: () => api.import_loci_csv({ content: validRowsCsv(preview!) }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['loci'] })
      toast.success(`Imported ${countOf(r.created.length, 'locus', 'loci')}`)
      onImported?.(r.created)
      setText('')
      onOpenChange(false)
    },
  })
  const close = (v: boolean) => {
    if (!v) {
      setText('')
      imp.reset()
    }
    onOpenChange(v)
  }
  const n = preview?.valid ?? 0
  // Overlaps the new loci would create on their dye (with existing loci or each other).
  const newOverlaps = useMemo(() => {
    if (!preview) return []
    const fresh = preview.rows.flatMap((r, i) => (r.locus ? [{ ...r.locus, id: -1 - i }] : []))
    return findOverlaps([...existing, ...fresh]).filter((o) => o.a.id < 0 || o.b.id < 0)
  }, [preview, existing])
  return (
    <Dialog
      open={open}
      onOpenChange={close}
      width="lg"
      title="Import loci from CSV"
      description="Each row creates one locus. Rows with problems are skipped; nothing is created until you import."
      footer={
        <>
          <Button onClick={() => close(false)}>Cancel</Button>
          <Button variant="primary" disabled={!preview || n === 0 || !!preview.headerError || imp.isPending} onClick={() => imp.mutate()}>
            {imp.isPending && <Spinner className="size-3" />}
            {preview && preview.rejected > 0 && n > 0 ? `Import ${countOf(n, 'valid locus', 'valid loci')}` : `Import ${countOf(n, 'locus', 'loci')}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="rounded-md bg-surface-2 px-2.5 py-2 text-xs">
          <div className="mb-1 text-muted">Expected header (any column order, case and punctuation ignored):</div>
          <code className="block font-mono text-2xs break-all text-fg" data-testid="loci-csv-header">
            {LOCI_CSV_HEADER.join(',')}
          </code>
          <div className="mt-1 text-2xs text-muted">Sizes in bp; Color is blue, green, yellow, red or orange.</div>
        </div>
        <CsvTextInput value={text} onChange={(t) => setText(t)} placeholder={EXAMPLE} rows={5} />
        {imp.isError && <Banner tone="danger">{errorText(imp.error)}</Banner>}
        {preview?.headerError && <Banner tone="danger">{preview.headerError}</Banner>}
        {preview && !preview.headerError && (
          <div className="flex flex-col gap-1.5" data-testid="loci-import-preview">
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-ok">
                <CheckCircle2 size={13} /> {countOf(preview.valid, 'to create', 'to create')}
              </span>
              {preview.rejected > 0 && (
                <span className="flex items-center gap-1 text-danger">
                  <CircleX size={13} /> {preview.rejected} rejected
                </span>
              )}
            </div>
            {newOverlaps.length > 0 && (
              <Banner tone="warn">
                Overlapping size ranges on the same dye after import:{' '}
                {newOverlaps.map((o) => `${o.a.label} / ${o.b.label} (${o.color}, ${o.from}–${o.to} bp)`).join('; ')}. Peaks in a shared range can be assigned to the
                wrong locus.
              </Banner>
            )}
            <div className="max-h-64 overflow-auto rounded-md border border-line">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-2 text-2xs text-muted uppercase">
                  <tr>
                    <th className="px-2 py-1 text-right font-semibold">Line</th>
                    <th className="px-2 py-1 text-left font-semibold">Label</th>
                    <th className="px-2 py-1 text-left font-semibold">Dye</th>
                    <th className="px-2 py-1 text-right font-semibold whitespace-nowrap">Range (bp)</th>
                    <th className="px-2 py-1 text-right font-semibold">Repeat</th>
                    <th className="px-2 py-1 text-left font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.line} className={cn('border-t border-line/60', !r.locus && 'bg-danger-soft/50')}>
                      <td className="num px-2 py-1 text-right text-faint">{r.line}</td>
                      <td className="px-2 py-1 font-medium">{r.label || <span className="text-faint">(empty)</span>}</td>
                      <td className="px-2 py-1">{r.locus ? <DyeChip color={r.locus.color} /> : <span className="text-muted">–</span>}</td>
                      <td className="num px-2 py-1 text-right">{r.locus ? `${r.locus.min_base_length}–${r.locus.max_base_length}` : '–'}</td>
                      <td className="num px-2 py-1 text-right">{r.locus?.nucleotide_repeat_length ?? '–'}</td>
                      <td className={cn('px-2 py-1', r.locus ? 'text-ok' : 'text-danger')}>{r.locus ? 'Create' : r.problems.join('; ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
