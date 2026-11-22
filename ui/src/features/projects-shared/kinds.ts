/**
 * What differs between the four project kinds, in one table: names, routes,
 * which upstream estimators they link to, and their parameter section.
 * Shared blocks read this instead of switching on the kind.
 */
import type { CreateProjectParams, ProjectKind, ProjectSummary } from '@/api/bindings'

/** A link field of a project to an upstream estimator. */
export type LinkField = 'bin_estimator_id' | 'artifact_estimator_id' | 'quant_bias_estimator_id'

/** The `ProjectSummary` property holding that link. */
export type LinkProp = 'bin_estimator' | 'artifact_estimator' | 'quant_bias_estimator'

export interface UpstreamLink {
  field: LinkField
  prop: LinkProp
  /** Kind of the linked project. */
  kind: ProjectKind
  required: boolean
  /** Why the project needs it, for the create dialog. */
  purpose: string
}

/** Parameter section of `LocusParams` owned by a kind. */
export type KindSection = 'bins' | 'artifact' | 'quant_bias' | 'genotyping'

export interface KindInfo {
  kind: ProjectKind
  /** "Genotyping project". */
  noun: string
  /** "Genotyping projects". */
  plural: string
  /** Route of the kind's page; a project is at `${path}/${id}`. */
  path: string
  section: KindSection
  links: UpstreamLink[]
  /**
   * The kind can use every sample with runs at its loci (`all_samples`, the
   * engine's default for it) instead of a list. The engine refuses removals
   * in that mode; adding samples switches it to a list.
   */
  mayUseAllSamples: boolean
}

const BIN: Omit<UpstreamLink, 'required' | 'purpose'> = { field: 'bin_estimator_id', prop: 'bin_estimator', kind: 'bin_estimator' }
const ART: Omit<UpstreamLink, 'required' | 'purpose'> = {
  field: 'artifact_estimator_id',
  prop: 'artifact_estimator',
  kind: 'artifact_estimator',
}
const QB: Omit<UpstreamLink, 'required' | 'purpose'> = {
  field: 'quant_bias_estimator_id',
  prop: 'quant_bias_estimator',
  kind: 'quant_bias_estimator',
}

export const KINDS: Record<ProjectKind, KindInfo> = {
  bin_estimator: {
    kind: 'bin_estimator',
    mayUseAllSamples: true,
    noun: 'Bin estimator',
    plural: 'Bin estimators',
    path: '/bin-estimators',
    section: 'bins',
    links: [],
  },
  artifact_estimator: {
    kind: 'artifact_estimator',
    mayUseAllSamples: true,
    noun: 'Artifact estimator',
    plural: 'Artifact estimators',
    path: '/artifact-estimators',
    section: 'artifact',
    links: [{ ...BIN, required: true, purpose: 'Bins decide which peaks are alleles, so stutter is measured from the right parent peak.' }],
  },
  quant_bias_estimator: {
    kind: 'quant_bias_estimator',
    mayUseAllSamples: false,
    noun: 'Quantification-bias estimator',
    plural: 'Quantification-bias estimators',
    path: '/quant-bias',
    section: 'quant_bias',
    links: [
      { ...BIN, required: true, purpose: 'Bins match control alleles to peaks.' },
      { ...ART, required: false, purpose: 'Subtracts expected stutter from peak heights before estimating bias.' },
    ],
  },
  genotyping: {
    kind: 'genotyping',
    mayUseAllSamples: false,
    noun: 'Genotyping project',
    plural: 'Genotyping projects',
    path: '/projects',
    section: 'genotyping',
    links: [
      { ...BIN, required: true, purpose: 'Bins are the alleles that can be called.' },
      {
        ...ART,
        required: false,
        purpose:
          'Tells a true minor allele from stutter of a larger allele by its expected height. Without it, every peak in a bin above the height limits is called.',
      },
      { ...QB, required: false, purpose: 'Corrects within-sample allele proportions for size-dependent amplification bias.' },
    ],
  },
}

export function kindInfo(kind: ProjectKind): KindInfo {
  return KINDS[kind]
}

/** Route of a project of any kind. */
export function projectPath(kind: ProjectKind, id: number): string {
  return `${KINDS[kind].path}/${id}`
}

/** Linked estimator ids of a project, as create/update params. */
export function linkValues(p: Pick<ProjectSummary, LinkProp>): Partial<Record<LinkField, number | null>> {
  return {
    bin_estimator_id: p.bin_estimator?.id ?? null,
    artifact_estimator_id: p.artifact_estimator?.id ?? null,
    quant_bias_estimator_id: p.quant_bias_estimator?.id ?? null,
  }
}

/** Build create params, leaving out links the kind does not take or that are unset. */
export function createParams(
  kind: ProjectKind,
  v: { title: string; description: string; locus_set_id: number; links: Partial<Record<LinkField, number | null>> },
): CreateProjectParams {
  const out: CreateProjectParams = { kind, title: v.title.trim(), locus_set_id: v.locus_set_id }
  if (v.description.trim()) out.description = v.description.trim()
  for (const l of KINDS[kind].links) {
    const id = v.links[l.field]
    if (id != null) out[l.field] = id
  }
  return out
}
