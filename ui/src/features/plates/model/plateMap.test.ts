import { describe, expect, it } from 'vitest'
import type { PlateImportOutcome, PlateMapAssignment, PlateMapReport, QualitySummary } from '@/api/bindings'
import { assignmentTable, parseCsv, parsePlateMap, presentPlateMap } from './plateMap'
import { describeFiles, mergeFiles, qualityFindings, sortOutcomes, summarizeImport } from './importSummary'

const report = (p: Partial<PlateMapReport> = {}): PlateMapReport => ({
  applied: false,
  problems: [],
  unknown_samples: [],
  unknown_loci: [],
  created_samples: [],
  run_count: 0,
  runs_kept: 0,
  runs_removed: 0,
  ...p,
})

describe('csv', () => {
  it('handles quotes, doubled quotes, CRLF and blank lines', () => {
    expect(parseCsv('a,"b, c"\r\n\r\n"x ""y""", z\n')).toEqual([
      ['a', 'b, c'],
      ['x "y"', 'z'],
    ])
  })
  it('reads a plate map, normalizing wells and keeping column order', () => {
    const m = parsePlateMap('﻿Well,PfB1,PfG1\nA1,S1,S1\nB02,,S2\n')
    expect(m.error).toBeNull()
    expect(m.loci).toEqual(['PfB1', 'PfG1'])
    expect(m.rows).toEqual([
      { well: 'A01', cells: ['S1', 'S1'] },
      { well: 'B02', cells: ['', 'S2'] },
    ])
  })
  it('explains a missing Well column', () => {
    expect(parsePlateMap('Barcode,PfB1\nX,Y').error).toMatch(/Well column/)
  })
})

describe('plate map dry run', () => {
  const as = (well: string, locus: string, barcode: string, change: PlateMapAssignment['change'], o: Partial<PlateMapAssignment> = {}): PlateMapAssignment => ({
    well,
    locus_id: locus === 'PfB1' ? 1 : 2,
    locus_label: locus,
    barcode,
    sample_id: 7,
    change,
    creates_sample: false,
    ...o,
  })

  it('is ready when there are no problems, counting wells from the assignments', () => {
    const p = presentPlateMap(
      report({
        run_count: 3,
        created_samples: [{ barcode: 'NTC-1', designation: 'negative_control' }],
        assignments: [as('A01', 'PfB1', 'S1', 'new'), as('A01', 'PfG1', 'S1', 'new'), as('A02', 'PfB1', 'NTC-1', 'new', { sample_id: null, creates_sample: true })],
      }),
    )
    expect(p.status).toBe('ready')
    expect(p.headline).toBe('Ready to assign 3 runs in 2 wells, creating 1 sample.')
    expect(p.table?.loci).toEqual(['PfB1', 'PfG1'])
    expect(p.table?.rows[1]?.cells).toEqual([{ barcode: 'NTC-1', state: 'create', removed: null }, null])
    expect(p.facts.map((f) => f.label)).toContain('Samples to create')
  })

  it('shows replaced and removed runs in their cells', () => {
    const t = assignmentTable([
      as('A01', 'PfB1', 'S1', 'removed'),
      as('A01', 'PfB1', 'S9', 'new', { sample_id: null }),
      as('A01', 'PfG1', 'S1', 'unchanged'),
      as('A02', 'PfB1', 'S2', 'unchanged'),
      as('A02', 'PfG1', 'S2', 'removed'),
      as('A03', 'PfB1', 'S3', 'unchanged'),
    ])
    expect(t.rows.map((r) => [r.well, r.changed])).toEqual([
      ['A01', true],
      ['A02', true],
      ['A03', false],
    ])
    expect(t.changedRows).toBe(2)
    expect(t.rows[0]?.cells[0]).toEqual({ barcode: 'S9', state: 'unknown', removed: 'S1' })
    expect(t.rows[1]?.cells[1]).toEqual({ barcode: '', state: 'removed', removed: 'S2' })
  })

  it('separates unknown samples from other problems', () => {
    const p = presentPlateMap(report({ run_count: 2, unknown_samples: ['NTC-1'], problems: ['Unknown samples (1): NTC-1. Turn on "create missing samples" to add them.'] }))
    expect(p.status).toBe('samples')
    expect(p.problems).toEqual([])
    expect(p.unknownSamples).toEqual(['NTC-1'])
  })

  it('lists unknown loci apart and marks the map invalid', () => {
    const p = presentPlateMap(
      report({
        run_count: 1,
        unknown_loci: ['Nope'],
        problems: ['Unknown loci in the header: Nope. Create them first.', 'Wells not on this plate: P24'],
        runs_kept: 10,
        runs_removed: 3,
      }),
    )
    expect(p.status).toBe('invalid')
    expect(p.problems).toEqual(['Wells not on this plate: P24'])
    expect(p.headline).toBe('2 problems must be fixed before this map can be applied.')
    expect(p.facts.find((f) => f.label === 'Removed or reassigned')).toMatchObject({ value: '3', tone: 'warn' })
  })

  it('works with an engine that reports no assignments', () => {
    const p = presentPlateMap(report({ run_count: 576 }))
    expect(p.table).toBeNull()
    expect(p.headline).toBe('Ready to assign 576 runs.')
  })
})

describe('import', () => {
  const o = (label: string, status: 'imported' | 'duplicate' | 'failed', failed = 0, quality: QualitySummary | null = null): PlateImportOutcome => ({
    label,
    source: `${label}.zip`,
    status,
    plate_id: status === 'imported' ? 1 : null,
    well_count: 96,
    sizing: status === 'imported' ? { good: 96 - failed, flagged: 0, unusable: 0, failed } : null,
    message: status === 'failed' ? 'bad file' : null,
    quality,
  })

  it('summarizes outcomes', () => {
    const s = summarizeImport([o('P2', 'imported', 2), o('P1', 'imported'), o('P3', 'duplicate'), o('P4', 'failed')])
    expect(s).toMatchObject({ imported: 2, duplicate: 1, failed: 1, wells: 192, unsized: 2, tone: 'danger' })
    expect(s.headline).toBe('2 plates imported, 1 already in the workspace, 1 failed')
    expect(summarizeImport([o('P1', 'imported')]).tone).toBe('ok')
  })

  it('lists quality findings of imported plates, worst first', () => {
    const q = (problems: number, infos: number): QualitySummary => ({ problems, warnings: 0, infos, worst: problems ? 'problem' : infos ? 'info' : null, outdated: false })
    const f = qualityFindings([o('P1', 'imported', 0, q(0, 2)), o('P2', 'imported', 0, q(1, 1)), o('P3', 'imported', 0, q(0, 0)), o('P4', 'imported'), o('P5', 'duplicate', 0, q(1, 0))])
    expect(f.map((x) => x.text)).toEqual(['P2: 1 problem, 1 note in the quality check', 'P1: 2 notes in the quality check'])
  })

  it('sorts failures first', () => {
    expect(sortOutcomes([o('P2', 'imported'), o('P10', 'failed'), o('P1', 'duplicate'), o('P1', 'imported')]).map((x) => `${x.status}:${x.label}`)).toEqual([
      'failed:P10',
      'duplicate:P1',
      'imported:P1',
      'imported:P2',
    ])
  })

  it('merges and groups chosen files', () => {
    const files = mergeFiles(
      [{ path: '/a.zip', name: 'a.zip' }],
      [
        { path: '/a.zip', name: 'a.zip' },
        { path: '/t/1', name: 'PLATE-2/A01.fsa' },
        { path: '/t/2', name: 'PLATE-2/A02.fsa' },
        { path: '/data/PLATE-3', name: 'PLATE-3' },
      ],
    )
    expect(files).toHaveLength(4)
    expect(describeFiles(files).map((g) => [g.label, g.detail, g.paths.length])).toEqual([
      ['a.zip', 'zip archive', 1],
      ['PLATE-3', 'folder', 1],
      ['PLATE-2', '2 FSA files', 2],
    ])
  })
})
