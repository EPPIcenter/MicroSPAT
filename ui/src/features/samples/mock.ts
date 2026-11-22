/**
 * Mock handlers for samples (`pnpm dev:mock`, `?mock`). Runs come from the
 * plates mock (its plate maps), so channel ids work with its
 * `get_channel_trace`; thousands of extra run-less samples exercise the
 * virtualized table.
 */
import type {
  CreateSampleParams,
  CsvSource,
  DeleteSamplesParams,
  Designation,
  IdParams,
  PlateDetail,
  PlateSummary,
  Sample,
  SampleDetail,
  SampleRefusal,
  SampleRun,
  SamplesBatchResult,
  SetSamplesDesignationParams,
  UpdateSampleParams,
} from '@/api/bindings'
import { dispatchMock, registerMocks, type MockHandler } from '@/api/mock/registry'
import { RpcError } from '@/api/transport'
import { previewSamplesCsv } from './importPreview'

interface MockSample {
  id: number
  barcode: string
  designation: Designation
}

const EXTRA = 30_000
const store = new Map<number, MockSample>()
/** Lower-case barcode -> sample, kept in step with `store`. */
const barcodes = new Map<string, MockSample>()
let nextId = 1
let seeded = false

function seed() {
  if (seeded) return
  seeded = true
  for (let i = 1; i <= EXTRA; i++) {
    const kind: Designation = i % 97 === 0 ? 'negative_control' : i % 89 === 0 ? 'positive_control' : 'sample'
    const id = nextId++
    put({ id, barcode: `KS${String(2000 + Math.floor(i / 400))}-${String(i).padStart(5, '0')}`, designation: kind })
  }
}

function put(s: MockSample) {
  store.set(s.id, s)
  barcodes.set(s.barcode.toLowerCase(), s)
}

function drop(s: MockSample) {
  store.delete(s.id)
  barcodes.delete(s.barcode.toLowerCase())
}

function byBarcode(b: string): MockSample | undefined {
  return barcodes.get(b.toLowerCase())
}

/** Every run in the plates mock, as sample runs keyed by barcode. */
export async function mockPlateRuns(): Promise<{ barcode: string; designation: Designation; run: SampleRun }[]> {
  let plates: PlateSummary[]
  try {
    plates = (await dispatchMock('list_plates', null)) as PlateSummary[]
  } catch {
    return []
  }
  const details = await Promise.all(plates.map((p) => dispatchMock('get_plate', { id: p.id }) as Promise<PlateDetail>))
  const out: { barcode: string; designation: Designation; run: SampleRun }[] = []
  for (const d of details)
    for (const w of d.wells)
      for (const c of w.channels)
        for (const r of c.runs)
          out.push({
            barcode: r.sample_barcode,
            designation: r.designation,
            run: {
              run_id: r.id,
              locus_id: r.locus_id,
              locus_label: r.locus_label,
              plate_id: d.plate.id,
              plate_label: d.plate.label,
              well_id: w.id,
              well_label: w.label,
              channel_id: c.id,
              color: c.color,
              max_signal: r.max_signal,
              sizing: w.sizing,
              contaminated: r.contaminated,
            },
          })
  return out
}

async function withRuns() {
  seed()
  const runs = await mockPlateRuns()
  const bySample = new Map<number, SampleRun[]>()
  for (const r of runs) {
    let s = byBarcode(r.barcode)
    if (!s) {
      s = { id: nextId++, barcode: r.barcode, designation: r.designation }
      put(s)
    }
    bySample.set(s.id, [...(bySample.get(s.id) ?? []), r.run])
  }
  return bySample
}

function summary(s: MockSample, runs: SampleRun[] = []): Sample {
  const plates = [...new Set(runs.map((r) => r.plate_label))].sort()
  return {
    id: s.id,
    barcode: s.barcode,
    designation: s.designation,
    run_count: runs.length,
    plate_count: plates.length,
    locus_count: new Set(runs.map((r) => r.locus_id)).size,
    plate_labels: plates,
  }
}

function get(id: number): MockSample {
  const s = store.get(id)
  if (!s) throw new RpcError('not_found', `Sample ${id} does not exist`)
  return s
}

const handlers: Record<string, MockHandler> = {
  list_samples: async () => {
    const runs = await withRuns()
    return [...store.values()].map((s) => summary(s, runs.get(s.id))).sort((a, b) => a.barcode.localeCompare(b.barcode))
  },
  get_sample: async (params) => {
    const runs = await withRuns()
    const s = get((params as IdParams).id)
    const r = [...(runs.get(s.id) ?? [])].sort((a, b) => a.locus_label.localeCompare(b.locus_label) || a.plate_label.localeCompare(b.plate_label) || a.well_label.localeCompare(b.well_label))
    const detail: SampleDetail = { id: s.id, barcode: s.barcode, designation: s.designation, runs: r }
    return detail
  },
  create_sample: (params, ctx) => {
    seed()
    const p = params as CreateSampleParams
    const barcode = p.barcode.trim()
    if (!barcode) throw new RpcError('invalid', 'Sample barcode label cannot be empty.')
    if (byBarcode(barcode)) throw new RpcError('conflict', `A sample with barcode "${barcode}" already exists.`)
    const s = { id: nextId++, barcode, designation: p.designation ?? 'sample' }
    put(s)
    ctx.changed('samples', [s.id])
    ctx.changed('workspace')
    return summary(s)
  },
  update_sample: async (params, ctx) => {
    const p = params as UpdateSampleParams
    const s = get(p.id)
    if (p.barcode !== undefined) {
      const b = p.barcode.trim()
      const other = byBarcode(b)
      if (other && other.id !== s.id) throw new RpcError('conflict', `A sample with barcode "${b}" already exists.`)
      barcodes.delete(s.barcode.toLowerCase())
      s.barcode = b
      barcodes.set(b.toLowerCase(), s)
    }
    if (p.designation) s.designation = p.designation
    ctx.changed('samples', [s.id])
    const runs = await withRuns()
    return summary(s, runs.get(s.id))
  },
  delete_sample: async (params, ctx) => {
    const runs = await withRuns()
    const s = get((params as IdParams).id)
    const r = runs.get(s.id) ?? []
    if (r.length) {
      const plates = [...new Set(r.map((x) => x.plate_label))].sort()
      throw new RpcError('in_use', `Sample ${s.barcode} has ${r.length} runs on plate(s) ${plates.join(', ')}. Clear or change those plate maps first.`)
    }
    drop(s)
    ctx.changed('samples', [s.id])
    ctx.changed('workspace')
    return null
  },
  set_samples_designation: (params, ctx) => {
    seed()
    const p = params as SetSamplesDesignationParams
    const out: SamplesBatchResult = { done: [], refused: [] }
    for (const id of p.sample_ids) {
      const s = store.get(id)
      if (!s) out.refused.push({ sample_id: id, barcode: null, reason: `Sample ${id} does not exist.` })
      else {
        s.designation = p.designation
        out.done.push(id)
      }
    }
    if (out.done.length) ctx.changed('samples')
    return out
  },
  delete_samples: async (params, ctx) => {
    const runs = await withRuns()
    const p = params as DeleteSamplesParams
    const done: number[] = []
    const refused: SampleRefusal[] = []
    for (const id of p.sample_ids) {
      const s = store.get(id)
      const r = s ? (runs.get(s.id) ?? []) : []
      if (!s) refused.push({ sample_id: id, barcode: null, reason: `Sample ${id} does not exist.` })
      else if (r.length) {
        const plates = [...new Set(r.map((x) => x.plate_label))].sort()
        refused.push({ sample_id: id, barcode: s.barcode, reason: `Sample ${s.barcode} has ${r.length} runs on plate(s) ${plates.join(', ')}. Clear or change those plate maps first.` })
      } else {
        drop(s)
        done.push(id)
      }
    }
    if (done.length) {
      ctx.changed('samples')
      ctx.changed('workspace')
    }
    return { done, refused }
  },
  import_samples_csv: (params, ctx) => {
    seed()
    const p = params as CsvSource
    const preview = previewSamplesCsv(p.content ?? '', new Set(barcodes.keys()))
    if (preview.headerError) throw new RpcError('invalid', preview.headerError)
    const bad = preview.rows.filter((r) => r.status === 'invalid')
    if (bad.length) throw new RpcError('invalid', `The samples CSV has ${bad.length} problem(s): ${bad.map((r) => `line ${r.line}: ${r.problem}`).join(', ')}. Nothing was imported.`)
    const created: Sample[] = []
    for (const r of preview.rows.filter((x) => x.status === 'create')) {
      const s = { id: nextId++, barcode: r.barcode, designation: r.designation ?? 'sample' }
      put(s)
      created.push(summary(s))
    }
    if (created.length) ctx.changed('samples', created.map((s) => s.id))
    return { created, existing: preview.rows.filter((r) => r.status === 'existing').map((r) => r.barcode) }
  },
}

registerMocks(handlers)
