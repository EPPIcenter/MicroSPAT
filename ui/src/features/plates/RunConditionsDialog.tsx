/** Instrument run conditions (voltage, current, power, temperature) over the run. */
import { useMemo } from 'react'
import type { Color, PlateSummary } from '@/api/bindings'
import { TraceViewer } from '@/components/TraceViewer'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/ProgressBar'
import { fmtNumber } from '@/lib/format'
import { useRunTraces } from './queries'

const TRACES: { key: 'voltage' | 'current' | 'power' | 'temperature'; label: string; unit: string; color: Color }[] = [
  { key: 'voltage', label: 'Voltage', unit: 'raw', color: 'blue' },
  { key: 'current', label: 'Current', unit: 'raw', color: 'green' },
  { key: 'power', label: 'Power', unit: 'raw', color: 'orange' },
  { key: 'temperature', label: 'Temperature', unit: '°C', color: 'red' },
]

export function RunConditionsDialog({ plate, open, onOpenChange }: { plate: PlateSummary; open: boolean; onOpenChange: (o: boolean) => void }) {
  const q = useRunTraces(plate.id, open)
  const stats = useMemo(() => {
    if (!q.data) return null
    return Object.fromEntries(
      TRACES.map((t) => {
        const v = q.data[t.key]
        if (!v.length) return [t.key, null]
        let lo = Infinity
        let hi = -Infinity
        let sum = 0
        for (const x of v) {
          lo = Math.min(lo, x)
          hi = Math.max(hi, x)
          sum += x
        }
        return [t.key, { lo, hi, mean: sum / v.length }]
      }),
    ) as Record<string, { lo: number; hi: number; mean: number } | null>
  }, [q.data])

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Run conditions · ${plate.label}`}
      description="Recorded by the instrument over the run, in its raw units. A drop in current or a temperature excursion often explains weak or shifted signal across a plate."
      width="xl"
    >
      {q.isLoading ? (
        <div className="grid h-40 place-items-center text-muted">
          <Spinner />
        </div>
      ) : q.isError ? (
        <EmptyState title="Could not load run conditions">{(q.error as Error).message}</EmptyState>
      ) : q.data && TRACES.every((t) => q.data[t.key].length === 0) ? (
        <EmptyState title="No run conditions recorded">The FSA files of this plate do not contain run-condition traces.</EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {TRACES.map((t) => {
            const data = q.data?.[t.key] ?? []
            const s = stats?.[t.key]
            return (
              <div key={t.key} className="flex flex-col gap-0.5">
                <div className="flex items-baseline gap-2 text-xs">
                  <span className="font-medium">{t.label}</span>
                  {s && (
                    <span className="num text-muted">
                      mean {fmtNumber(s.mean, 1)} · range {fmtNumber(s.lo, 0)}–{fmtNumber(s.hi, 0)}
                    </span>
                  )}
                </div>
                {data.length ? (
                  <TraceViewer
                    className="h-[104px] w-full"
                    ariaLabel={`${t.label} over the run`}
                    series={[{ id: t.key, color: t.color, data, label: t.label }]}
                    xMode="index"
                    xLabel="sample"
                    yLabel={t.unit}
                    showControls={false}
                    showLegend={false}
                  />
                ) : (
                  <div className="text-2xs text-faint">not recorded</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Dialog>
  )
}
