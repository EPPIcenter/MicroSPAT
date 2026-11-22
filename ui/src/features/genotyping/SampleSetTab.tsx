/**
 * The genotyping project's sample list: the shared SamplesTab with the model's
 * MOI and, beside it, the most alleles called at any one locus (a sample can
 * show more called alleles than its MOI: MOI counts only alleles above the
 * bootstrap probability threshold).
 */
import { useMemo } from 'react'
import type { ProjectDetail, ProjectSampleRow } from '@/api/bindings'
import type { DataColumn } from '@/components/DataTable'
import { cn } from '@/lib/cn'
import { SamplesTab } from '@/features/projects-shared/SamplesTab'

export function SampleSetTab({ detail, onOpenSample }: { detail: ProjectDetail; onOpenSample: (sampleId: number) => void }) {
  const extra = useMemo<DataColumn<ProjectSampleRow>[]>(
    () => [
      { id: 'moi', header: 'MOI', value: (r) => r.moi, align: 'right', width: 60, description: 'Multiplicity of infection, from the probabilistic pass (the model’s)' },
      {
        id: 'max_alleles',
        header: 'Max alleles',
        value: (r) => r.max_alleles ?? null,
        cell: (r) => (r.max_alleles == null ? <span className="text-faint">–</span> : <span className={cn('num', r.moi != null && r.max_alleles > r.moi && 'text-warn')}>{r.max_alleles}</span>),
        align: 'right',
        width: 92,
        description: 'Most alleles called at any one locus. Can be above the MOI, which counts only alleles whose probability reaches the bootstrap threshold.',
      },
    ],
    [],
  )
  return <SamplesTab detail={detail} extraColumns={extra} onOpenSample={(r) => onOpenSample(r.sample_id)} />
}
