/**
 * Deterministic synthetic data for the gallery, mock pages and tests:
 * CE traces of mixed infections (several alleles at unequal heights, stutter,
 * a minor allele sitting at another allele's stutter position, pull-up),
 * plates, bin-estimator scatter, artifact-estimator scatter, sample rows.
 */
import type { Bin, Color } from '@/api/bindings'
import type { LadderMarker, TraceBin, TracePeak, TraceSeries } from '@/components/TraceViewer/model'
import type { WellDatum } from '@/components/PlateGrid/PlateGrid'
import { allWells, type PlateFormat } from '@/components/PlateGrid/layout'
import type { WellStatus } from '@/components/PlateGrid/colors'
import type { ScatterPoint } from '@/components/BinPlot/BinPlot'
import type { ArtifactSegment } from '@/components/ArtifactPlot/model'
import { invertInterp } from '@/plot/decimate'

/** Small fast seeded PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const gauss = () => {
    const u = Math.max(1e-12, next())
    const v = next()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  return { next, gauss, int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)) }
}

export const N_POINTS = 8000

/** Index -> bp map of a well (slightly different per well, like real ladders). */
export function makeBaseSizes(seed = 1, n = N_POINTS): Float64Array {
  const r = rng(seed)
  const shift = r.gauss() * 25
  const stretch = 1 + r.gauss() * 0.01
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const j = (i - 1200 - shift) * stretch
    out[i] = j * 0.078 + 1.5e-6 * j * Math.abs(j)
  }
  return out
}

export const LIZ500 = [35, 50, 75, 100, 139, 150, 160, 200, 250, 300, 340, 350, 400, 450, 490, 500]

interface Component {
  bp: number
  height: number
  kind: 'allele' | 'stutter' | 'pullup' | 'noise' | 'ladder'
  label?: string
}

function render(data: Float64Array, sizes: Float64Array, comps: Component[], width = 3.4) {
  for (const c of comps) {
    const center = invertInterp(sizes, c.bp)
    const lo = Math.max(0, Math.floor(center - width * 5))
    const hi = Math.min(data.length - 1, Math.ceil(center + width * 5))
    for (let i = lo; i <= hi; i++) {
      const d = (i - center) / width
      data[i] = (data[i] as number) + c.height * Math.exp(-0.5 * d * d)
    }
  }
}

function noise(data: Float64Array, r: ReturnType<typeof rng>, level: number, drift: number) {
  let walk = 0
  for (let i = 0; i < data.length; i++) {
    walk += r.gauss() * 0.4
    walk *= 0.995
    // Primer-dimer hump at the start of the run.
    const early = i < 1500 ? 2500 * Math.exp(-((i - 900) ** 2) / (2 * 120 ** 2)) : 0
    data[i] = (data[i] as number) + r.gauss() * level + drift * (1 + Math.sin(i / 900)) + walk + early
  }
}

export interface MockLocus {
  label: string
  color: Color
  range: [number, number]
  repeat: number
  /** Alleles in the mixture: [bp, height]. */
  alleles: [number, number][]
}

/** A three-clone infection at a blue locus, two clones at green, one at yellow. */
export const DEMO_LOCI: MockLocus[] = [
  {
    label: 'PfPK2',
    color: 'blue',
    range: [150, 210],
    repeat: 4,
    // 170 sits exactly at the −4 stutter of 174: a true minor allele that
    // the artifact model must tell apart from stutter.
    alleles: [
      [162, 9200],
      [174, 3600],
      [170, 1150],
      [186, 520],
    ],
  },
  { label: 'TA81', color: 'green', range: [110, 145], repeat: 3, alleles: [[121, 5200], [130, 2100]] },
  { label: 'POLYa', color: 'yellow', range: [230, 290], repeat: 3, alleles: [[251, 2800]] },
  { label: 'TA87', color: 'red', range: [300, 360], repeat: 3, alleles: [[318, 4100], [327, 900]] },
]

export const DEMO_BINS: Record<string, TraceBin[]> = Object.fromEntries(
  DEMO_LOCI.map((l) => {
    const bins: TraceBin[] = []
    let id = 1
    // Bins on the alleles' repeat grid.
    const a0 = l.alleles[0]![0]
    const start = a0 - l.repeat * Math.floor((a0 - l.range[0] - 1) / l.repeat)
    for (let bp = start; bp <= l.range[1] - 1; bp += l.repeat) {
      bins.push({ id: `${l.label}-${id++}`, label: String(Math.round(bp)), center: bp, halfWidth: 0.75 })
    }
    return [l.label, bins]
  }),
)

export interface MockWell {
  series: TraceSeries[]
  peaks: TracePeak[]
  ladder: LadderMarker[]
  baseSizes: Float64Array
}

/** Full well: four locus dyes plus the orange LIZ ladder. */
export function makeWell(seed = 7, opts: { scale?: number; alleleShift?: number } = {}): MockWell {
  const r = rng(seed)
  const sizes = makeBaseSizes(seed)
  const scale = opts.scale ?? 1
  const series: TraceSeries[] = []
  const peaks: TracePeak[] = []
  const comps: Record<string, Component[]> = { blue: [], green: [], yellow: [], red: [], orange: [] }

  for (const l of DEMO_LOCI) {
    const binLabel = (bp: number) =>
      DEMO_BINS[l.label]?.find((b) => Math.abs(b.center - bp) <= b.halfWidth * 1.5)?.label ?? null
    for (const [bp0, h0] of l.alleles) {
      const bp = bp0 + (opts.alleleShift ?? 0) + r.gauss() * 0.12
      const h = h0 * scale * (0.9 + r.next() * 0.2)
      comps[l.color]!.push({ bp, height: h, kind: 'allele', label: binLabel(bp0) ?? undefined })
      // −1 repeat stutter (~9%), −2 repeat (~1.5%), +1 repeat (~2%).
      comps[l.color]!.push({ bp: bp - l.repeat, height: h * 0.09, kind: 'stutter' })
      comps[l.color]!.push({ bp: bp - 2 * l.repeat, height: h * 0.015, kind: 'stutter' })
      comps[l.color]!.push({ bp: bp + l.repeat, height: h * 0.02, kind: 'stutter' })
    }
  }
  // Pull-up of the tall blue allele into green.
  const tall = DEMO_LOCI[0]!.alleles[0]!
  comps.green!.push({ bp: tall[0] + 0.3, height: tall[1] * scale * 0.045, kind: 'pullup' })
  // Ladder.
  for (const s of LIZ500) comps.orange!.push({ bp: s, height: (1400 + r.gauss() * 150) * (s > 400 ? 0.8 : 1), kind: 'ladder' })
  // A few low noise peaks.
  for (let k = 0; k < 6; k++) comps.blue!.push({ bp: 150 + r.next() * 60, height: 60 + r.next() * 90, kind: 'noise' })

  const DYES: Color[] = ['blue', 'green', 'yellow', 'red', 'orange']
  for (const dye of DYES) {
    const data = new Float64Array(sizes.length)
    render(data, sizes, comps[dye]!)
    noise(data, r, 9, 18)
    series.push({ id: dye, color: dye, label: dye === 'orange' ? 'LIZ 500' : (DEMO_LOCI.find((l) => l.color === dye)?.label ?? dye), data, baseSizes: sizes })

    const locus = DEMO_LOCI.find((l) => l.color === dye)
    for (const c of comps[dye]!) {
      if (c.kind === 'ladder') continue
      // Stutter that lands on a true allele is part of that peak, not a separate one.
      if (c.kind !== 'allele' && comps[dye]!.some((o) => o.kind === 'allele' && Math.abs(o.bp - c.bp) < 1.2)) continue
      const idx = Math.round(invertInterp(sizes, c.bp))
      // Snap to the local apex of the rendered signal.
      let apex = idx
      for (let i = idx - 4; i <= idx + 4; i++) if ((data[i] ?? 0) > (data[apex] ?? 0)) apex = i
      const height = data[apex] ?? c.height
      if (height < 120 && c.kind !== 'noise') continue
      const inBins = locus ? DEMO_BINS[locus.label]?.find((b) => Math.abs(b.center - c.bp) <= b.halfWidth) : undefined
      let state: TracePeak['state']
      if (c.kind === 'allele') state = 'called'
      else if (c.kind === 'stutter') state = 'artifact'
      else if (c.kind === 'pullup') state = 'flagged'
      else state = 'below'
      const detail: string[] = []
      if (c.kind === 'allele' && dye === 'blue' && Math.abs(c.bp - 170) < 1)
        detail.push('also at −1 stutter of 174', 'artifact 324 ± 60 RFU expected', 'P(allele) 0.998')
      if (c.kind === 'stutter') detail.push('−1 repeat stutter')
      if (c.kind === 'pullup') detail.push('bleedthrough ×22.1 from blue')
      peaks.push({
        id: `${dye}-${peaks.length}`,
        seriesId: dye,
        index: apex,
        size: sizes[apex] ?? c.bp,
        height,
        state,
        label: state === 'called' ? (c.label ?? inBins?.label ?? null) : null,
        detail,
      })
    }
  }
  const ladder: LadderMarker[] = LIZ500.map((s, i) => {
    const idx = Math.round(invertInterp(sizes, s))
    return { index: idx, size: s, seriesId: 'orange', status: i === 6 ? 'outlier' : 'ok' }
  })
  // One unassigned candidate ladder peak (e.g. a spurious peak the user can add).
  const extra = Math.round(invertInterp(sizes, 222))
  const orange = series.find((s) => s.id === 'orange')!.data as Float64Array
  render(orange, sizes, [{ bp: 222, height: 700, kind: 'ladder' }])
  ladder.push({ index: extra, size: null, seriesId: 'orange', status: 'unassigned' })
  return { series, peaks, ladder, baseSizes: sizes }
}

/** Same locus in other wells, as faded overlays. */
export function makeOverlays(dye: Color, count: number, seed = 100): TraceSeries[] {
  const out: TraceSeries[] = []
  for (let k = 0; k < count; k++) {
    const w = makeWell(seed + k * 13, { scale: 0.5 + k * 0.25, alleleShift: (k % 2 ? 1 : -1) * 4 * (k + 1) })
    const s = w.series.find((x) => x.color === dye)
    if (s) out.push({ ...s, id: `${dye}-overlay-${k}`, overlay: true, label: `Well ${String.fromCharCode(66 + k)}0${k + 3}` })
  }
  return out
}

/** Plate data in both coloring modes. */
export function makePlate(format: PlateFormat = 96, seed = 3): Record<string, WellDatum> {
  const r = rng(seed)
  const out: Record<string, WellDatum> = {}
  const wells = allWells(format)
  wells.forEach((w, i) => {
    if (format === 96 && (w === 'H11' || w === 'H12')) {
      out[w] = { status: 'empty', disabled: true, label: 'empty' }
      return
    }
    const u = r.next()
    const status: WellStatus = u < 0.06 ? 'failed' : u < 0.16 ? 'flagged' : 'ok'
    // Column effect: weaker signal on the right half, like a pipetting issue.
    const colFactor = 1 - ((i % (format === 96 ? 12 : 24)) / (format === 96 ? 12 : 24)) * 0.6
    const dye = (base: number) => {
      const v = Math.exp(Math.log(base * colFactor) + r.gauss() * 0.9)
      return r.next() < 0.04 ? null : r.next() < 0.03 ? 33000 : v
    }
    const dyes = [
      { color: 'blue' as Color, value: status === 'failed' ? null : dye(9000) },
      { color: 'green' as Color, value: status === 'failed' ? null : dye(4000) },
      { color: 'yellow' as Color, value: status === 'failed' ? null : dye(2000) },
    ]
    out[w] = {
      status,
      value: dyes[0]!.value,
      dyes,
      label: `P1-S${String(i + 1).padStart(3, '0')}`,
      detail: [`SQ ${status === 'ok' ? (r.next() * 0.8).toFixed(2) : status === 'flagged' ? (1 + r.next() * 4).toFixed(2) : '—'}`],
    }
  })
  return out
}

/** Bin-estimator scatter for the blue locus across many runs. */
export function makeBinPoints(runs = 700, seed = 11): { points: ScatterPoint[]; bins: Bin[] } {
  const r = rng(seed)
  const alleles = [154, 158, 162, 166, 170, 174, 178, 186, 194, 202]
  const freq = [0.05, 0.08, 0.28, 0.06, 0.12, 0.2, 0.08, 0.07, 0.04, 0.02]
  const pick = () => {
    let u = r.next()
    for (let i = 0; i < alleles.length; i++) {
      u -= freq[i] as number
      if (u <= 0) return alleles[i] as number
    }
    return alleles[0] as number
  }
  const points: ScatterPoint[] = []
  for (let k = 0; k < runs; k++) {
    // MOI 1–4: any number of alleles, unequal heights.
    const moi = 1 + Math.floor(-Math.log(Math.max(1e-9, r.next())) * 0.8)
    const chosen = new Set<number>()
    for (let j = 0; j < Math.min(4, moi); j++) chosen.add(pick())
    const heights = [...chosen].map((_, j) => (j === 0 ? 1 : 0.06 + r.next() * 0.8))
    ;[...chosen].forEach((a, j) => {
      const h = heights[j] as number
      const x = a + 0.15 + r.gauss() * 0.18 + (a - 150) * 0.004
      points.push({ x, y: h })
      points.push({ x: x - 4 + r.gauss() * 0.1, y: Math.max(0.01, h * (0.08 + r.gauss() * 0.02)) })
    })
    if (r.next() < 0.3) points.push({ x: 150 + r.next() * 60, y: r.next() * 0.04 })
  }
  const bins: Bin[] = alleles.slice(0, 9).map((a, i) => ({
    id: i + 1,
    label: String(a),
    base_size: a + 0.3 + (a - 150) * 0.004,
    bin_buffer: 0.75,
    peak_count: Math.round(runs * (freq[i] as number) * 1.3),
  }))
  return { points, bins }
}

/** Artifact scatter for the −4 bp class, with a slope change at 200 bp. */
export function makeArtifactData(n = 420, seed = 5) {
  const r = rng(seed)
  const f = (x: number) => (x < 200 ? 0.03 + 0.0011 * (x - 150) : 0.085 + 0.00035 * (x - 200))
  const points: ScatterPoint[] = []
  for (let k = 0; k < n; k++) {
    const x = 150 + r.next() * 110
    points.push({ x, y: Math.max(0.002, f(x) + r.gauss() * (x < 200 ? 0.011 : 0.014)) })
  }
  const segments: ArtifactSegment[] = [
    { start: 150, end: 200, slope: 0.0011, intercept: 0.03 - 0.0011 * 150, sd: 0.011 },
    { start: 200, end: 260, slope: 0.00035, intercept: 0.085 - 0.00035 * 200, sd: 0.014 },
  ]
  return { points, segments, breakpoints: [200] }
}

export interface MockSampleRow {
  id: string
  barcode: string
  plate: string
  well: string
  moi: number
  loci: number
  status: 'ok' | 'flagged' | 'failed'
  maxHeight: number
  notes: string
}

export function makeSampleRows(n = 2500, seed = 21): MockSampleRow[] {
  const r = rng(seed)
  const wells = allWells(96)
  return Array.from({ length: n }, (_, i) => {
    const u = r.next()
    return {
      id: String(i + 1),
      barcode: `${['KIS', 'TOR', 'MAL', 'BDG'][i % 4]}-${String(1000 + i * 7).padStart(5, '0')}`,
      plate: `Plate ${String(Math.floor(i / 96) + 1).padStart(2, '0')}`,
      well: wells[i % 96] as string,
      moi: 1 + Math.floor(-Math.log(Math.max(1e-9, r.next())) * 1.1),
      loci: r.int(4, 12),
      status: u < 0.05 ? 'failed' : u < 0.14 ? 'flagged' : 'ok',
      maxHeight: Math.round(Math.exp(7.5 + r.gauss() * 0.8)),
      notes: r.next() < 0.1 ? 'low DNA, rerun' : '',
    }
  })
}
