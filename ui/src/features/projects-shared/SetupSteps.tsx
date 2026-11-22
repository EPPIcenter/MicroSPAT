/**
 * The way from an empty workspace to genotypes, as a checklist that reads
 * the workspace: each step is ticked once done and links to where it is
 * done. Shown beside an empty project list, so a new user sees the order.
 */
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Check, Circle } from 'lucide-react'
import { apiQuery } from '@/api/query'
import type { ProjectKind } from '@/api/bindings'
import { cn } from '@/lib/cn'
import { useAllProjects, useWorkspaceSamples } from './queries'

interface Step {
  label: string
  to: string
  done: boolean
  optional?: boolean
}

export function SetupSteps({ current }: { current?: ProjectKind }) {
  const info = useQuery({ ...apiQuery(['workspace'], 'get_workspace_info'), meta: { silent: true } })
  const samples = useWorkspaceSamples()
  const projects = useAllProjects()
  if (!info.data || !samples.data || !projects.data) return null
  const c = info.data.counts
  const has = (k: ProjectKind) => projects.data.some((p) => p.kind === k)
  const steps: (Step & { kind?: ProjectKind })[] = [
    { label: 'Import plates and check their ladders', to: '/plates', done: c.plates > 0 },
    { label: 'Add loci (or import a CSV of them)', to: '/loci', done: c.loci > 0 },
    { label: 'Group them into a locus set', to: '/locus-sets', done: c.locus_sets > 0 },
    { label: 'Apply a plate map to each plate', to: '/plates', done: samples.data.some((s) => s.run_count > 0) },
    { label: 'Create and analyze a bin estimator', to: '/bin-estimators', done: has('bin_estimator'), kind: 'bin_estimator' },
    {
      label: 'Create and analyze an artifact estimator',
      to: '/artifact-estimators',
      done: has('artifact_estimator'),
      kind: 'artifact_estimator',
    },
    {
      label: 'Estimate quantification bias from control mixtures',
      to: '/quant-bias',
      done: has('quant_bias_estimator'),
      optional: true,
      kind: 'quant_bias_estimator',
    },
    {
      label: 'Create a genotyping project, analyze it, calculate probabilities, review and export',
      to: '/projects',
      done: has('genotyping'),
      kind: 'genotyping',
    },
  ]
  const next = steps.find((s) => !s.done && !s.optional)
  return (
    <div className="flex h-full flex-col items-center justify-center p-6" data-testid="setup-steps">
      <div className="w-full max-w-sm">
        <h2 className="text-sm font-medium">From plates to genotypes</h2>
        <p className="mt-0.5 text-xs text-muted">Each step needs the ones before it.</p>
        <ol className="mt-3 space-y-1.5 text-xs">
          {steps.map((s, i) => (
            <li
              key={i}
              className={cn('flex items-start gap-2', s === next ? 'font-medium text-fg' : s.done ? 'text-muted' : 'text-faint')}
              data-done={s.done || undefined}
            >
              {s.done ? (
                <Check size={13} className="mt-px shrink-0 text-ok" />
              ) : (
                <Circle size={13} className={cn('mt-px shrink-0', s === next && 'text-accent')} />
              )}
              <span>
                {s.kind === current || s.done ? (
                  s.label
                ) : (
                  <Link to={s.to} className="hover:underline">
                    {s.label}
                  </Link>
                )}
                {s.optional && <span className="text-faint"> (optional)</span>}
                {s === next && s.kind === current && <span className="text-accent"> · here</span>}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
