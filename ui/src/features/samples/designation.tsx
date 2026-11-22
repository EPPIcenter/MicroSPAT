/** Designation names and badge. */
import type { Designation } from '@/api/bindings'
import { Badge } from '@/components/ui/Badge'

export const DESIGNATION_LABEL: Record<Designation, string> = {
  sample: 'Sample',
  negative_control: 'Negative control',
  positive_control: 'Positive control',
}

export const DESIGNATIONS: readonly Designation[] = ['sample', 'negative_control', 'positive_control']

export const DESIGNATION_OPTIONS = DESIGNATIONS.map((d) => ({ value: d, label: DESIGNATION_LABEL[d] }))

export function DesignationBadge({ d }: { d: Designation }) {
  if (d === 'sample') return <span className="text-xs text-muted">Sample</span>
  return (
    <Badge tone={d === 'negative_control' ? 'warn' : 'accent'} title={DESIGNATION_LABEL[d]}>
      {d === 'negative_control' ? 'Neg. control' : 'Pos. control'}
    </Badge>
  )
}
