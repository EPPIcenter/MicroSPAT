/**
 * Parameter schemas for the analysis screens, with the descriptions from the
 * MicroSPAT manual as help text and the old defaults. Scanning, filter,
 * genotyping and ladder keys are the engine's field names (`LocusParams`,
 * `LadderSpec`); align the others with the engine's API when their pages land
 * (rename keys here, not in components).
 */
import type { ParamSchema } from '@/components/form/schema'

/**
 * Peak scanning (engine `ScanParams`, the relative-maximum method). Keys are
 * the engine's field names, so `{ ...values }` is a valid `scan` section.
 */
export const scanningParams: ParamSchema = {
  id: 'scanning',
  title: 'Scanning',
  description:
    'How peaks are found in each trace. Changing these re-scans every run of the locus, the slowest step; filter and calling parameters are cheaper to iterate on.',
  sections: [
    {
      fields: [
        {
          key: 'smoothing_window',
          kind: 'number',
          label: 'Smoothing window',
          unit: 'pts',
          default: 11,
          min: 3,
          integer: true,
          step: 2,
          help: 'Window length of the Savitzky–Golay smoothing filter applied before looking for maxima. Must be odd. Wider windows merge close peaks.',
          validate: (v) => (typeof v === 'number' && v % 2 === 0 ? 'Must be odd' : null),
        },
        {
          key: 'smoothing_order',
          kind: 'number',
          label: 'Smoothing order',
          default: 7,
          min: 1,
          integer: true,
          help: 'Polynomial order of the Savitzky–Golay filter. Must be less than the smoothing window.',
          validate: (v, all) =>
            typeof v === 'number' && typeof all.smoothing_window === 'number' && v >= all.smoothing_window
              ? 'Must be less than the smoothing window'
              : null,
        },
        {
          key: 'relmax_window',
          kind: 'number',
          label: 'Relative maximum window',
          unit: 'pts',
          default: 6,
          min: 1,
          integer: true,
          help: 'Points on each side that a smoothed maximum must exceed to count as a peak.',
        },
        {
          key: 'maxima_window',
          kind: 'number',
          label: 'Maxima window',
          unit: 'pts',
          default: 10,
          min: 1,
          integer: true,
          help: 'Each maximum is snapped to the tallest raw point within this many points (total window), so heights are raw, not smoothed.',
        },
        {
          key: 'tophat_factor',
          kind: 'number',
          label: 'Top-hat factor',
          default: 0.005,
          min: 0.0001,
          max: 0.9999,
          step: 0.001,
          help: 'Footprint of the white top-hat baseline filter as a fraction of the trace length. Larger values remove less baseline.',
        },
      ],
    },
  ],
}

/** Peak filters (engine `FilterParams`). Peaks removed here are gone before calling. */
export const filterParams: ParamSchema = {
  id: 'filter',
  title: 'Peak filters',
  description: 'Fast filters applied after scanning. A peak removed here is not shown or considered by any later step.',
  sections: [
    {
      fields: [
        {
          key: 'min_peak_height',
          kind: 'number',
          label: 'Min peak height',
          unit: 'RFU',
          default: 0,
          min: 0,
          step: 50,
          help: 'Peaks lower than this are removed. Genotyping projects default to 0 and flag low peaks themselves; estimators default to 100 RFU so noise does not form bins.',
        },
        { key: 'max_peak_height', kind: 'number', label: 'Max peak height', unit: 'RFU', default: 40000, min: 0, step: 500, help: 'Peaks taller than this are removed.' },
        {
          key: 'min_peak_height_ratio',
          kind: 'number',
          label: 'Min peak height ratio',
          default: 0,
          min: 0,
          max: 1,
          step: 0.01,
          help: 'Peaks whose height relative to the tallest peak of the run is not above this are removed. Keep it low in mixtures: a minor clone can be a few percent of the major one.',
        },
        {
          key: 'max_bleedthrough',
          kind: 'number',
          label: 'Max bleedthrough ratio',
          default: 10,
          min: 0,
          step: 0.5,
          help: 'Bleedthrough ratio: strongest signal in another dye of the same well over this peak. Peaks at or above this are removed before calling. Estimators also drop peaks below this ratio when they fit the plate\'s measured pull-up.',
        },
        {
          key: 'max_crosstalk',
          kind: 'number',
          label: 'Max crosstalk ratio',
          default: 100,
          min: 0,
          step: 0.5,
          help: 'Crosstalk ratio: strongest same-dye signal in neighboring capillaries (as they feed the instrument, not neighboring plate wells), divided by the peak signal. Peaks at or above this are removed. Calling projects default to 100; estimators default to 10, so leaked neighbor alleles do not enter the bin and artifact models.',
        },
        {
          key: 'min_peak_distance',
          kind: 'number',
          label: 'Min peak distance',
          unit: 'bp',
          default: 2.2,
          min: 0,
          step: 0.1,
          help: 'Of peaks closer than this, only the tallest is kept.',
        },
      ],
    },
  ],
}

/**
 * Ladder fitting parameters. Keys are the engine's `LadderSpec` fields; the
 * nested scanning parameters are `scanning.<field>` (see
 * features/ladders/spec.ts for the conversion). Label, dye and base sizes are
 * edited separately by the ladder editor.
 */
export const ladderParams: ParamSchema = {
  id: 'ladder',
  title: 'Ladder fitting',
  sections: [
    {
      title: 'Sizing quality',
      description: 'Apply at once to every plate sized with this ladder.',
      fields: [
        {
          key: 'sq_flag_limit',
          kind: 'number',
          label: 'Flag above',
          unit: 'bp',
          default: 1,
          min: 0.01,
          step: 0.1,
          help:
            "Sizing quality is the largest leave-one-out error of the ladder fit: each ladder peak is left out in turn, the curve is rebuilt from the others, and the error at the left-out peak is measured. When a well's fit disagrees with its plate, the quality is at least how far a peak lies from where the plate's other wells put it. A clean ladder scores well under 0.5 bp; a mis-assigned peak scores about its displacement.\n\nWells above this limit are flagged for review.",
        },
        {
          key: 'sq_unusable_limit',
          kind: 'number',
          label: 'Unusable above',
          unit: 'bp',
          default: 2,
          min: 0.01,
          step: 0.5,
          help: 'Wells whose sizing quality (largest leave-one-out error) is above this are unusable and left out of analysis. On 3730 runs correct fits stay under 1 bp; wrong ones that pass every other check mostly score between 1 and 2.5 bp.',
          validate: (v, all) =>
            typeof v === 'number' && typeof all.sq_flag_limit === 'number' && v < all.sq_flag_limit ? 'Must be ≥ the flag limit' : null,
        },
        {
          key: 'base_size_precision',
          kind: 'number',
          label: 'Base size precision',
          unit: 'dp',
          default: 2,
          min: 0,
          max: 6,
          integer: true,
          help: 'Decimal places kept in the base size of each data point. 2 is plenty.',
        },
      ],
    },
    {
      title: 'Peak detection',
      description: 'Which ladder-channel peaks are candidates. Re-size plates to apply.',
      fields: [
        {
          key: 'min_time',
          kind: 'number',
          label: 'Min run time',
          unit: 'pts',
          default: 1200,
          min: 0,
          integer: true,
          step: 50,
          help: 'Peaks before this data point are ignored (primer peaks and dye blobs at the start of the run).',
        },
        {
          key: 'min_peak_height',
          kind: 'number',
          label: 'Min peak height',
          unit: 'RFU',
          default: 200,
          min: 0,
          integer: true,
          step: 50,
          help: 'Peaks at or below this height above the baseline are ignored (noise). A floor for weak ladders; the relative height below does the main work.',
        },
        {
          key: 'min_relative_height',
          kind: 'number',
          label: 'Min relative height',
          default: 0.25,
          min: 0,
          max: 0.99,
          step: 0.05,
          help: "Peaks below this fraction of the well's ladder height are ignored. The ladder height is the median of the tallest peaks, as many as the ladder has sizes. Follows each well's injection strength, so a weak series beside a strong ladder (crosstalk from a neighbouring capillary) is ignored while a weak ladder is kept. On 3730 runs the weakest ladder fragment of a well is above 0.6 of the ladder height in 99% of wells.",
        },
        {
          key: 'max_peak_height',
          kind: 'number',
          label: 'Max peak height',
          unit: 'RFU',
          default: 24000,
          min: 0,
          integer: true,
          step: 500,
          help: 'Peaks at or above this raw height are ignored (bleedthrough from strong signal in other dyes).',
          validate: (v, all) =>
            typeof v === 'number' && typeof all.min_peak_height === 'number' && v <= all.min_peak_height ? 'Must be above the min peak height' : null,
        },
        {
          key: 'index_overlap',
          kind: 'number',
          label: 'Min peak spacing',
          unit: 'pts',
          default: 5,
          min: 0,
          integer: true,
          help: 'Of two maxima closer than this many data points, the shorter is dropped: they are one peak. Keep it below the distance of a pull-up peak from the ladder peak beside it (8 to 15 points), so that matching can tell them apart by spacing.',
        },
        {
          key: 'allow_bleedthrough',
          kind: 'boolean',
          label: 'Allow bleedthrough peaks',
          default: true,
          help: 'When off, a peak is dropped if any other dye is at least as high at that point (pull-up from another channel). Turn off if bleedthrough peaks are taken as ladder peaks.',
        },
      ],
    },
    {
      title: 'Ladder-channel scanning',
      description: 'How peaks are found in the ladder trace. Re-size plates to apply.',
      fields: [
        {
          key: 'scanning.smoothing_window',
          kind: 'number',
          label: 'Smoothing window',
          unit: 'pts',
          default: 11,
          min: 3,
          integer: true,
          help: 'Window length of the Savitzky-Golay smoothing filter. Must be odd.',
          validate: (v) => (typeof v === 'number' && v % 2 === 0 ? 'Must be odd' : null),
        },
        {
          key: 'scanning.smoothing_order',
          kind: 'number',
          label: 'Smoothing order',
          default: 7,
          min: 0,
          integer: true,
          help: 'Polynomial order of the Savitzky-Golay filter. Must be less than the window.',
          validate: (v, all) =>
            typeof v === 'number' && typeof all['scanning.smoothing_window'] === 'number' && v >= all['scanning.smoothing_window']
              ? 'Must be less than the smoothing window'
              : null,
        },
        {
          key: 'scanning.relmax_window',
          kind: 'number',
          label: 'Relative maximum window',
          unit: 'pts',
          default: 6,
          min: 1,
          integer: true,
          help: 'Points on each side that a smoothed maximum must exceed to count as a peak.',
        },
        {
          key: 'scanning.maxima_window',
          kind: 'number',
          label: 'Maxima window',
          unit: 'pts',
          default: 10,
          min: 0,
          integer: true,
          help: 'Each maximum is snapped to the tallest raw point within this many points (total window).',
        },
        {
          key: 'scanning.tophat_factor',
          kind: 'number',
          label: 'Top-hat factor',
          default: 0.005,
          min: 0.0001,
          max: 0.9999,
          step: 0.001,
          help: 'Footprint of the white top-hat baseline filter as a fraction of the trace length.',
        },
      ],
    },
    {
      title: 'Matching',
      description: 'How candidates are matched to ladder sizes. Re-size plates to apply.',
      fields: [
        {
          key: 'maximum_missing_peak_count',
          kind: 'number',
          label: 'Max missing peaks',
          unit: 'peaks',
          default: 5,
          min: 0,
          integer: true,
          help: 'Most ladder sizes that may go unmatched before the fit fails. A fit always needs at least 4 matched peaks.',
        },
      ],
    },
  ],
}

/** Bin estimation (engine `BinParams`; help follows microspat_core::bins). */
export const binEstimatorParams: ParamSchema = {
  id: 'bin-estimator',
  title: 'Bin estimation',
  description:
    'Peak sizes of every run are pooled and clustered (mean shift, half a repeat wide). Each large enough cluster becomes a bin centered on its median size and labeled by that size rounded to whole bp. Re-analyzing replaces hand edits at the locus.',
  sections: [
    {
      fields: [
        {
          key: 'min_peak_frequency',
          kind: 'number',
          label: 'Min peak frequency',
          unit: 'peaks',
          default: 10,
          min: 1,
          integer: true,
          help: 'A cluster needs at least this many peaks to become a bin. Raise it to drop rare noise clusters; a rare true allele also needs few peaks, so check what disappears.',
        },
        {
          key: 'default_bin_buffer',
          kind: 'number',
          label: 'Default bin buffer',
          unit: 'bp',
          default: 0.75,
          min: 0,
          max: 49.9,
          step: 0.05,
          help: 'Half-width of new bins: peaks within center ± buffer are in the bin, within twice that they are shown as near it. 0 gives each bin its cluster’s standard deviation.',
        },
      ],
    },
  ],
}

/** Artifact estimation (engine `ArtifactParams`; help follows microspat_core::artifact). */
export const artifactEstimatorParams: ParamSchema = {
  id: 'artifact-estimator',
  title: 'Artifact estimation',
  description:
    'Only runs with a single dominant peak in a bin are used. Their other peaks are grouped by distance from that peak; each frequent distance becomes a class whose height relative to the parent is fit against the parent’s size. Re-analyzing replaces breakpoints, method changes and deleted classes at the locus.',
  sections: [
    {
      fields: [
        {
          key: 'max_secondary_relative_peak_height',
          kind: 'number',
          label: 'Max secondary rel. height',
          default: 0.4,
          min: 0,
          max: 1,
          step: 0.05,
          help: 'A run is used when exactly one peak reaches this height relative to the run’s tallest peak; every other peak is then read as an artifact of it. Lower it to keep out runs carrying a minor clone; raise it when too few runs qualify.',
        },
        {
          key: 'min_artifact_peak_frequency',
          kind: 'number',
          label: 'Min artifact peak frequency',
          unit: 'peaks',
          default: 10,
          min: 1,
          integer: true,
          help: 'Peaks (pooled over the runs used) a distance needs to become a class with its own equation. Peaks of smaller groups that sit in no bin go to the global class.',
        },
        {
          key: 'min_artifact_run_fraction',
          kind: 'number',
          label: 'Min run fraction',
          default: 0.5,
          min: 0,
          max: 1,
          step: 0.05,
          help: 'A class must also appear in at least this share of the runs whose main peak is tall enough to show it (0 turns the check off). An artifact comes with its parent whenever it can be seen; alleles of minor clones that stayed under the cut-off show at a fixed spacing only in the runs that carry that clone, and must not become classes. Runs too short for the class to clear the smallest peaks seen are not counted, so a weak artifact seen in every tall run is kept.',
        },
        {
          key: 'error_estimator',
          kind: 'select',
          label: 'Error estimate',
          default: 'densest_half',
          options: [
            { value: 'densest_half', label: 'Densest half' },
            { value: 'mad', label: 'Robust (MAD)' },
            { value: 'rms', label: 'RMS' },
          ],
          help: 'How the Theil–Sen, RANSAC and no-slope fits of distance classes estimate their SD, which sets how far above its expected artifact height a peak must be to be called. Densest half moves the line to the middle of the shortest band holding half the points and takes the SD from that half: minor alleles only ever add to a stutter position, so the true ratio is the low, dense part of the points, and they raise neither the line nor its SD. Robust MAD keeps the line and takes 1.4826 × the median absolute residual; RMS the root mean squared residual, which minor alleles inflate. Least-squares fits always use RMS; the global class always uses MAD.',
        },
        {
          key: 'seed',
          kind: 'number',
          label: 'RANSAC seed',
          default: 0,
          min: 0,
          integer: true,
          help: 'Seed of the random sampling in RANSAC fits, so the same data always gives the same line. Try another seed to see how stable a RANSAC fit is.',
        },
      ],
    },
  ],
}

/**
 * Bias estimation (engine `QuantBiasParams`). Help text follows
 * `microspat_core::quant_bias::estimate_beta`: which control peaks enter the
 * fit of logit(observed) − logit(true) against size offset.
 */
export const quantBiasParams: ParamSchema = {
  id: 'quant-bias',
  title: 'Quantification bias',
  description:
    'β is fitted per locus from the control mixtures: for every usable control peak, observed-minus-true log-odds of its share against its size offset from the mixture\'s center, by least squares through the origin. These limits decide which peaks are usable.',
  sections: [
    {
      fields: [
        {
          key: 'min_peak_height',
          kind: 'number',
          label: 'Min peak height',
          unit: 'RFU',
          default: 1000,
          min: 0,
          integer: true,
          step: 100,
          help: 'Control peaks at or below this height are not used: low peaks give noisy shares. A mixture needs at least two control peaks above it (and its usable peaks must account for the whole mixture), or it is left out.\nThis is separate from the peak filter\'s minimum height, which removes peaks before anything else.',
        },
        {
          key: 'min_true_proportion',
          kind: 'number',
          label: 'Min true proportion',
          default: 0.25,
          min: 0,
          max: 0.5,
          step: 0.05,
          help: 'Control alleles whose known share of the mixture is below this, or above 1 − this, are left out: log-odds of extreme shares are unstable. The bound is inclusive, so at 0.25 a 75/25 mixture counts and a 90/10 mixture does not.',
        },
        {
          key: 'offscale_threshold',
          kind: 'number',
          label: 'Off-scale threshold',
          unit: 'RFU',
          default: 32000,
          min: 0,
          integer: true,
          step: 500,
          help: 'A mixture with a control peak above this height is left out entirely: a saturated peak is clipped, so its height no longer tracks the amount of template. Also used to prefer a run that is not off-scale when a mixture has several.',
        },
      ],
    },
  ],
}

/**
 * Allele calling (engine `GenotypingParams`). Help text follows
 * `microspat_core::genotyping`: what flags a peak and when it is called.
 */
export const genotypingParams: ParamSchema = {
  id: 'genotyping',
  title: 'Calling',
  description:
    'A sample can carry any number of alleles at a locus. A peak is called when it sits inside a bin, carries no flag, and its height is not explained by artifacts (stutter) of the other peaks.',
  sections: [
    {
      title: 'Height limits',
      fields: [
        {
          key: 'absolute_peak_height_limit',
          kind: 'number',
          label: 'Min height above artifact',
          unit: 'RFU',
          default: 200,
          min: 0,
          step: 50,
          help: 'A peak is flagged as artifact when height − expected artifact − (hard SD limit × artifact error) is below this. Without an artifact model this is a plain minimum height.',
        },
        {
          key: 'relative_peak_height_limit',
          kind: 'number',
          label: 'Min relative height',
          default: 0.01,
          min: 0,
          max: 1,
          step: 0.01,
          help: 'Peaks lower than this fraction of the tallest peak of the run are flagged. Keep it low: minor clones can be a few percent of the major clone.',
        },
        {
          key: 'failure_threshold',
          kind: 'number',
          label: 'Failure threshold',
          unit: 'RFU',
          default: 500,
          min: 0,
          step: 50,
          help: 'At least one peak must be taller than this, otherwise the sample failed at this locus and nothing is called.',
        },
        {
          key: 'offscale_threshold',
          kind: 'number',
          label: 'Off-scale threshold',
          unit: 'RFU',
          default: 32000,
          min: 0,
          step: 500,
          help: 'Signal above this is saturated. Off-scale runs are avoided when choosing the reference run, and their proportions are unreliable. A peak is also flagged when a saturated other dye or neighbor sits under it and the peak is small enough beside it to be its leak.',
        },
      ],
    },
    {
      title: 'Pull-up and crosstalk',
      fields: [
        {
          key: 'measured_pullup',
          kind: 'boolean',
          label: 'Use measured plate pull-up',
          default: true,
          help: 'Test each peak against the pull-up measured from its plate\'s quality report for each dye pair. When on, positive pull-up is flagged within the SD limit below while clean plates keep true minor alleles under tall other-dye peaks; falls back to the fixed bleedthrough limit for unmeasured dye pairs, unchecked plates, and capillaries with unseparated dyes.',
        },
        {
          key: 'pullup_sd_limit',
          kind: 'number',
          label: 'Pull-up SD limit',
          unit: 'SD',
          default: 4,
          min: 0,
          step: 0.5,
          help: 'Standard deviations of the plate\'s measured pull-up spread added to the expected pull-up height when flagging a peak. Higher values reject more peaks sitting under tall peaks of other dyes.',
        },
        {
          key: 'bleedthrough_filter_limit',
          kind: 'number',
          label: 'Fallback bleedthrough limit',
          default: 5,
          min: 0,
          step: 0.1,
          help: 'Fallback bleedthrough ratio limit used when measured plate pull-up is turned off, a plate has no quality report, a dye pair was not measured on the plate, or a capillary\'s dyes are not separated. Pull-up is typically 1 to 4% of the other dye\'s peak and reaches 14% on some instruments.',
        },
        {
          key: 'crosstalk_filter_limit',
          kind: 'number',
          label: 'Crosstalk limit',
          default: 30,
          min: 0,
          step: 0.1,
          help: 'A peak is flagged as crosstalk when the same dye in a neighboring capillary is more than this many times its height. Crosstalk leaks about 1% of a neighbor\'s signal and 2.5 to 3% next to a saturated peak, so a low limit flags true alleles shared with a neighbor.',
        },
        {
          key: 'reject_spectral_breakdown',
          kind: 'boolean',
          label: 'Reject at spectral breakdown',
          default: false,
          help: 'Where another dye reads far below its baseline under a peak (more than a quarter of the signal there), the capillary\'s dyes were not separated: a fragment\'s signal shows in two dyes and either may be the true one. Such calls are always flagged; turn this on to also reject those peaks, which removes the copies and as many true alleles.',
        },
      ],
    },
    {
      title: 'Artifact model',
      fields: [
        {
          key: 'hard_artifact_sd_limit',
          kind: 'number',
          label: 'Hard artifact SD limit',
          unit: 'SD',
          default: 0,
          min: 0,
          step: 0.5,
          help: 'Artifact errors subtracted from a peak\'s height before the min-height test. Higher values reject more peaks that sit on stutter positions.',
        },
        {
          key: 'soft_artifact_sd_limit',
          kind: 'number',
          label: 'Soft artifact SD limit',
          unit: 'SD',
          default: 6,
          min: 0,
          step: 0.5,
          help: 'In the probabilistic pass, a peak more than this many artifact errors above its expected artifact height is called whatever its probability; closer peaks need the probability threshold.',
        },
      ],
    },
    {
      title: 'Probabilistic calling',
      fields: [
        {
          key: 'probability_threshold',
          kind: 'number',
          label: 'Probability threshold',
          default: 0.8,
          min: 0,
          max: 1,
          step: 0.01,
          help: 'In the probabilistic pass, a peak within the soft SD limit of its expected artifact height is called only when its probability of being a true allele reaches this.',
        },
        {
          key: 'bootstrap_probability_threshold',
          kind: 'number',
          label: 'Bootstrap threshold',
          default: 0.99,
          min: 0,
          max: 1,
          step: 0.01,
          help: 'Peaks below this probability are left out while estimating allele prevalence and each sample\'s MOI. A called allele below it does not count toward MOI.',
        },
      ],
    },
  ],
}

export const ALL_PARAM_SCHEMAS = [
  scanningParams,
  filterParams,
  ladderParams,
  binEstimatorParams,
  artifactEstimatorParams,
  quantBiasParams,
  genotypingParams,
]
