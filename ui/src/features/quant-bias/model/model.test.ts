import { describe, expect, it } from 'vitest'
import type { BiasEstimate, Control, MixturesReport, QuantBiasParams, QuantBiasPoint } from '@/api/bindings'
import { apparentShare, betaStandardError, fitIssues, fmtBeta, logit, readBeta, sigmoid } from './beta'
import { checkMixture, describeMixture, fillRemainder, fromComponents, mixtureSum, newComponent, toComponents } from './mixtures'
import { buildPointRows, correctionAccuracy, exclusionOf, missingText } from './points'
import { fitGeometry, hitPoint, overviewDomain, pixelPoints, plotScales, regressionDomains } from './plot'
import { mixtureTemplate, previewMixtureCsv, type CsvContext } from './csvPreview'

const PARAMS: QuantBiasParams = { min_peak_height: 1000, min_true_proportion: 0.25, offscale_threshold: 32000 }

function pt(o: Partial<QuantBiasPoint>): QuantBiasPoint {
  return {
    sample_id: 1,
    barcode: 'MIX-1',
    size: 200,
    centered_size: -10,
    observed_proportion: 0.5,
    true_proportion: 0.5,
    log_odds_error: 0,
    corrected_proportion: 0.5,
    used: true,
    ...o,
  }
}

describe('β in words', () => {
  it('a negative β makes shorter fragments look larger', () => {
    const r = readBeta(-0.005)
    // logit 0.5 = 0; +0.05 → 51.25%
    expect(r.sentence).toBe("A fragment 10 bp shorter than its mixture's center appears as 51.2% when its true share is 50%.")
    expect(r.longer).toBe('One 10 bp longer appears as 48.8%.')
    expect(r.favours).toBe('shorter')
  })
  it('a positive β favours longer fragments; zero favours neither', () => {
    expect(readBeta(0.02).favours).toBe('longer')
    expect(readBeta(0).favours).toBe('neither')
  })
  it('apparent share inverts with the model', () => {
    const obs = apparentShare(-0.01, -20, 0.3)
    expect(sigmoid(logit(obs) - -0.01 * -20)).toBeCloseTo(0.3, 10)
  })
  it('formats β with a real minus sign', () => {
    expect(fmtBeta(-0.00494)).toBe('−0.0049')
    expect(fmtBeta(null)).toBe('–')
  })
})

describe('fit issues', () => {
  const est = (o: Partial<BiasEstimate>): BiasEstimate => ({ beta: -0.005, sd: 0.01, r_squared: 0.95, n_peaks: 16, n_sets: 8, ...o })
  it('a good fit has none', () => expect(fitIssues(est({}), 0.0005)).toEqual([]))
  it('flags positive β first, then poor R² and few mixtures', () => {
    expect(fitIssues(est({ beta: 0.004, r_squared: 0.2, n_sets: 2 })).map((i) => i.tag)).toEqual(['positive β', 'R² 0.20', '2 mixtures'])
  })
  it('flags an interval that includes 0', () => expect(fitIssues(est({}), 0.004).map((i) => i.tag)).toEqual(['not clearly ≠ 0']))
  it('no estimate is an issue of its own', () => expect(fitIssues(null)[0]!.tag).toBe('no estimate'))
  it('standard error is clustered by mixture', () => {
    // Two two-strain runs, mirror-image points; residuals 0.1 and −0.05 at x = 10.
    const run = (id: number, x: number, e: number) => [
      pt({ sample_id: id, centered_size: -x, log_odds_error: -e - 0.01 * x }),
      pt({ sample_id: id, centered_size: x, log_odds_error: e + 0.01 * x }),
    ]
    const pts = [...run(1, 10, 0.1), ...run(2, 10, -0.05), pt({ sample_id: 3, centered_size: 30, used: false })]
    const sxx = 400
    // Each run's score is 2·x·e: 2 and −1.
    expect(betaStandardError(est({ beta: 0.01, sd: 0.02 }), pts)).toBeCloseTo(Math.sqrt(2 * (4 + 1)) / sxx, 12)
    // One mixture gives no clustered error.
    expect(betaStandardError(est({ beta: 0.01 }), run(1, 10, 0.1))).toBeNull()
  })
})

describe('mixture editing', () => {
  const ids = new Set([1, 2, 3])
  it('keeps a running sum and accepts 100% within one point', () => {
    const a = newComponent(1, 70)
    const b = newComponent(2, 30.5)
    const c = checkMixture([a, b], ids)
    expect(c.sum).toBe(100.5)
    expect(c.ok).toBe(true)
    expect(toComponents([a, b])).toEqual([
      { control_id: 1, proportion: 0.7 },
      { control_id: 2, proportion: 0.305 },
    ])
  })
  it('reports a short sum, missing shares, duplicates and foreign controls', () => {
    const rows = [newComponent(1, 60), newComponent(1, 20), newComponent(9, 10), newComponent(null, 5), newComponent(2, null)]
    const c = checkMixture(rows, ids)
    expect(c.errors).toEqual(['Shares sum to 95%, not 100%.'])
    expect(Object.values(c.rowErrors)).toEqual([
      'This control is already in the mixture.',
      "Not a control of this project's bin estimator.",
      'Choose a control.',
      'Enter its share.',
    ])
    expect(c.ok).toBe(false)
    expect(c.remainder).toBe(5)
  })
  it('warns (without blocking) about a single strain', () => {
    const c = checkMixture([newComponent(1, 100)], ids)
    expect(c.ok).toBe(true)
    expect(c.warnings).toHaveLength(1)
  })
  it('fills the remainder and round-trips components', () => {
    const rows = fromComponents([
      { control_id: 1, proportion: 0.3 },
      { control_id: 2, proportion: 0.1 },
    ])
    const filled = fillRemainder(rows, rows[1]!.key)
    expect(mixtureSum(filled)).toBe(100)
    expect(filled[1]!.percent).toBe(70)
    expect(
      describeMixture(
        [
          { control_id: 1, label: '3D7', proportion: 0.7 },
          { control_id: 2, proportion: 0.30000000000000004 },
        ],
        () => 'DD2',
      ),
    ).toBe('3D7 70% · DD2 30%')
  })
})

describe('control peaks and exclusion reasons', () => {
  it("words the engine's reason with the fit's parameters", () => {
    expect(exclusionOf(pt({ used: true }), PARAMS)).toBeNull()
    const low = exclusionOf(pt({ true_proportion: 0.1, used: false, exclusion: 'below_min_true_proportion' }), PARAMS)!
    expect(low.label).toBe('share 10% below range')
    expect(low.text).toContain('25%–75%')
    expect(exclusionOf(pt({ true_proportion: 0.9, used: false, exclusion: 'above_max_true_proportion' }), PARAMS)!.label).toBe(
      'share 90% above range',
    )
    expect(exclusionOf(pt({ height: 800, used: false, exclusion: 'below_min_height' }), PARAMS)!.text).toContain('800 RFU')
    expect(exclusionOf(pt({ used: false, exclusion: 'off_scale' }), PARAMS)!.text).toContain('32,000 RFU')
    expect(exclusionOf(pt({ used: false, exclusion: 'partner_excluded' }), null)!.code).toBe('partner_excluded')
    expect(exclusionOf(pt({ used: false }), PARAMS)!.code).toBe('unknown')
  })
  it('words missing control alleles', () => {
    expect(missingText('not_set')).toBe('no allele set at this locus')
    expect(missingText('bin_deleted')).toContain('deleted')
  })
  it('rows carry z-scores of used points and the allele label', () => {
    const rows = buildPointRows(
      [
        pt({ centered_size: -10, log_odds_error: 0.25, bin_id: 1, bin_label: '200', height: 4000 }),
        pt({ centered_size: 10, log_odds_error: -0.05, size: 220 }),
      ],
      PARAMS,
      {
        beta: -0.005,
        sd: 0.1,
      },
    )
    expect(rows[0]!.height).toBe(4000)
    expect(rows[0]!.z).toBeCloseTo(2, 10)
    expect(rows[0]!.allele).toBe('200')
    expect(rows[1]!.allele).toBeNull()
  })
  it('correction accuracy compares observed and corrected shares with the truth', () => {
    const acc = correctionAccuracy([
      pt({ observed_proportion: 0.55, corrected_proportion: 0.51 }),
      pt({ observed_proportion: 0.45, corrected_proportion: 0.49 }),
    ])
    expect(acc!.before).toBeCloseTo(0.05)
    expect(acc!.after).toBeCloseTo(0.01)
  })
})

describe('plot geometry', () => {
  const pts = [
    pt({ centered_size: -10, log_odds_error: 0.06 }),
    pt({ centered_size: 10, log_odds_error: -0.04 }),
    pt({ centered_size: 3, log_odds_error: null }),
  ]
  it('domains are symmetric around the origin and cover the line ± SD', () => {
    const d = regressionDomains(pts, -0.005, 0.01)
    expect(d.x[0]).toBeCloseTo(-d.x[1])
    expect(d.y[0]).toBeCloseTo(-d.y[1])
    expect(d.x[1]).toBeGreaterThan(10)
    expect(d.y[1]).toBeGreaterThan(0.06)
    expect(d.y[1]).toBeGreaterThan(0.005 * d.x[1] + 0.01)
  })
  it('maps and hit-tests points, skipping those without log-odds', () => {
    const d = regressionDomains(pts, -0.005, 0.01)
    const r = { x: 50, y: 10, w: 400, h: 200 }
    const s = plotScales(r, d.x, d.y)
    const px = pixelPoints(
      pts,
      (p) => p.centered_size,
      (p) => p.log_odds_error,
      s.x,
      s.y,
    )
    expect(Number.isNaN(px[2]!.px)).toBe(true)
    expect(px[0]!.px).toBeLessThan(250)
    expect(px[0]!.py).toBeLessThan(110) // positive y is above the middle
    expect(hitPoint(px, px[1]!.px + 3, px[1]!.py - 2)).toBe(1)
    expect(hitPoint(px, 250, 110, 4)).toBe(-1)
  })
  it('fit geometry is a line through the origin with a band of ±SD', () => {
    const g = fitGeometry(-0.01, 0.05, [-20, 20])
    expect(g.line[0]).toEqual([-20, 0.2])
    expect(g.band[0][1] - g.band[3][1]).toBeCloseTo(0.1)
  })
  it('the overview always shows 0', () => {
    const d = overviewDomain([{ beta: -0.005, lo: -0.006, hi: -0.004 }])
    expect(d[0]).toBeLessThan(-0.006)
    expect(d[1]).toBeGreaterThan(0)
  })
})

describe('mixtures CSV preview', () => {
  const ctx: CsvContext = {
    samples: [
      { id: 10, barcode: 'MIX-01' },
      { id: 11, barcode: 'MIX-02' },
      { id: 12, barcode: 'MIX-03' },
    ],
    projectSampleIds: new Set([10]),
    controls: [
      { id: 1, label: '3D7', bin_estimator_id: 5, bin_estimator_title: 'Demo bins' },
      { id: 2, label: 'DD2', bin_estimator_id: 5, bin_estimator_title: 'Demo bins' },
      { id: 3, label: 'W2', bin_estimator_id: 6, bin_estimator_title: 'Other bins' },
    ] satisfies Pick<Control, 'id' | 'label' | 'bin_estimator_id' | 'bin_estimator_title'>[],
    binEstimatorId: 5,
    binEstimatorTitle: 'Demo bins',
  }
  const ok: MixturesReport = { applied: false, problems: [], mixtures: [], added: 1, replaced: 1 }

  it('needs a Barcode column', () => {
    expect(previewMixtureCsv('Sample,C1\nMIX-01,3D7;1', null, ctx).fatal).toMatch(/Barcode column/)
  })
  it('a valid file can be applied and marks new and replaced samples', () => {
    const p = previewMixtureCsv('Barcode,C1,C2\nMIX-01,3D7;0.7,DD2;0.3\n\nmix-02,3d7;0.5,DD2;0.5\n', ok, ctx)
    expect(p.canApply).toBe(true)
    expect(p.rows.map((r) => [r.line, r.change, r.sum])).toEqual([
      [2, 'replace', 1],
      [4, 'new', 1],
    ])
  })
  it('reports every problem on its row', () => {
    const csv = 'Barcode,C1,C2\nMIX-01,3D7;0.7,DD2;0.2\nNOPE,3D7;0.5,DD2;0.5\nMIX-02,W2;0.5,DD2;0.5\nMIX-03,3D7;70,DD2 30\nMIX-01,3D7;1\n'
    const report: MixturesReport = {
      applied: false,
      problems: [
        'MIX-01: proportions sum to 0.900, not 1',
        'Unknown barcodes (1): NOPE',
        'line 5: "DD2 30" should read CONTROL;PROPORTION',
        'MIX-01 appears twice',
        'Something else entirely',
      ],
      mixtures: [],
      added: 0,
      replaced: 0,
    }
    const p = previewMixtureCsv(csv, report, ctx)
    expect(p.canApply).toBe(false)
    expect(p.rows.map((r) => r.problems)).toEqual([
      ['proportions sum to 0.9, not 1'],
      ['unknown barcode: no sample NOPE in the workspace'],
      ["W2 is a control of “Other bins”, not of this project's bin estimator “Demo bins”"],
      ['3D7: proportion 70 must be above 0 and at most 1 (write 0.7, not 70)', '“DD2 30” should read CONTROL;PROPORTION'],
      ['listed twice (also line 2)'],
    ])
    expect(p.general).toEqual(['Something else entirely'])
    expect(p.badRows).toBe(5)
  })
  it('falls back to the engine wording for rows it cannot judge itself', () => {
    const report: MixturesReport = { ...ok, problems: ['MIX-02: a control is listed twice'] }
    const p = previewMixtureCsv('Barcode,C1\nMIX-02,3D7;1', report, ctx)
    expect(p.rows[0]!.problems).toEqual(['a control is listed twice'])
    expect(p.canApply).toBe(false)
  })
  it('the template round-trips current mixtures or shows an example', () => {
    expect(mixtureTemplate([], ['3D7', 'DD2'])).toBe(
      'Barcode,Control 1,Control 2\nMIX-01,3D7;0.7,DD2;0.3\nMIX-02,3D7;0.5,DD2;0.5\nMIX-03,3D7;0.3,DD2;0.7\n',
    )
    expect(
      mixtureTemplate(
        [
          {
            barcode: 'A',
            controls: [
              { label: '3D7', proportion: 0.30000000000000004 },
              { label: 'DD2', proportion: 0.7 },
            ],
          },
        ],
        [],
      ),
    ).toBe('Barcode,Control 1,Control 2\nA,3D7;0.3,DD2;0.7\n')
  })
})
