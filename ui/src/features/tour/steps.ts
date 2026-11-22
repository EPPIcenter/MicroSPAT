/**
 * The stops of the guided tour, in the order of the work. The tour runs on
 * the demo study (`load_demo_data`), so the text can name what is on screen.
 *
 * A step names the page it needs (`path`) and the element it points at
 * (`target`, a CSS selector; the first visible match is used). Without a
 * target the card sits in the middle of the window. The start dialog
 * (`Tour.tsx`) introduces the demo study, so the first stop is a screen. To add a stop, add a
 * step here; give the element a `data-tour` attribute when it has no stable
 * selector of its own.
 */
import { kbd } from '@/lib/platform'
import type { Side, TourContext } from './model'

export interface TourStep {
  id: string
  title: string
  /** Paragraphs. */
  body: readonly string[]
  /** Page the step is shown on, with its query string. Absent: stay on the current page. */
  path?: (c: TourContext) => string
  /** CSS selector of the element to highlight. */
  target?: string
  /** Side of the target the card goes on when it fits there. */
  prefer?: Side
  /** Space between the target and the highlight's edge, in px. */
  pad?: number
  /** Leave the step out when this is false (the demo lacks what it shows). */
  when?: (c: TourContext) => boolean
}

const review = (c: TourContext) =>
  `/projects/${c.genotypingId}?tab=review${c.showcaseSampleId != null ? `&sample=${c.showcaseSampleId}` : ''}`
const plate = (c: TourContext) => `/plates/${c.plateId}?tab=well${c.failedWell != null ? `&well=${c.failedWell}` : ''}`

// A card sits beside the screen it explains, so it says what the screen does
// not: keep each stop near 50 words, and leave out what is plainly visible.
export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'sidebar',
    title: 'The sidebar follows the work',
    body: [
      'You work down the sidebar: import under Data, describe your assay under Setup, learn bins and stutter from your own runs under Calibration, and call alleles under Genotyping.',
      'A page that needs an earlier step says so and links to it.',
    ],
    target: 'nav[aria-label="Main"]',
    prefer: 'right',
    pad: 0,
  },
  {
    id: 'workspace',
    title: 'One file holds the whole analysis',
    body: [
      'A workspace is one .microspat file with your raw traces, plate maps, calibrations, calls, and manual edits. Most changes are saved as you make them.',
      'To share an analysis, send the file. This menu is where you create a workspace and start this tour again.',
    ],
    target: '[data-tour="workspace-menu"]',
    prefer: 'right',
  },
  {
    id: 'plate',
    title: 'Plates: check every well',
    body: [
      'Importing a plate sizes every well against the ladder, the size standard that you choose at import. A failed well is marked with ×, and the legend counts each sizing state.',
      'Switch to Signal to see dye strength across the plate and spot weak or off-scale wells early.',
    ],
    path: plate,
    target: 'section[aria-label="Plate"]',
    prefer: 'left',
    pad: 0,
  },
  {
    id: 'well',
    title: 'The trace of one well',
    body: [
      'Select a well to see its raw trace, one line per dye. A flagged or failed well gives the reason under its name.',
      'If MicroSPAT picked the wrong ladder peaks, choose Edit ladder and pick them by hand. The fit previews as you click, and Apply saves it. Scroll to zoom and drag to pan.',
    ],
    path: plate,
    target: '[data-testid="well-inspector"]',
    prefer: 'left',
    pad: 0,
  },
  {
    id: 'plate-map',
    title: 'A plate map names the samples',
    body: [
      'A plate map is a CSV file that gives, for each well and locus, the barcode of the sample run there. Applying one creates the samples and their runs. A run is one sample at one locus in one well.',
      'Barcodes that contain NTC become negative controls, which flag contamination on their plate.',
    ],
    path: plate,
    target: '[data-tour="plate-map"]',
    prefer: 'bottom',
  },
  {
    id: 'loci',
    title: 'Loci: your markers',
    body: [
      'A locus has a dye, a size range, and a repeat length. Size layout shows where each locus sits on its dye, so overlapping ranges stand out.',
      'Add loci by hand or import a CSV file. Then group the loci that you analyze together into a locus set.',
    ],
    path: () => '/loci',
    target: 'section[aria-label="Size layout"]',
    prefer: 'bottom',
    pad: 0,
  },
  {
    id: 'bins',
    title: 'Bin estimators: where the alleles are',
    body: [
      'Each dot is a peak from one run. Peaks pile up at the allele sizes, and a bin estimator turns each pile into a bin, the shaded columns. A peak is called only inside a bin, so check every locus.',
      `Adjust bins here or in the table. Edits are a draft until you save with ${kbd('⌘S')}.`,
    ],
    path: (c) => `/bin-estimators/${c.binEstimatorId}`,
    target: '[data-testid="bin-plot"]',
    prefer: 'right',
    pad: 0,
  },
  {
    id: 'artifacts',
    title: 'Artifact estimators: how tall is stutter?',
    body: [
      'From runs with a single clone, an artifact estimator learns how tall each kind of stutter is relative to its parent peak, and how that changes with fragment size.',
      'The line is the expected stutter height, with bands at one and two standard deviations. A peak well above the bands is more than stutter.',
    ],
    path: (c) => `/artifact-estimators/${c.artifactEstimatorId}`,
    target: '[data-testid="estimator-panel"]',
    prefer: 'left',
    pad: 0,
  },
  {
    id: 'quant-bias',
    title: 'Optional: quantification bias',
    body: [
      'PCR favors shorter fragments, so a short allele looks more abundant than it is. Control strains mixed at known proportions measure that bias at each locus.',
      'The right plot shows how well the correction recovers the true shares. Skip this step if you only need to know which alleles are present.',
    ],
    path: (c) => `/quant-bias/${c.quantBiasId}`,
    target: '[data-testid="locus-bias"]',
    pad: 0,
    when: (c) => c.quantBiasId != null,
  },
  {
    id: 'project',
    title: 'A genotyping project puts it together',
    body: [
      'A genotyping project combines a locus set, your samples, and the estimators that you built. The links under the title lead back to each estimator.',
      'The status beside the title says whether the results are current. After an upstream change, such as a moved bin, the affected loci are marked as out of date until you re-analyze them.',
    ],
    path: review,
    target: '[data-testid="project-header"]',
    prefer: 'bottom',
    pad: 0,
  },
  {
    id: 'calls',
    title: 'Review: one locus at a time',
    body: [
      'Pick a locus in the strip above. The table lists every sample with its called alleles and their shares. MOI, the multiplicity of infection, is counted across all loci.',
      'Filters such as Needs attention and Low-probability calls narrow the table to the calls that need a second look.',
    ],
    path: review,
    target: '[data-testid="calls-table"]',
    prefer: 'right',
    pad: 0,
  },
  {
    id: 'trace',
    title: 'A minor clone on a stutter position',
    body: [
      'This sample carries two clones. Allele 84 is the major one, and the small peak at 81 is its stutter.',
      'The peak at 78 also sits on a stutter position of allele 84, but it is several times taller than the artifact estimator expects there. MicroSPAT calls it as a second allele at about 12%.',
    ],
    path: review,
    target: '[data-testid="call-panel"] [data-testid="trace-viewer"]',
    prefer: 'left',
    pad: 0,
  },
  {
    id: 'peaks',
    title: 'Every peak, with the evidence',
    body: [
      'Each row gives the evidence for one peak: its height, the artifact height expected there, and its probability of being a true allele.',
      'To overrule a call, click the peak in the trace or press its number. Press Enter to mark the call as reviewed and move on. The mark survives re-analysis while the call stays the same.',
    ],
    path: review,
    target: '[data-tour="peaks"]',
    prefer: 'left',
    pad: 0,
  },
  {
    id: 'probabilities',
    title: 'Probabilities use the whole project',
    body: [
      'After every locus is analyzed, this pass estimates how common each allele is and how many clones each sample carries. It then gives every candidate peak a probability and re-calls alleles from it.',
      'Run it again after you re-analyze a locus. A dot on the Probabilities tab means that its results are missing or out of date.',
    ],
    path: (c) => `/projects/${c.genotypingId}?tab=probabilities`,
    target: '[data-testid="probabilities-tab"]',
    pad: 0,
  },
  {
    id: 'summary',
    title: 'Summary: the study at a glance',
    body: [
      'Check the study as a whole here: the MOI distribution, failure rates, review progress, and the prevalence of each allele.',
      'An allele that almost no sample carries deserves a look in Review. It can be rare, or its bin can be in the wrong place.',
    ],
    path: (c) => `/projects/${c.genotypingId}?tab=summary`,
    target: '[data-testid="summary-tab"]',
    pad: 0,
  },
  {
    id: 'export',
    title: 'Export the results',
    body: [
      'Export CSV files in three layouts: one row per sample, one row per called allele, or every peak with all of its annotations.',
      'If a result is out of date, MicroSPAT says so here and holds the export until you confirm.',
    ],
    path: (c) => `/projects/${c.genotypingId}?tab=export`,
    target: '[data-testid="export-tab"]',
    pad: 0,
  },
  {
    id: 'next',
    title: 'Your turn',
    body: [
      'The demo study stays in this workspace, so you can click through it, move a bin, and watch which results go out of date.',
      'For your own data, choose New workspace… in the workspace menu, then import your plates on the Plates page. The user guide has every step. Press ? on any page for its shortcuts.',
    ],
    // Back where the work starts, which is also where a new workspace opens.
    path: plate,
  },
]

/** The steps this workspace can show. */
export function tourSteps(c: TourContext): TourStep[] {
  return TOUR_STEPS.filter((s) => s.when?.(c) ?? true)
}
