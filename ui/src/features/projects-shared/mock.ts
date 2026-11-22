/**
 * Mock backend for projects of every kind (`pnpm dev:mock`, `?mock`): CRUD,
 * samples, locus parameters with engine-like merging and defaults, and
 * staleness (parameters, samples, upstream analyses). What analyzing a locus
 * produces is kind-specific: a kind registers an analyzer with
 * `registerMockAnalyzer` (genotyping does, in features/genotyping/mock.ts).
 */
import type {
  AnalysisStatus,
  AnalyzeProjectParams,
  CreateProjectParams,
  DuplicateProjectParams,
  IdParams,
  ImportProjectSamplesParams,
  LocusAnalysis,
  LocusParams,
  LocusParamsView,
  LocusSet,
  Locus,
  ProjectDetail,
  ProjectKind,
  ProjectLocusParams,
  ProjectSampleRow,
  ProjectSamplesParams,
  ProjectSummary,
  ResetLocusParamsParams,
  Sample,
  UpdateLocusParamsParams,
  UpdateProjectParams,
} from '@/api/bindings'
import { dispatchMock, registerMocks, type MockContext, type MockHandler } from '@/api/mock/registry'
import { RpcError } from '@/api/transport'
import { defaultsOf } from '@/components/form/schema'
import { filterParams, scanningParams } from '@/params/schemas'
import { KINDS } from './kinds'
import { previewSampleCsv } from './samplesCsv'

export interface MockProject {
  id: number
  kind: ProjectKind
  title: string
  description: string
  locus_set_id: number
  bin_estimator_id: number | null
  artifact_estimator_id: number | null
  quant_bias_estimator_id: number | null
  all_samples: boolean
  samples: Map<number, { barcode: string; designation: Sample['designation']; moi: number | null }>
  /** Stored (partial) parameters per locus; absent = defaults. */
  params: Map<number, Record<string, Record<string, unknown>>>
  /** Last analysis per locus: when, and the fingerprint it read. */
  analyzed: Map<number, { at: string; fp: string; rev: number }>
  prob: { at: string; fp: string } | null
  created_at: string
  updated_at: string
}

export const mockProjects = new Map<number, MockProject>()
let nextId = 1
let rev = 1

export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z')
}

/** Kind defaults, as the engine has them (estimators filter at 100 RFU and crosstalk 10×). */
export function defaultParams(kind: ProjectKind): LocusParams {
  const filter = defaultsOf(filterParams) as unknown as LocusParams['filter']
  const out: LocusParams = { scan: defaultsOf(scanningParams) as unknown as LocusParams['scan'], filter: { ...filter } }
  if (kind === 'bin_estimator' || kind === 'artifact_estimator') {
    out.filter.min_peak_height = 100
    out.filter.max_crosstalk = 10
  }
  const sec = KINDS[kind].section
  const kindDefaults: Record<string, Record<string, unknown>> = {
    genotyping: {
      soft_artifact_sd_limit: 6,
      hard_artifact_sd_limit: 0,
      offscale_threshold: 32000,
      bleedthrough_filter_limit: 5,
      measured_pullup: true,
      pullup_sd_limit: 4,
      crosstalk_filter_limit: 30,
      reject_spectral_breakdown: false,
      relative_peak_height_limit: 0.01,
      absolute_peak_height_limit: 200,
      failure_threshold: 500,
      probability_threshold: 0.8,
      bootstrap_probability_threshold: 0.99,
    },
    bins: { min_peak_frequency: 10, default_bin_buffer: 0.75 },
    artifact: {
      max_secondary_relative_peak_height: 0.4,
      min_artifact_peak_frequency: 10,
      min_artifact_run_fraction: 0.5,
      seed: 0,
      error_estimator: 'densest_half',
    },
    quant_bias: { min_peak_height: 1000, min_true_proportion: 0.25, offscale_threshold: 32000 },
  }
  ;(out as unknown as Record<string, unknown>)[sec] = kindDefaults[sec]
  return out
}

export function effectiveParams(p: MockProject, locusId: number): LocusParams {
  const d = defaultParams(p.kind) as unknown as Record<string, Record<string, unknown>>
  const stored = p.params.get(locusId) ?? {}
  const out: Record<string, Record<string, unknown>> = {}
  for (const [k, v] of Object.entries(d)) out[k] = { ...v, ...(stored[k] ?? {}) }
  return out as unknown as LocusParams
}

async function locusSets(): Promise<LocusSet[]> {
  return (await dispatchMock('list_locus_sets', null)) as LocusSet[]
}
async function loci(): Promise<Locus[]> {
  return (await dispatchMock('list_loci', null)) as Locus[]
}

export async function projectLoci(p: MockProject): Promise<Locus[]> {
  const set = (await locusSets()).find((s) => s.id === p.locus_set_id)
  const all = await loci()
  return (set?.locus_ids ?? []).map((id) => all.find((l) => l.id === id)).filter((l): l is Locus => !!l)
}

/** What a locus result depends on; a different value means stale. */
export function fingerprint(p: MockProject, locusId: number): Record<string, string> {
  const fp: Record<string, string> = { params: JSON.stringify(effectiveParams(p, locusId)) }
  if (p.kind === 'genotyping' || p.kind === 'quant_bias_estimator') fp.samples = [...p.samples.keys()].sort((a, b) => a - b).join(',')
  for (const id of [p.bin_estimator_id, p.artifact_estimator_id, p.quant_bias_estimator_id]) {
    if (id == null) continue
    const up = mockProjects.get(id)
    fp[`up${up?.kind}`] = `${id}:${up?.analyzed.get(locusId)?.rev ?? 0}`
  }
  return fp
}

const REASON: Record<string, string> = {
  params: 'Parameters changed.',
  samples: 'Samples added or removed.',
  upbin_estimator: 'Bins changed in the bin estimator.',
  upartifact_estimator: 'The artifact model changed.',
  upquant_bias_estimator: 'The quantification-bias estimate changed.',
}

export function locusStatus(p: MockProject, locusId: number): AnalysisStatus {
  const a = p.analyzed.get(locusId)
  if (!a) return { state: 'not_analyzed', reasons: [], analyzed_at: null }
  const was = JSON.parse(a.fp) as Record<string, string>
  const now = fingerprint(p, locusId)
  const reasons = Object.keys(now)
    .filter((k) => now[k] !== was[k])
    .map((k) => REASON[k] ?? `${k} changed.`)
  return { state: reasons.length ? 'stale' : 'current', reasons, analyzed_at: a.at }
}

export function probStatus(p: MockProject): AnalysisStatus | null {
  if (p.kind !== 'genotyping') return null
  if (!p.prob) return { state: 'not_analyzed', reasons: [], analyzed_at: null }
  const fp = probFingerprint(p)
  return fp === p.prob.fp
    ? { state: 'current', reasons: [], analyzed_at: p.prob.at }
    : { state: 'stale', reasons: ['Loci were re-analyzed or samples changed since.'], analyzed_at: p.prob.at }
}

export function probFingerprint(p: MockProject): string {
  return JSON.stringify([[...p.analyzed.entries()].map(([k, v]) => [k, v.rev]), [...p.samples.keys()].sort((a, b) => a - b)])
}

function ref(id: number | null) {
  const p = id != null ? mockProjects.get(id) : undefined
  return p ? { id: p.id, kind: p.kind, title: p.title } : null
}

export async function summaryOf(p: MockProject): Promise<ProjectSummary> {
  const ls = await projectLoci(p)
  const st = ls.map((l) => locusStatus(p, l.id))
  const set = (await locusSets()).find((s) => s.id === p.locus_set_id)
  return {
    id: p.id,
    kind: p.kind,
    title: p.title,
    description: p.description,
    locus_set_id: p.locus_set_id,
    locus_set_label: set?.label ?? '?',
    bin_estimator: ref(p.bin_estimator_id),
    artifact_estimator: ref(p.artifact_estimator_id),
    quant_bias_estimator: ref(p.quant_bias_estimator_id),
    all_samples: p.all_samples,
    // Estimators on every sample count the workspace's samples with runs, as the engine does.
    sample_count: p.all_samples ? (await workspaceSamples()).filter((s) => s.run_count > 0).length : p.samples.size,
    locus_count: ls.length,
    current_loci: st.filter((s) => s.state === 'current').length,
    stale_loci: st.filter((s) => s.state === 'stale').length,
    unanalyzed_loci: st.filter((s) => s.state === 'not_analyzed').length,
    probabilities: probStatus(p),
    created_at: p.created_at,
    updated_at: p.updated_at,
  }
}

export async function detailOf(p: MockProject): Promise<ProjectDetail> {
  const ls = await projectLoci(p)
  const warnings: string[] = []
  for (const id of [p.bin_estimator_id, p.artifact_estimator_id, p.quant_bias_estimator_id]) {
    const up = id != null ? mockProjects.get(id) : undefined
    if (!up) continue
    for (const l of ls) {
      const s = locusStatus(up, l.id)
      if (s.state !== 'current')
        warnings.push(`${KINDS[up.kind].noun} “${up.title}” is ${s.state === 'stale' ? 'stale' : 'not analyzed'} at ${l.label}.`)
    }
  }
  return {
    project: await summaryOf(p),
    loci: ls.map((l) => ({
      locus_id: l.id,
      label: l.label,
      color: l.color,
      min_base_length: l.min_base_length,
      max_base_length: l.max_base_length,
      nucleotide_repeat_length: l.nucleotide_repeat_length,
      status: locusStatus(p, l.id),
      custom_params: (p.params.get(l.id) && Object.keys(p.params.get(l.id)!).length > 0) || false,
    })),
    dependents: [...mockProjects.values()]
      .filter((o) => [o.bin_estimator_id, o.artifact_estimator_id, o.quant_bias_estimator_id].includes(p.id))
      .map((o) => ({ id: o.id, kind: o.kind, title: o.title })),
    upstream_warnings: warnings,
  }
}

export function getProject(id: number): MockProject {
  const p = mockProjects.get(id)
  if (!p) throw new RpcError('not_found', `Project ${id} does not exist`)
  return p
}

export type MockAnalyzer = (p: MockProject, locus: Locus) => Promise<LocusAnalysis> | LocusAnalysis
const analyzers = new Map<ProjectKind, MockAnalyzer>()
/** Hook a kind's per-locus analysis into `analyze_project`. */
export function registerMockAnalyzer(kind: ProjectKind, fn: MockAnalyzer): void {
  analyzers.set(kind, fn)
}
/** Called when samples leave a project, so kinds can drop their results. */
const sampleRemovers = new Map<ProjectKind, (p: MockProject, ids: number[]) => void>()
export function registerMockSampleRemover(kind: ProjectKind, fn: (p: MockProject, ids: number[]) => void): void {
  sampleRemovers.set(kind, fn)
}
const deleters: ((id: number) => void)[] = []
export function onMockProjectDeleted(fn: (id: number) => void): void {
  deleters.push(fn)
}

export function createMockProject(
  v: Omit<MockProject, 'id' | 'created_at' | 'updated_at' | 'params' | 'analyzed' | 'prob'> &
    Partial<Pick<MockProject, 'params' | 'analyzed' | 'prob'>>,
): MockProject {
  const p: MockProject = {
    params: new Map(),
    analyzed: new Map(),
    prob: null,
    ...v,
    id: nextId++,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  mockProjects.set(p.id, p)
  return p
}

/** Record a locus as analyzed now with its current inputs. */
export function markAnalyzed(p: MockProject, locusId: number): void {
  p.analyzed.set(locusId, { at: nowIso(), fp: JSON.stringify(fingerprint(p, locusId)), rev: rev++ })
}

/**
 * A hand edit changed this project's results at a locus (bins, artifact
 * classes): projects linked to it go stale there, while its own status
 * stays as it was (results are not inputs of their own project).
 */
export function bumpRevision(p: MockProject, locusId: number): void {
  const a = p.analyzed.get(locusId)
  if (a) p.analyzed.set(locusId, { ...a, rev: rev++ })
}

async function checkLinks(
  kind: ProjectKind,
  locusSetId: number,
  links: Partial<Record<'bin_estimator_id' | 'artifact_estimator_id' | 'quant_bias_estimator_id', number | null | undefined>>,
) {
  const sets = await locusSets()
  const need = sets.find((s) => s.id === locusSetId)?.locus_ids ?? []
  for (const l of KINDS[kind].links) {
    const id = links[l.field]
    if (id == null) {
      if (l.required) throw new RpcError('invalid', `A ${KINDS[kind].noun.toLowerCase()} needs a ${KINDS[l.kind].noun.toLowerCase()}.`)
      continue
    }
    const up = getProject(id)
    if (up.kind !== l.kind) throw new RpcError('invalid', `Project ${up.title} is not a ${KINDS[l.kind].noun.toLowerCase()}.`)
    const have = sets.find((s) => s.id === up.locus_set_id)?.locus_ids ?? []
    if (need.some((x) => !have.includes(x))) throw new RpcError('invalid', `${up.title} does not cover every locus of the locus set.`)
  }
}

async function workspaceSamples(): Promise<Sample[]> {
  return (await dispatchMock('list_samples', null)) as Sample[]
}

function touch(p: MockProject, ctx: MockContext) {
  p.updated_at = nowIso()
  ctx.changed('projects', [p.id])
}

const handlers: Record<string, MockHandler> = {
  list_projects: async (params) => {
    const kind = (params as { kind?: ProjectKind } | null)?.kind
    return Promise.all([...mockProjects.values()].filter((p) => !kind || p.kind === kind).map(summaryOf))
  },
  get_project: async (params) => detailOf(getProject((params as IdParams).id)),
  create_project: async (params, ctx) => {
    const c = params as CreateProjectParams
    const title = c.title.trim()
    if (!title) throw new RpcError('invalid', 'Project title cannot be empty.')
    if ([...mockProjects.values()].some((p) => p.kind === c.kind && p.title.toLowerCase() === title.toLowerCase()))
      throw new RpcError('conflict', `A ${KINDS[c.kind].noun.toLowerCase()} named "${title}" already exists.`)
    await checkLinks(c.kind, c.locus_set_id, c)
    const p = createMockProject({
      kind: c.kind,
      title,
      description: c.description ?? '',
      locus_set_id: c.locus_set_id,
      bin_estimator_id: c.bin_estimator_id ?? null,
      artifact_estimator_id: c.artifact_estimator_id ?? null,
      quant_bias_estimator_id: c.quant_bias_estimator_id ?? null,
      all_samples: c.kind === 'bin_estimator' || c.kind === 'artifact_estimator' ? (c.all_samples ?? true) : false,
      samples: new Map(),
    })
    ctx.changed('projects', null)
    return detailOf(p)
  },
  update_project: async (params, ctx) => {
    const u = params as UpdateProjectParams
    const p = getProject(u.id)
    if (u.title !== undefined) {
      const t = u.title.trim()
      if (!t) throw new RpcError('invalid', 'Project title cannot be empty.')
      if ([...mockProjects.values()].some((o) => o.id !== p.id && o.kind === p.kind && o.title.toLowerCase() === t.toLowerCase()))
        throw new RpcError('conflict', `A ${KINDS[p.kind].noun.toLowerCase()} named "${t}" already exists.`)
      p.title = t
    }
    if (u.description !== undefined) p.description = u.description
    const links = {
      bin_estimator_id: u.bin_estimator_id !== undefined ? u.bin_estimator_id : p.bin_estimator_id,
      artifact_estimator_id: u.artifact_estimator_id !== undefined ? u.artifact_estimator_id : p.artifact_estimator_id,
      quant_bias_estimator_id: u.quant_bias_estimator_id !== undefined ? u.quant_bias_estimator_id : p.quant_bias_estimator_id,
    }
    await checkLinks(p.kind, p.locus_set_id, links)
    Object.assign(p, links)
    if (u.all_samples !== undefined) p.all_samples = u.all_samples
    touch(p, ctx)
    ctx.changed('projects', null)
    return detailOf(p)
  },
  duplicate_project: async (params, ctx) => {
    const d = params as DuplicateProjectParams
    const src = getProject(d.id)
    const t = d.title.trim()
    if (!t) throw new RpcError('invalid', 'Project title cannot be empty.')
    if ([...mockProjects.values()].some((o) => o.kind === src.kind && o.title.toLowerCase() === t.toLowerCase()))
      throw new RpcError('conflict', `A ${KINDS[src.kind].noun.toLowerCase()} named "${t}" already exists.`)
    const p = createMockProject({
      ...src,
      title: t,
      samples: new Map(src.samples),
      params: new Map(src.params),
      analyzed: new Map(),
      prob: null,
    })
    ctx.changed('projects', null)
    return detailOf(p)
  },
  delete_project: (params, ctx) => {
    const p = getProject((params as IdParams).id)
    const deps = [...mockProjects.values()].filter((o) =>
      [o.bin_estimator_id, o.artifact_estimator_id, o.quant_bias_estimator_id].includes(p.id),
    )
    if (deps.length)
      throw new RpcError(
        'in_use',
        `${KINDS[p.kind].noun} “${p.title}” is used by ${deps.map((d) => `${KINDS[d.kind].noun.toLowerCase()} “${d.title}”`).join(', ')}. Unlink or delete those first.`,
      )
    mockProjects.delete(p.id)
    for (const f of deleters) f(p.id)
    ctx.changed('projects', null)
    return null
  },
  list_project_samples: async (params) => {
    const p = getProject((params as IdParams).id)
    const all = await workspaceSamples()
    if (p.all_samples)
      return all
        .filter((s) => s.run_count > 0)
        .map((s): ProjectSampleRow => ({
          sample_id: s.id,
          barcode: s.barcode,
          designation: s.designation,
          run_count: s.run_count,
          moi: null,
          controls: [],
        }))
        .sort((a, b) => a.barcode.localeCompare(b.barcode, 'en', { numeric: true }))
    const ws = new Map(all.map((s) => [s.id, s]))
    const rows: ProjectSampleRow[] = [...p.samples.entries()].map(([id, s]) => ({
      sample_id: id,
      barcode: s.barcode,
      designation: s.designation,
      run_count: ws.get(id)?.run_count ?? (p.kind === 'genotyping' ? 4 : 0),
      moi: s.moi,
      controls: [],
    }))
    return rows.sort((a, b) => a.barcode.localeCompare(b.barcode, 'en', { numeric: true }))
  },
  add_project_samples: async (params, ctx) => {
    const a = params as ProjectSamplesParams
    const p = getProject(a.id)
    const ws = new Map((await workspaceSamples()).map((s) => [s.id, s]))
    let added = 0
    let already = 0
    for (const id of a.sample_ids) {
      if (p.samples.has(id)) {
        already++
        continue
      }
      const s = ws.get(id)
      if (!s) throw new RpcError('not_found', `Sample ${id} does not exist`)
      p.samples.set(id, { barcode: s.barcode, designation: s.designation, moi: null })
      added++
    }
    p.all_samples = false
    touch(p, ctx)
    return { added, already }
  },
  import_project_samples_csv: async (params, ctx) => {
    const a = params as ImportProjectSamplesParams
    const p = getProject(a.id)
    const prev = previewSampleCsv(a.content ?? '', await workspaceSamples(), new Set(p.samples.keys()))
    if (prev.error) throw new RpcError('invalid', prev.error)
    if (prev.unknown.length) throw new RpcError('invalid', `Unknown barcodes: ${prev.unknown.slice(0, 8).join(', ')}. Nothing was added.`)
    for (const s of prev.matched) p.samples.set(s.id, { barcode: s.barcode, designation: s.designation, moi: null })
    p.all_samples = false // as the engine: adding samples switches an estimator to a list
    touch(p, ctx)
    return { added: prev.matched.length, already: prev.already.length }
  },
  remove_project_samples: (params, ctx) => {
    const a = params as ProjectSamplesParams
    const p = getProject(a.id)
    if (p.all_samples)
      throw new RpcError(
        'invalid',
        'This estimator uses every sample with runs. Add the samples to keep instead (that switches it to a list).',
      )
    let n = 0
    for (const id of a.sample_ids) if (p.samples.delete(id)) n++
    sampleRemovers.get(p.kind)?.(p, a.sample_ids)
    touch(p, ctx)
    return n
  },
  get_project_locus_params: async (params) => {
    const a = params as ProjectLocusParams
    const p = getProject(a.project_id)
    const view: LocusParamsView = {
      locus_id: a.locus_id,
      params: effectiveParams(p, a.locus_id),
      is_default: !p.params.get(a.locus_id) || Object.keys(p.params.get(a.locus_id)!).length === 0,
    }
    return view
  },
  update_project_locus_params: async (params, ctx) => {
    const a = params as UpdateLocusParamsParams
    const p = getProject(a.project_id)
    const ids = a.locus_ids ?? (await projectLoci(p)).map((l) => l.id)
    const d = defaultParams(p.kind) as unknown as Record<string, Record<string, unknown>>
    for (const id of ids) {
      const cur = { ...(p.params.get(id) ?? {}) }
      for (const [sec, vals] of Object.entries(a.params as unknown as Record<string, Record<string, unknown>>)) {
        if (!d[sec]) continue
        cur[sec] = { ...(cur[sec] ?? {}), ...vals }
        for (const [k, v] of Object.entries(cur[sec]!)) if (d[sec]![k] === v) delete cur[sec]![k]
        if (Object.keys(cur[sec]!).length === 0) delete cur[sec]
      }
      p.params.set(id, cur)
    }
    touch(p, ctx)
    return ids.map((id) => ({ locus_id: id, params: effectiveParams(p, id), is_default: Object.keys(p.params.get(id) ?? {}).length === 0 }))
  },
  reset_project_locus_params: async (params, ctx) => {
    const a = params as ResetLocusParamsParams
    const p = getProject(a.project_id)
    const ids = a.locus_ids ?? (await projectLoci(p)).map((l) => l.id)
    for (const id of ids) p.params.delete(id)
    touch(p, ctx)
    return ids.map((id) => ({ locus_id: id, params: effectiveParams(p, id), is_default: true }))
  },
  analyze_project: async (params, ctx) => {
    const a = params as AnalyzeProjectParams
    const p = getProject(a.id)
    let ls = await projectLoci(p)
    if (a.locus_ids) ls = ls.filter((l) => a.locus_ids!.includes(l.id))
    if (a.only_stale) ls = ls.filter((l) => locusStatus(p, l.id).state !== 'current')
    const label = ls.length === 1 ? `Analyzing ${ls[0]!.label} in ${p.title}` : `Analyzing ${ls.length} loci in ${p.title}`
    await ctx.runTask('analyze_project', label, 400 + 300 * ls.length)
    const out: LocusAnalysis[] = []
    for (const l of ls) {
      const fn = analyzers.get(p.kind)
      out.push(
        fn
          ? await fn(p, l)
          : { locus_id: l.id, locus_label: l.label, run_count: 0, usable_runs: 0, summary: 'analyzed', warnings: [], ms: 5 },
      )
      markAnalyzed(p, l.id)
    }
    touch(p, ctx)
    ctx.changed('projects', null)
    return { loci: out }
  },
}

const seeds: (() => Promise<void> | void)[] = []
/** Fill the mock store before the first project method runs (kinds seed their demo projects). */
export function registerMockSeed(fn: () => Promise<void> | void): void {
  seeds.push(fn)
}
async function seedAll() {
  for (const f of seeds) await f()
}

const wrapped: Record<string, MockHandler> = {}
for (const [k, h] of Object.entries(handlers))
  wrapped[k] = async (params, ctx) => {
    await seedAll()
    return h(params, ctx)
  }
registerMocks(wrapped)
