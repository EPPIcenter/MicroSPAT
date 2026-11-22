/**
 * Synthetic polyclonal runs for the calibration mocks: each run carries one
 * to four clones at unequal heights, with −1 / −2 / +1 repeat stutter whose
 * height grows with size, a −1 bp shadow at TA81 (frequent enough to be
 * binned off the repeat grid) and a stutter regime change at PfPK2 (for
 * breakpoints). PfPK2 has 15,000 runs (about 50,000 peaks) to exercise the
 * bin plot with a large scatter.
 */
import { DEMO_LOCI, rng } from '@/mock/data'

export interface MockRunPeak {
  size: number
  /** Height relative to the run's tallest peak. */
  rel: number
  /** RFU. */
  height: number
  /** On an allele position (not an artifact). */
  allele: boolean
}

export interface MockLocusRuns {
  locusId: number
  label: string
  repeat: number
  range: [number, number]
  alleles: number[]
  runs: MockRunPeak[][]
}

const RUNS: Record<string, number> = { PfPK2: 15000, TA81: 700, POLYa: 500, TA87: 600 }
const cache = new Map<number, MockLocusRuns>()

/** Stutter ratio of the −1 repeat class at a parent size. */
export function mockStutter(label: string, size: number, lo: number): number {
  if (label === 'PfPK2') return size < 182 ? 0.03 + 0.0012 * (size - lo) : 0.068 + 0.0032 * (size - 182)
  return 0.025 + 0.0011 * (size - lo)
}

export function mockLocusRuns(locusId: number): MockLocusRuns | null {
  const hit = cache.get(locusId)
  if (hit) return hit
  const def = DEMO_LOCI[locusId - 1]
  if (!def) return null
  const r = rng(7000 + locusId)
  const [lo, hi] = def.range
  const alleles: number[] = []
  for (let bp = lo + 3; bp <= hi - 3; bp += def.repeat) alleles.push(bp)
  const weights = alleles.map(() => 0.2 + r.next() ** 2 * 3)
  const total = weights.reduce((a, b) => a + b, 0)
  const pick = () => {
    let u = r.next() * total
    for (let i = 0; i < alleles.length; i++) {
      u -= weights[i]!
      if (u <= 0) return i
    }
    return alleles.length - 1
  }
  const sized = (bp: number) => bp + 0.3 + (bp - 150) * 0.003 + r.gauss() * 0.12
  const runs: MockRunPeak[][] = []
  const n = RUNS[def.label] ?? 500
  for (let k = 0; k < n; k++) {
    const u = r.next()
    const moi = u < 0.55 ? 1 : u < 0.8 ? 2 : u < 0.93 ? 3 : 4
    const chosen = new Map<number, number>()
    for (let c = 0; c < moi; c++) {
      const i = pick()
      const h = c === 0 ? 1 : 0.05 + r.next() * 0.65
      chosen.set(i, Math.max(chosen.get(i) ?? 0, h))
    }
    const scale = 2500 + r.next() * 17000
    const peaks: MockRunPeak[] = []
    const add = (size: number, rel: number, allele: boolean) => {
      const height = rel * scale
      if (height >= 100 && rel > 0) peaks.push({ size, rel, height, allele })
    }
    for (const [i, h] of chosen) {
      const bp = alleles[i]!
      const s = sized(bp)
      add(s, h, true)
      add(sized(bp - def.repeat), h * Math.max(0.004, mockStutter(def.label, bp, lo) + r.gauss() * 0.012), false)
      add(sized(bp - 2 * def.repeat), h * Math.max(0.002, 0.012 + r.gauss() * 0.01), false)
      add(sized(bp + def.repeat), h * Math.max(0.002, 0.018 + r.gauss() * 0.008), false)
      if (def.label === 'TA81') add(sized(bp - 1), h * Math.max(0.01, 0.13 + r.gauss() * 0.03), false)
    }
    if (r.next() < 0.08) add(lo + r.next() * (hi - lo), 0.01 + r.next() * 0.03, false)
    // Heights relative to the tallest peak of the run.
    const top = Math.max(...peaks.map((p) => p.height), 1)
    for (const p of peaks) p.rel = p.height / top
    runs.push(peaks)
  }
  const out = { locusId, label: def.label, repeat: def.repeat, range: def.range, alleles, runs }
  cache.set(locusId, out)
  return out
}
