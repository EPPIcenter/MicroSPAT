//! Seeded generator of synthetic FSA plates, for tests and demo data.
//!
//! Each well is a mixture of 1..=`max_clones` clones at unequal proportions;
//! each clone carries one allele per locus drawn from the locus's pool. The
//! signal model, per well:
//!
//! - **Migration**: fragment of `s` bp peaks at data point
//!   `a + b·s + c·s²` (mildly non-linear, jittered per capillary).
//! - **Peak shape**: a Gaussian core with a full width at half height of
//!   about 5 points at 50 bp to 6 at 400 bp, plus a low skirt (3% of the
//!   height, four times as wide), as on raw 3730 traces.
//! - **Ladder**: one peak per fragment, about 2,500–7,000 RFU.
//! - **Alleles**: peaks with height
//!   `locus_yield × clone_proportion × exp(−γ × (s − s_shortest))`, with
//!   `s_shortest` the shortest allele of the locus's pool and `γ` the
//!   locus's amplification bias (shorter fragments amplify more;
//!   [`LocusProfile`]). Saturated loci reach 40–80k RFU before clipping, so
//!   a few points clip, as on real traces.
//! - **Stutter**: per locus ([`LocusProfile`]), −1 repeat at a ratio that
//!   grows with allele length within the locus range, −2 and +1 repeat
//!   peaks, and at loci with heavy stutter a −3 repeat peak. Each stutter
//!   peak's ratio varies between runs by a log-normal factor with relative
//!   SD `stutter_cv` (0.2 by default; real stutter varies by roughly 15–30%
//!   between runs), so an artifact model fit to the data has realistic
//!   residuals.
//! - **Overlaps** ([`SynthSpec::study`] only): some alleles sit at ladder
//!   fragment sizes and some loci of different dyes share a size range, so
//!   bleedthrough has true alleles under it. [`SynthSpec::demo`] keeps every
//!   allele clear of the ladder and of the other dyes.
//! - **Crosstalk**: the same dye from capillaries 1, 2 and 3 positions away
//!   on the array, at 1.1%, 0.7% and 0.4% ([`CROSSTALK`]), rising to 2.8%
//!   next to a saturated peak ([`CROSSTALK_SATURATED`]).
//! - **Spectral fault** (optional, `spectral_fault_wells`): in these
//!   capillaries the dyes are not separated, so every blue peak also shows
//!   in green (at 109% of it) and as a dip in yellow (97%), at any height.
//! - **Raw baseline** ([`SynthSpec::baseline`], on in [`SynthSpec::demo`]
//!   and [`SynthSpec::study`], typical of raw 3730 data,
//!   [`SynthBaseline::raw_3730`]): a per-dye level of −80 to +60 RFU, a
//!   drift of −90 to +40 RFU over the run and a slow wave of up to 40 RFU;
//!   noise SD of 6–12.5 RFU by dye; signed spectral crosstalk at the same
//!   data point ([`spectral`]: pull-up of up to 4% and dips of up to 3% of
//!   the source, as wide as the source peak, so every ladder peak leaves a
//!   dip in yellow and blue); and a quarter of a saturated peak's excess
//!   over the instrument's maximum in the well's other sample dyes. It
//!   draws from its own random stream, so turning it on changes no truth.
//! - **Without it**: a fixed spectral-overlap matrix leaks a few percent of
//!   every dye into its spectral neighbors, a small baseline offset (5–40
//!   RFU) and drift (±5–25 RFU), and Gaussian noise (SD 6 RFU).
//! - **Primer blob** before the ladder, and clipping at 32767 with the
//!   clipped scans recorded as off-scale.
//! - **Failed wells**: either almost no signal (failed injection) or a run that
//!   stops early; **NTC** wells have a ladder and primer but no alleles.
//! - **Fixed wells** (optional) hold a given composition instead of a random
//!   one, e.g. control mixtures of known strains at known proportions. They
//!   draw from their own random stream, so adding them leaves every other well
//!   byte-identical.
//!
//! Everything derives from `seed`; the same spec always gives identical bytes.

use crate::abif::{dye_color, DyeChannel, Fsa, RunDateTime, RunTraces};
use crate::ladder::HD400_SIZES;
use crate::plate::{neighbor_wells, well_order, PlateSize, Well};
use crate::types::Color;
use rand::{RngExt, SeedableRng};
use rand_chacha::ChaCha8Rng;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Saturation level of the simulated instrument.
const SATURATION: f64 = 32_767.0;

/// A locus to simulate.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SynthLocus {
    pub label: String,
    pub color: Color,
    pub min_size: f64,
    pub max_size: f64,
    pub repeat_length: f64,
    /// Allele sizes (bp) clones draw from.
    pub alleles: Vec<f64>,
}

/// Description of a synthetic plate.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SynthSpec {
    pub seed: u64,
    pub plate_size: PlateSize,
    pub plate_name: String,
    /// Ladder fragment sizes (bp).
    pub ladder_sizes: Vec<f64>,
    pub ladder_color: Color,
    /// 4 (blue, green, yellow, red) or 5 (plus orange).
    pub dye_count: u8,
    pub loci: Vec<SynthLocus>,
    /// Each sample has 1..=max_clones clones.
    pub max_clones: usize,
    /// Smallest clone proportion relative to the major clone (e.g. 0.05).
    pub min_minor_ratio: f64,
    /// Fraction of sample wells that fail.
    pub failed_fraction: f64,
    /// Fraction of locus amplifications strong enough to saturate.
    pub saturated_fraction: f64,
    /// Wells holding no-template controls.
    pub ntc_wells: Vec<String>,
    /// Data points per trace.
    pub data_points: usize,
    /// Scale on each locus's amplification bias ([`LocusProfile::bias`]):
    /// 1 for typical, 0 for none.
    pub amp_bias: f64,
    /// Wells with a fixed composition (e.g. control mixtures).
    #[serde(default)]
    pub fixed_wells: Vec<FixedWell>,
    /// Relative SD of each stutter peak's ratio between runs (0: every run
    /// stutters exactly by the size rule).
    #[serde(default = "default_stutter_cv")]
    pub stutter_cv: f64,
    /// Raw-data artifacts typical of a 3730 in place of the small built-in
    /// baseline and positive pull-up; None (the serde default) keeps the
    /// clean traces.
    #[serde(default)]
    pub baseline: Option<SynthBaseline>,
    /// Capillaries (by the well run in them) whose dyes are not separated.
    #[serde(default)]
    pub spectral_fault_wells: Vec<String>,
}

/// Raw-data artifacts typical of an ABI 3730, drawn per well and dye: the
/// baseline's level, drift and wave, per-dye noise, signed spectral
/// crosstalk between dyes (pull-up and dips), and the large artifacts a
/// saturated peak leaves in the other dyes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SynthBaseline {
    /// Level range (RFU).
    pub offset: (f64, f64),
    /// Range of the change from the first to the last data point (RFU); a
    /// straight line, negative values fall.
    pub drift: (f64, f64),
    /// Amplitude range (RFU) of a slow wave with a period of 3,000–8,000 points.
    pub wave: (f64, f64),
    /// Noise SD (RFU) per dye: blue, green, yellow, red, orange.
    pub noise: [f64; 5],
    /// Scale on the typical spectral crosstalk between dyes ([`spectral`]):
    /// 1 for typical, 0 for none.
    pub spectral: f64,
    /// Fraction of a sample dye's signal above the instrument's maximum that
    /// appears at the same point in the well's other sample dyes (a tenth of
    /// it in the ladder dye).
    pub saturation_leak: f64,
    /// Pull-up of blue into green, as a fraction of the blue signal, when it
    /// differs from the typical 4% ([`spectral`]); some instruments reach 14%.
    #[serde(default)]
    pub blue_into_green: Option<f64>,
}

impl SynthBaseline {
    /// Typical of raw 3730 data: levels of −80 to +60 RFU, drift of −90 to
    /// +40 RFU over the run, a wave of up to 40 RFU (slopes up to about
    /// 8 RFU per 100 points), noise SD of 8 (blue), 12 (green), 12.5
    /// (yellow), 6 (red) and 8 (orange) RFU, the typical spectral crosstalk,
    /// and a quarter of a saturated peak's excess in the other dyes.
    pub fn raw_3730() -> Self {
        SynthBaseline {
            offset: (-80.0, 60.0),
            drift: (-90.0, 40.0),
            wave: (0.0, 40.0),
            noise: [8.0, 12.0, 12.5, 6.0, 8.0],
            spectral: 1.0,
            saturation_leak: 0.25,
            blue_into_green: None,
        }
    }

    /// Baseline of one dye over `n` points.
    fn draw(&self, n: usize, rng: &mut ChaCha8Rng) -> Vec<f64> {
        let mut range = |(lo, hi): (f64, f64)| {
            if hi > lo {
                rng.random_range(lo..hi)
            } else {
                lo
            }
        };
        let offset = range(self.offset);
        let drift = range(self.drift);
        let wave = range(self.wave);
        let period = range((3000.0, 8000.0));
        let phase = range((0.0, std::f64::consts::TAU));
        let last = (n.max(2) - 1) as f64;
        (0..n)
            .map(|i| {
                let x = i as f64;
                offset
                    + drift * x / last
                    + wave * (x / period * std::f64::consts::TAU + phase).sin()
            })
            .collect()
    }
}

/// Typical signed spectral crosstalk of a 3730: the fraction of dye
/// `source`'s signal that appears at the same data point in dye `target`
/// (0 blue, 1 green, 2 yellow, 3 red, 4 orange). Positive values are
/// pull-up, negative ones dips left by over-subtraction, as wide as the
/// source peak. Measured on raw traces the fractions run from about −5% to
/// +4% (one instrument's blue into green reached +14%); these are mid-range.
pub fn spectral(source: usize, target: usize) -> f64 {
    const M: [[f64; 5]; 5] = [
        // into: blue, green, yellow, red, orange
        [0.0, 0.04, -0.012, 0.005, 0.002],   // from blue
        [-0.012, 0.0, 0.015, -0.003, 0.002], // from green
        [0.010, -0.03, 0.0, 0.010, 0.002],   // from yellow
        [-0.012, 0.020, -0.03, 0.0, 0.010],  // from red
        [0.0, 0.005, -0.010, 0.020, 0.0],    // from orange
    ];
    M.get(source)
        .and_then(|r| r.get(target))
        .copied()
        .unwrap_or(0.0)
}

/// Same-dye signal leaking from capillaries 1, 2 and 3 positions away on the
/// array, as a fraction of the source (typical of raw 3730 traces: about
/// 1.1%, 0.7% and 0.4% above the level between unrelated wells).
pub const CROSSTALK: [f64; 3] = [0.011, 0.007, 0.004];

/// Leak from the next capillary where its signal is saturated, as a fraction
/// of that signal (2.5 to 3% on 3730 traces). It rises linearly from
/// [`CROSSTALK`]'s first value at half the saturation level.
pub const CROSSTALK_SATURATED: f64 = 0.028;

/// How a faulty capillary splits a blue fragment's signal over the sample
/// dyes (blue, green, yellow): a copy in green a little taller than the
/// original and a dip in yellow nearly as deep, as seen where a 3730's
/// spectral calibration is off for a capillary.
pub const SPECTRAL_FAULT: [f64; 3] = [1.0, 1.09, -0.97];

/// Stutter and amplification bias of one locus, typical of 3730 data and
/// different from locus to locus. Drawn from the locus label, so a locus
/// behaves the same on every plate of a study.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LocusProfile {
    /// −1 repeat stutter ratio at the middle of the locus range (3.5–20%);
    /// it runs from 0.6 to 1.4 times this across the range.
    pub minus_one: f64,
    /// −2 repeats (1–7%, at most half the −1 ratio).
    pub minus_two: f64,
    /// −3 repeats: a quarter of the −2 ratio where −1 is at least 15%, else 0.
    pub minus_three: f64,
    /// +1 repeat (1–5%).
    pub plus_one: f64,
    /// Amplification bias γ: signal falls as `exp(−γ · bp)` (β = 2γ of 0.05
    /// to 0.19 per bp), limited so that the longest allele of the pool keeps
    /// a quarter of the shortest's signal (real loci with the strongest bias
    /// span fewer repeats than these pools).
    pub bias: f64,
}

impl SynthLocus {
    /// The locus's stutter and bias ([`LocusProfile`]).
    pub fn profile(&self) -> LocusProfile {
        // FNV-1a of the label: a stable seed independent of the plate's.
        let seed = self.label.bytes().fold(0xcbf2_9ce4_8422_2325u64, |h, b| {
            (h ^ u64::from(b)).wrapping_mul(0x0100_0000_01b3)
        });
        let mut rng = ChaCha8Rng::seed_from_u64(seed);
        let minus_one = log_uniform(&mut rng, 0.035, 0.20);
        let minus_two = log_uniform(&mut rng, 0.01, 0.07).min(0.5 * minus_one);
        let plus_one = log_uniform(&mut rng, 0.01, 0.05);
        let minus_three = if minus_one >= 0.15 {
            0.25 * minus_two
        } else {
            0.0
        };
        let (lo, hi) = self
            .alleles
            .iter()
            .fold((f64::INFINITY, f64::NEG_INFINITY), |(a, b), &s| {
                (a.min(s), b.max(s))
            });
        let span = (hi - lo).max(self.repeat_length);
        let bias = (0.5 * rng.random_range(0.05f64..0.19)).min(4f64.ln() / span);
        LocusProfile {
            minus_one,
            minus_two,
            minus_three,
            plus_one,
            bias,
        }
    }

    fn shortest_allele(&self) -> f64 {
        self.alleles.iter().copied().fold(f64::INFINITY, f64::min)
    }
}

/// Run-to-run relative SD of stutter ratios (within the 15–30% seen on real data).
pub const DEFAULT_STUTTER_CV: f64 = 0.2;

fn default_stutter_cv() -> f64 {
    DEFAULT_STUTTER_CV
}

/// One clone of a fixed well.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SynthClone {
    /// Share of the template (normalized over the well's clones).
    pub proportion: f64,
    /// Allele size (bp) at each locus, in the order of `SynthSpec::loci`.
    pub alleles: Vec<f64>,
}

/// A well whose composition is given rather than drawn.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FixedWell {
    pub well: String,
    /// Sample name written into the FSA file.
    pub sample_name: String,
    pub clones: Vec<SynthClone>,
}

impl SynthSpec {
    /// A 96-well HD ROX 400 plate with six 3- and 4-bp loci over blue, green
    /// and yellow. Every allele sits at least 2.3 bp from every ladder
    /// fragment and the dyes' size ranges do not overlap; [`SynthSpec::study`]
    /// removes both comforts.
    pub fn demo(seed: u64) -> Self {
        let locus =
            |label: &str, color, min: f64, max: f64, repeat: f64, alleles: &[f64]| SynthLocus {
                label: label.into(),
                color,
                min_size: min,
                max_size: max,
                repeat_length: repeat,
                alleles: alleles.to_vec(),
            };
        SynthSpec {
            seed,
            plate_size: PlateSize::W96,
            plate_name: format!("SYNTH-{seed}"),
            ladder_sizes: HD400_SIZES.to_vec(),
            ladder_color: Color::Red,
            dye_count: 4,
            loci: vec![
                locus(
                    "PfB1",
                    Color::Blue,
                    70.0,
                    135.0,
                    3.0,
                    &[78.3, 84.3, 93.3, 105.3, 111.3, 117.3, 126.3],
                ),
                locus(
                    "PfB2",
                    Color::Blue,
                    230.0,
                    300.0,
                    4.0,
                    &[234.6, 246.6, 254.6, 266.6, 274.6, 286.6],
                ),
                locus(
                    "PfG1",
                    Color::Green,
                    135.0,
                    200.0,
                    3.0,
                    &[141.7, 147.7, 168.7, 174.7, 186.7, 195.7],
                ),
                locus(
                    "PfG2",
                    Color::Green,
                    300.0,
                    380.0,
                    4.0,
                    &[305.2, 313.2, 329.2, 349.2, 365.2, 373.2],
                ),
                locus(
                    "PfY1",
                    Color::Yellow,
                    200.0,
                    230.0,
                    3.0,
                    &[203.4, 206.4, 212.4, 215.4, 224.4],
                ),
                locus(
                    "PfY2",
                    Color::Yellow,
                    380.0,
                    450.0,
                    3.0,
                    &[384.4, 393.4, 405.4, 414.4, 423.4],
                ),
            ],
            max_clones: 4,
            min_minor_ratio: 0.05,
            failed_fraction: 0.04,
            saturated_fraction: 0.03,
            ntc_wells: vec!["H12".into()],
            data_points: 9000,
            amp_bias: 1.0,
            fixed_wells: Vec::new(),
            stutter_cv: DEFAULT_STUTTER_CV,
            baseline: Some(SynthBaseline::raw_3730()),
            spectral_fault_wells: Vec::new(),
        }
    }

    /// [`SynthSpec::demo`] with a harder panel, for accuracy studies: three
    /// loci gain an allele at a ladder fragment size (PfB1 120.3, PfG1 160.7,
    /// PfY2 400.4 bp against HD400's 120, 160 and 400), and two pairs of loci
    /// in different dyes share a size range with an allele each at nearly the
    /// same size (PfG1 extends down to 120 bp with 126.7 under PfB1's 126.3;
    /// PfB2 down to 215 bp with 224.6 under PfY1's 224.4). New alleles are
    /// appended to the pools, so pool indices of the demo's alleles still
    /// name the same sizes. Two capillaries (B05, G08) have a spectral fault,
    /// and blue pulls up into green at 14% (the strongest pull-up seen on
    /// 3730s), so pull-up of PfB1's alleles lands in PfG1's range.
    pub fn study(seed: u64) -> Self {
        let mut spec = SynthSpec::demo(seed);
        for l in &mut spec.loci {
            match l.label.as_str() {
                "PfB1" => l.alleles.push(120.3),
                "PfB2" => {
                    l.min_size = 215.0;
                    l.alleles.push(224.6);
                }
                "PfG1" => {
                    l.min_size = 120.0;
                    l.alleles.extend([160.7, 126.7]);
                }
                "PfY2" => l.alleles.push(400.4),
                _ => {}
            }
        }
        spec.spectral_fault_wells = vec!["B05".into(), "G08".into()];
        if let Some(b) = &mut spec.baseline {
            b.blue_into_green = Some(0.14);
        }
        spec
    }
}

/// Errors in a synthetic plate description.
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum SynthError {
    #[error("invalid synthetic plate spec: {0}")]
    InvalidSpec(String),
}

/// What a well is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WellKind {
    Sample,
    NoTemplateControl,
    /// Failed injection or run; no usable ladder.
    Failed,
}

/// Migration of one capillary: data point of a fragment of `s` bp is `a + b·s + c·s²`.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Mobility {
    pub a: f64,
    pub b: f64,
    pub c: f64,
}

impl Mobility {
    /// Data point (fractional) where a fragment of `size` bp peaks.
    pub fn index_of(&self, size: f64) -> f64 {
        self.a + self.b * size + self.c * size * size
    }

    /// True size (bp) at a data point; inverse of [`Mobility::index_of`].
    pub fn size_at(&self, index: f64) -> f64 {
        if self.c.abs() < 1e-15 {
            return (index - self.a) / self.b;
        }
        let disc = self.b * self.b - 4.0 * self.c * (self.a - index);
        (-self.b + disc.max(0.0).sqrt()) / (2.0 * self.c)
    }
}

/// One planted allele.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AlleleTruth {
    pub size: f64,
    /// Sum of the proportions of clones carrying this allele.
    pub proportion: f64,
    /// Planted apex height in RFU before noise and clipping.
    pub height: f64,
    /// True when the planted apex exceeds the instrument's range.
    pub saturated: bool,
}

/// Planted alleles at one locus.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LocusTruth {
    pub locus: String,
    pub alleles: Vec<AlleleTruth>,
}

/// Ground truth for one well.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WellTruth {
    pub well: String,
    pub sample_name: String,
    pub kind: WellKind,
    /// Clone proportions, largest first; empty for NTC and failed wells.
    pub clone_proportions: Vec<f64>,
    pub loci: Vec<LocusTruth>,
    pub mobility: Mobility,
    /// The well ran in a capillary whose dyes are not separated
    /// ([`SPECTRAL_FAULT`]).
    #[serde(default)]
    pub spectral_fault: bool,
}

/// A generated well: FSA bytes and the truth behind them.
#[derive(Debug, Clone, PartialEq)]
pub struct SynthWell {
    pub well: String,
    pub fsa: Vec<u8>,
    pub truth: WellTruth,
}

/// Amplification of an allele of `size` relative to the locus's shortest.
fn bias_factor(spec: &SynthSpec, l: &SynthLocus, size: f64) -> f64 {
    (-spec.amp_bias * l.profile().bias * (size - l.shortest_allele()).max(0.0)).exp()
}

fn dye_index(color: Color) -> usize {
    match color {
        Color::Blue => 0,
        Color::Green => 1,
        Color::Yellow => 2,
        Color::Red => 3,
        Color::Orange => 4,
    }
}

fn normal(rng: &mut ChaCha8Rng) -> f64 {
    let u1: f64 = rng.random::<f64>().max(1e-300);
    let u2: f64 = rng.random();
    (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos()
}

fn log_uniform(rng: &mut ChaCha8Rng, lo: f64, hi: f64) -> f64 {
    (lo.ln() + rng.random::<f64>() * (hi.ln() - lo.ln())).exp()
}

fn add_gaussian(trace: &mut [f64], center: f64, height: f64, sigma: f64) {
    let lo = (center - 6.0 * sigma).floor().max(0.0) as usize;
    let hi = ((center + 6.0 * sigma).ceil().max(0.0) as usize).min(trace.len());
    for (i, v) in trace.iter_mut().enumerate().take(hi).skip(lo) {
        let d = (i as f64 - center) / sigma;
        *v += height * (-0.5 * d * d).exp();
    }
}

/// Gaussian SD (points) of a peak's core: a full width at half height of
/// about 5 points at 50 bp to 6 at 400 bp, as on raw 3730 traces.
fn peak_sigma(size: f64) -> f64 {
    2.0 + size / 650.0
}

/// A peak of apex `height`: a Gaussian core and a wide, low skirt (3% of
/// the height, four times the width); real peaks have heavier shoulders
/// than a Gaussian.
fn add_peak(trace: &mut [f64], center: f64, height: f64, size: f64) {
    let sigma = peak_sigma(size);
    add_gaussian(trace, center, 0.97 * height, sigma);
    add_gaussian(trace, center, 0.03 * height, 4.0 * sigma);
}

/// Spectral overlap of clean traces (no raw baseline): fraction of dye
/// `j`'s light seen in dye `k`'s channel.
fn pull_up(k: usize, j: usize) -> f64 {
    match k.abs_diff(j) {
        0 => 0.0,
        1 => 0.03,
        2 => 0.008,
        _ => 0.002,
    }
}

impl SynthSpec {
    fn validate(&self) -> Result<(), SynthError> {
        let bad = |m: String| Err(SynthError::InvalidSpec(m));
        if !(4..=5).contains(&self.dye_count) {
            return bad(format!("dye_count must be 4 or 5, got {}", self.dye_count));
        }
        let max_dye = usize::from(self.dye_count);
        if dye_index(self.ladder_color) >= max_dye {
            return bad("ladder dye is not among the plate's dyes".into());
        }
        if self.ladder_sizes.len() < 2 || self.ladder_sizes.windows(2).any(|w| w[1] <= w[0]) {
            return bad("ladder sizes must be increasing".into());
        }
        for l in &self.loci {
            if dye_index(l.color) >= max_dye || l.color == self.ladder_color {
                return bad(format!(
                    "locus {} uses an unavailable or ladder dye",
                    l.label
                ));
            }
            if l.alleles.is_empty() || l.repeat_length <= 0.0 || l.min_size >= l.max_size {
                return bad(format!(
                    "locus {} needs alleles, a repeat length, and a size range",
                    l.label
                ));
            }
        }
        if self.max_clones == 0
            || !(0.0..=1.0).contains(&self.min_minor_ratio)
            || self.min_minor_ratio == 0.0
        {
            return bad("max_clones must be ≥ 1 and min_minor_ratio in (0, 1]".into());
        }
        if !(self.stutter_cv.is_finite() && self.stutter_cv >= 0.0) {
            return bad("stutter_cv must be a finite value ≥ 0".into());
        }
        if !(self.amp_bias.is_finite() && self.amp_bias >= 0.0) {
            return bad("amp_bias must be a finite value ≥ 0".into());
        }
        for w in &self.spectral_fault_wells {
            Well::parse_on(w, self.plate_size)
                .map_err(|e| SynthError::InvalidSpec(e.to_string()))?;
        }
        if let Some(b) = &self.baseline {
            let ordered = |(lo, hi): (f64, f64)| lo.is_finite() && hi.is_finite() && lo <= hi;
            let valid = ordered(b.offset)
                && ordered(b.drift)
                && ordered(b.wave)
                && b.noise.iter().all(|v| v.is_finite() && *v >= 0.0)
                && b.spectral.is_finite()
                && b.spectral >= 0.0
                && (0.0..=1.0).contains(&b.saturation_leak);
            if !valid {
                return bad(
                    "baseline ranges must be finite and ordered, noise and spectral finite and \
                     non-negative, and saturation_leak in [0, 1]"
                        .into(),
                );
            }
        }
        if self.data_points < 2000 {
            return bad("data_points must be at least 2000".into());
        }
        let last = self.ladder_sizes[self.ladder_sizes.len() - 1];
        let max_size = self.loci.iter().map(|l| l.max_size).fold(last, f64::max);
        if 1300.0 + 13.6 * max_size > self.data_points as f64 {
            return bad("data_points too few for the largest fragment".into());
        }
        for w in &self.ntc_wells {
            Well::parse_on(w, self.plate_size)
                .map_err(|e| SynthError::InvalidSpec(e.to_string()))?;
        }
        for f in &self.fixed_wells {
            Well::parse_on(&f.well, self.plate_size)
                .map_err(|e| SynthError::InvalidSpec(e.to_string()))?;
            if f.clones.is_empty()
                || f.clones.iter().any(|c| {
                    !(c.proportion.is_finite() && c.proportion > 0.0)
                        || c.alleles.len() != self.loci.len()
                })
            {
                return bad(format!(
                    "fixed well {} needs clones with a positive proportion and one allele per locus",
                    f.well
                ));
            }
        }
        Ok(())
    }
}

struct Plan {
    well: Well,
    label: String,
    truth: WellTruth,
    /// Truncate the run at this data point (failed run).
    stop_at: Option<usize>,
    /// Overall signal scale (failed injection).
    scale: f64,
}

/// Generates one FSA file and its truth per well, in row-major well order.
pub fn generate_plate(spec: &SynthSpec) -> Result<Vec<SynthWell>, SynthError> {
    spec.validate()?;
    let mut rng = ChaCha8Rng::seed_from_u64(spec.seed);
    let ntc: Vec<Well> = spec
        .ntc_wells
        .iter()
        .filter_map(|w| Well::parse(w).ok())
        .collect();
    let wells = well_order(spec.plate_size);
    let mut plans = Vec::with_capacity(wells.len());
    let mut sample_no = 0;
    for &well in &wells {
        let label = well.label();
        let mobility = Mobility {
            a: 1200.0 + 40.0 * normal(&mut rng),
            b: 13.5 * (1.0 + 0.02 * normal(&mut rng)),
            c: -0.004 * (1.0 + 0.05 * normal(&mut rng)),
        };
        let is_ntc = ntc.contains(&well);
        let failed = !is_ntc && rng.random_bool(spec.failed_fraction.clamp(0.0, 1.0));
        let kind = if is_ntc {
            WellKind::NoTemplateControl
        } else if failed {
            WellKind::Failed
        } else {
            WellKind::Sample
        };
        let mut proportions = Vec::new();
        let mut loci = Vec::new();
        if kind == WellKind::Sample {
            let k = rng.random_range(1..=spec.max_clones);
            let mut w: Vec<f64> = (0..k)
                .map(|i| {
                    if i == 0 {
                        1.0
                    } else {
                        log_uniform(&mut rng, spec.min_minor_ratio, 1.0)
                    }
                })
                .collect();
            let total: f64 = w.iter().sum();
            w.iter_mut().for_each(|v| *v /= total);
            w.sort_by(|a, b| b.total_cmp(a));
            proportions = w;
            for l in &spec.loci {
                let saturate = rng.random_bool(spec.saturated_fraction.clamp(0.0, 1.0));
                let yield_rfu = if saturate {
                    log_uniform(&mut rng, 40_000.0, 80_000.0)
                } else {
                    log_uniform(&mut rng, 2_000.0, 16_000.0)
                };
                let mut alleles: Vec<AlleleTruth> = Vec::new();
                for &p in &proportions {
                    let size = l.alleles[rng.random_range(0..l.alleles.len())];
                    match alleles.iter_mut().find(|a| a.size == size) {
                        Some(a) => a.proportion += p,
                        None => alleles.push(AlleleTruth {
                            size,
                            proportion: p,
                            height: 0.0,
                            saturated: false,
                        }),
                    }
                }
                for a in &mut alleles {
                    a.height = yield_rfu * a.proportion * bias_factor(spec, l, a.size);
                    a.saturated = a.height >= SATURATION;
                }
                alleles.sort_by(|a, b| a.size.total_cmp(&b.size));
                loci.push(LocusTruth {
                    locus: l.label.clone(),
                    alleles,
                });
            }
        }
        let (stop_at, scale) = if failed {
            if rng.random_bool(0.5) {
                (None, 0.01)
            } else {
                // Run stopped around the 150–180 bp ladder fragments.
                (
                    Some(mobility.index_of(rng.random_range(140.0..175.0)) as usize),
                    1.0,
                )
            }
        } else {
            (None, 1.0)
        };
        let sample_name = match kind {
            WellKind::NoTemplateControl => format!("NTC-{label}"),
            _ => {
                sample_no += 1;
                format!("S{sample_no:03}")
            }
        };
        let mut plan = Plan {
            well,
            label: label.clone(),
            truth: WellTruth {
                well: label,
                sample_name,
                kind,
                clone_proportions: proportions,
                loci,
                mobility,
                spectral_fault: spec
                    .spectral_fault_wells
                    .iter()
                    .any(|w| Well::parse(w).is_ok_and(|w| w == well)),
            },
            stop_at,
            scale,
        };
        if let Some(f) = spec
            .fixed_wells
            .iter()
            .find(|f| Well::parse(&f.well).is_ok_and(|w| w == well))
        {
            fix_well(spec, &mut plan, f, plans.len());
        }
        plans.push(plan);
    }

    let n_dyes = usize::from(spec.dye_count);
    let n = spec.data_points;
    // Pass 1: fluorescence per well and dye, before pull-up and noise.
    let clean: Vec<Vec<Vec<f64>>> = plans
        .iter()
        .enumerate()
        .map(|(wi, plan)| {
            let mut rng = ChaCha8Rng::seed_from_u64(
                spec.seed ^ (0x9E37_79B9_7F4A_7C15u64.wrapping_mul(wi as u64 + 1)),
            );
            clean_signal(spec, plan, n_dyes, n, &mut rng)
        })
        .collect();
    // Pass 2: pull-up within a well, crosstalk from neighboring capillaries.
    let index_of: HashMap<Well, usize> =
        plans.iter().enumerate().map(|(i, p)| (p.well, i)).collect();
    let ladder = dye_index(spec.ladder_color);
    let mut out = Vec::with_capacity(plans.len());
    for (wi, plan) in plans.iter().enumerate() {
        let mut rng = ChaCha8Rng::seed_from_u64(
            spec.seed
                .wrapping_add(0xD1B5_4A32_D192_ED03u64.wrapping_mul(wi as u64 + 7)),
        );
        // Neighbors on the capillary array with the fraction they leak.
        let mut neighbors: Vec<(usize, f64)> = Vec::new();
        let mut nearer: Vec<Well> = Vec::new();
        for (d, &f) in CROSSTALK.iter().enumerate() {
            let within = neighbor_wells(plan.well, spec.plate_size, d + 1).unwrap_or_default();
            for w in within.iter().filter(|w| !nearer.contains(w)) {
                if let Some(&i) = index_of.get(w) {
                    neighbors.push((i, f));
                }
            }
            nearer = within;
        }
        let mut channels: Vec<Vec<f64>> = (0..n_dyes)
            .map(|k| {
                let mut t = clean[wi][k].clone();
                for j in (0..n_dyes).filter(|&j| j != k) {
                    let f = match &spec.baseline {
                        Some(b) => match b.blue_into_green {
                            Some(f) if (j, k) == (0, 1) => f,
                            _ => b.spectral * spectral(j, k),
                        },
                        None => pull_up(k, j),
                    };
                    for (v, s) in t.iter_mut().zip(&clean[wi][j]) {
                        *v += f * s;
                    }
                    // A saturated sample-dye peak overflows the detector and
                    // the dye separation turns its excess into large peaks
                    // in the other dyes.
                    let leak = match &spec.baseline {
                        Some(b) if j != ladder => {
                            b.saturation_leak * if k == ladder { 0.1 } else { 1.0 }
                        }
                        _ => 0.0,
                    };
                    if leak > 0.0 {
                        for (v, s) in t.iter_mut().zip(&clean[wi][j]) {
                            *v += leak * (s - SATURATION).max(0.0);
                        }
                    }
                }
                for &(nb, f) in &neighbors {
                    let next = f == CROSSTALK[0];
                    for (v, s) in t.iter_mut().zip(&clean[nb][k]) {
                        *v += f * s;
                        if next {
                            let over = (s / (0.5 * SATURATION) - 1.0).clamp(0.0, 1.0);
                            *v += (CROSSTALK_SATURATED - f) * over * s;
                        }
                    }
                }
                if plan.truth.spectral_fault && k != 0 && k < SPECTRAL_FAULT.len() && k != ladder {
                    for (v, s) in t.iter_mut().zip(&clean[wi][0]) {
                        *v += SPECTRAL_FAULT[k] * s;
                    }
                }
                t
            })
            .collect();
        if let Some(b) = &spec.baseline {
            add_raw_baseline(b, &mut channels, spec.seed, wi);
        }
        let mut offscale = Vec::new();
        for (k, t) in channels.iter_mut().enumerate() {
            let offset = rng.random_range(5.0..40.0);
            let drift = rng.random_range(5.0..25.0);
            let period = rng.random_range(2500.0..6000.0);
            let phase = rng.random_range(0.0..std::f64::consts::TAU);
            // The raw baseline replaces the small built-in one; the draws
            // above are made either way so the noise stream is the same.
            let (offset, drift, sd) = match &spec.baseline {
                Some(b) => (0.0, 0.0, b.noise.get(k).copied().unwrap_or(6.0)),
                None => (offset, drift, 6.0),
            };
            for (i, v) in t.iter_mut().enumerate() {
                let x = i as f64;
                *v += offset
                    + drift * (x / period * std::f64::consts::TAU + phase).sin()
                    + sd * normal(&mut rng);
            }
        }
        if let Some(stop) = plan.stop_at {
            for t in channels.iter_mut() {
                for v in t.iter_mut().skip(stop) {
                    *v = 3.0 * normal(&mut rng);
                }
            }
        }
        let data: Vec<Vec<i16>> = channels
            .iter()
            .map(|t| {
                t.iter()
                    .enumerate()
                    .map(|(i, &v)| {
                        if v >= SATURATION {
                            offscale.push(i);
                        }
                        v.round().clamp(-32_768.0, SATURATION) as i16
                    })
                    .collect()
            })
            .collect();
        offscale.sort_unstable();
        offscale.dedup();
        let fsa = build_fsa(spec, plan, data, offscale, &mut rng);
        out.push(SynthWell {
            well: plan.label.clone(),
            fsa: fsa.to_bytes(),
            truth: plan.truth.clone(),
        });
    }
    Ok(out)
}

/// Adds the optional raw baseline, from its own random stream so that every
/// other draw is the same with or without it.
fn add_raw_baseline(b: &SynthBaseline, channels: &mut [Vec<f64>], seed: u64, well_index: usize) {
    let mut rng = ChaCha8Rng::seed_from_u64(
        seed ^ 0xBA5E_11E0_D1A5_0000 ^ (well_index as u64 + 1).wrapping_mul(0x9E37_79B9_7F4A_7C15),
    );
    for t in channels.iter_mut() {
        let n = t.len();
        for (v, base) in t.iter_mut().zip(b.draw(n, &mut rng)) {
            *v += base;
        }
    }
}

/// Replaces a drawn plan with a fixed composition, from its own random stream.
fn fix_well(spec: &SynthSpec, plan: &mut Plan, f: &FixedWell, index: usize) {
    let mut rng = ChaCha8Rng::seed_from_u64(
        spec.seed ^ 0x5EED_F1C5_D000_0000 ^ (index as u64).wrapping_mul(0x9E37_79B9),
    );
    let total: f64 = f.clones.iter().map(|c| c.proportion).sum();
    let mut proportions: Vec<f64> = f.clones.iter().map(|c| c.proportion / total).collect();
    let mut loci = Vec::new();
    for (k, l) in spec.loci.iter().enumerate() {
        // Controls are typed from well-quantified template.
        let yield_rfu = log_uniform(&mut rng, 8_000.0, 24_000.0);
        let mut alleles: Vec<AlleleTruth> = Vec::new();
        for c in &f.clones {
            let p = c.proportion / total;
            let size = c.alleles[k];
            match alleles.iter_mut().find(|a| a.size == size) {
                Some(a) => a.proportion += p,
                None => alleles.push(AlleleTruth {
                    size,
                    proportion: p,
                    height: 0.0,
                    saturated: false,
                }),
            }
        }
        for a in &mut alleles {
            a.height = yield_rfu * a.proportion * bias_factor(spec, l, a.size);
            a.saturated = a.height >= SATURATION;
        }
        alleles.sort_by(|a, b| a.size.total_cmp(&b.size));
        loci.push(LocusTruth {
            locus: l.label.clone(),
            alleles,
        });
    }
    proportions.sort_by(|a, b| b.total_cmp(a));
    plan.truth.kind = WellKind::Sample;
    plan.truth.sample_name = f.sample_name.clone();
    plan.truth.clone_proportions = proportions;
    plan.truth.loci = loci;
    plan.stop_at = None;
    plan.scale = 1.0;
}

fn clean_signal(
    spec: &SynthSpec,
    plan: &Plan,
    n_dyes: usize,
    n: usize,
    rng: &mut ChaCha8Rng,
) -> Vec<Vec<f64>> {
    let mut ch = vec![vec![0.0; n]; n_dyes];
    let mob = plan.truth.mobility;
    let ladder = dye_index(spec.ladder_color);
    let ladder_scale = rng.random_range(0.6..1.4);
    for &s in &spec.ladder_sizes {
        // Ladder peaks of raw 3730 runs are about 2,500–7,000 RFU.
        let h = 4500.0 * ladder_scale * rng.random_range(0.75..1.25);
        add_peak(&mut ch[ladder], mob.index_of(s), h, s);
    }
    // Unincorporated primer and dye blob, well before the ladder starts.
    let used: Vec<usize> = spec.loci.iter().map(|l| dye_index(l.color)).collect();
    for &k in &used {
        let height = rng.random_range(3_000.0..12_000.0);
        add_gaussian(
            &mut ch[k],
            rng.random_range(700.0..900.0),
            height,
            rng.random_range(40.0..80.0),
        );
        for _ in 0..3 {
            add_gaussian(
                &mut ch[k],
                rng.random_range(600.0..1000.0),
                height * 0.5,
                4.0,
            );
        }
    }
    if plan.truth.kind == WellKind::Sample {
        for (l, truth) in spec.loci.iter().zip(&plan.truth.loci) {
            let k = dye_index(l.color);
            let pr = l.profile();
            for a in &truth.alleles {
                let frac = ((a.size - l.min_size) / (l.max_size - l.min_size)).clamp(0.0, 1.0);
                let grow = 0.6 + 0.8 * frac;
                let peaks = [
                    (0.0, 1.0),
                    (-1.0, pr.minus_one * grow),
                    (-2.0, pr.minus_two * grow),
                    (-3.0, pr.minus_three * grow),
                    (1.0, pr.plus_one),
                ];
                for (shift, ratio) in peaks.into_iter().filter(|p| p.1 > 0.0) {
                    // Drawn last in the well's stream, so the ladder and
                    // primer of every well do not depend on `stutter_cv`; at
                    // 0 nothing is drawn and the plate is as before it existed.
                    let ratio = if shift != 0.0 && spec.stutter_cv > 0.0 {
                        let sigma = (1.0 + spec.stutter_cv * spec.stutter_cv).ln().sqrt();
                        ratio * (sigma * normal(rng) - 0.5 * sigma * sigma).exp()
                    } else {
                        ratio
                    };
                    let size = a.size + shift * l.repeat_length;
                    add_peak(&mut ch[k], mob.index_of(size), a.height * ratio, size);
                }
            }
        }
    }
    if plan.scale != 1.0 {
        for t in ch.iter_mut() {
            t.iter_mut().for_each(|v| *v *= plan.scale);
        }
    }
    ch
}

fn build_fsa(
    spec: &SynthSpec,
    plan: &Plan,
    data: Vec<Vec<i16>>,
    offscale: Vec<usize>,
    rng: &mut ChaCha8Rng,
) -> Fsa {
    let (names, waves): (&[&str], &[u16]) = if spec.dye_count == 5 {
        (
            &["6-FAM", "VIC", "NED", "PET", "LIZ"],
            &[522, 554, 575, 595, 655],
        )
    } else {
        (&["6-FAM", "HEX", "NED", "ROX"], &[522, 556, 575, 607])
    };
    let channels = data
        .into_iter()
        .enumerate()
        .map(|(k, d)| DyeChannel {
            dye_number: k as u8 + 1,
            color: dye_color(k as u8 + 1).unwrap_or(Color::Blue),
            dye_name: names.get(k).map(|s| s.to_string()),
            wavelength: waves.get(k).copied(),
            data: d,
        })
        .collect();
    let trace = |base: f64, amp: f64, rng: &mut ChaCha8Rng| -> Vec<i16> {
        (0..400)
            .map(|_| (base + amp * normal(rng)).round() as i16)
            .collect()
    };
    let day = (spec.seed % 28) as u8 + 1;
    Fsa {
        channels,
        sample_name: Some(plan.truth.sample_name.clone()),
        container_id: Some(format!("{}-ID", spec.plate_name)),
        container_name: Some(spec.plate_name.clone()),
        well: Some(plan.label.clone()),
        run_start: Some(RunDateTime {
            year: 2026,
            month: 3,
            day,
            hour: 9,
            minute: 30,
            second: 0,
        }),
        instrument_name: Some("SYNTH-3730xl".into()),
        instrument_model: Some("3730".into()),
        plate_size: Some(spec.plate_size.wells()),
        offscale_indices: offscale,
        run_traces: RunTraces {
            voltage: trace(1500.0, 3.0, rng),
            current: trace(220.0, 2.0, rng),
            power: trace(330.0, 2.0, rng),
            temperature: trace(60.0, 0.3, rng),
        },
        content_hash: String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::abif::parse_fsa;

    fn small_spec(seed: u64) -> SynthSpec {
        SynthSpec {
            data_points: 8000,
            ..SynthSpec::demo(seed)
        }
    }

    #[test]
    fn deterministic_for_a_seed() {
        let a = generate_plate(&small_spec(3)).unwrap();
        let b = generate_plate(&small_spec(3)).unwrap();
        let c = generate_plate(&small_spec(4)).unwrap();
        assert_eq!(a.len(), 96);
        assert_eq!(a[17].fsa, b[17].fsa);
        assert_ne!(a[17].fsa, c[17].fsa);
    }

    #[test]
    fn files_parse_with_expected_metadata() {
        let plate = generate_plate(&small_spec(5)).unwrap();
        let mut kinds = HashMap::new();
        for w in &plate {
            let f = parse_fsa(&w.fsa).unwrap();
            assert_eq!(f.well.as_deref(), Some(w.well.as_str()));
            assert_eq!(f.channels.len(), 4);
            assert_eq!(f.channels[3].color, Color::Red);
            assert_eq!(f.channels[0].data.len(), 8000);
            assert_eq!(f.plate_size, Some(96));
            assert_eq!(f.plate_label(), Some("SYNTH-5"));
            *kinds.entry(w.truth.kind).or_insert(0) += 1;
            for o in &f.offscale_indices {
                assert!(f.channels.iter().any(|c| c.data[*o] == i16::MAX));
            }
        }
        assert_eq!(kinds[&WellKind::NoTemplateControl], 1);
        assert!(kinds.get(&WellKind::Failed).copied().unwrap_or(0) >= 1);
        assert_eq!(
            plate.iter().find(|w| w.well == "H12").unwrap().truth.kind,
            WellKind::NoTemplateControl
        );
    }

    #[test]
    fn truth_reflects_mixtures() {
        let plate = generate_plate(&small_spec(9)).unwrap();
        let samples: Vec<&WellTruth> = plate
            .iter()
            .map(|w| &w.truth)
            .filter(|t| t.kind == WellKind::Sample)
            .collect();
        assert!(samples.iter().any(|t| t.clone_proportions.len() >= 3));
        for t in &samples {
            let total: f64 = t.clone_proportions.iter().sum();
            assert!((total - 1.0).abs() < 1e-9);
            assert!(t.clone_proportions.windows(2).all(|w| w[0] >= w[1]));
            for l in &t.loci {
                let p: f64 = l.alleles.iter().map(|a| a.proportion).sum();
                assert!((p - 1.0).abs() < 1e-9);
            }
            let m = t.mobility;
            assert!((m.size_at(m.index_of(123.4)) - 123.4).abs() < 1e-9);
        }
    }

    #[test]
    fn five_dye_and_384_plates() {
        let spec = SynthSpec {
            dye_count: 5,
            ladder_color: Color::Orange,
            plate_size: PlateSize::W384,
            ntc_wells: vec!["P24".into()],
            data_points: 8000,
            ..SynthSpec::demo(1)
        };
        let plate = generate_plate(&spec).unwrap();
        assert_eq!(plate.len(), 384);
        let f = parse_fsa(&plate[200].fsa).unwrap();
        assert_eq!(f.channels.len(), 5);
        assert_eq!(f.channels[4].dye_name.as_deref(), Some("LIZ"));
    }

    #[test]
    fn fixed_wells_keep_other_wells_identical() {
        let base = small_spec(11);
        let a = generate_plate(&base).unwrap();
        let spec = SynthSpec {
            fixed_wells: vec![FixedWell {
                well: "B03".into(),
                sample_name: "MIX-A".into(),
                clones: vec![
                    SynthClone {
                        proportion: 0.75,
                        alleles: base.loci.iter().map(|l| l.alleles[0]).collect(),
                    },
                    SynthClone {
                        proportion: 0.25,
                        alleles: base.loci.iter().map(|l| l.alleles[1]).collect(),
                    },
                ],
            }],
            ..base.clone()
        };
        let b = generate_plate(&spec).unwrap();
        let k = b.iter().position(|w| w.well == "B03").unwrap();
        let t = &b[k].truth;
        assert_eq!(t.sample_name, "MIX-A");
        assert_eq!(t.kind, WellKind::Sample);
        assert_eq!(t.clone_proportions, vec![0.75, 0.25]);
        assert_eq!(t.loci[0].alleles.len(), 2);
        assert!((t.loci[0].alleles[0].proportion - 0.75).abs() < 1e-12);
        // Neighbors pick up crosstalk from the changed well; the rest are untouched.
        let near: Vec<String> = neighbor_wells(Well::parse("B03").unwrap(), PlateSize::W96, 3)
            .unwrap()
            .iter()
            .map(|w| w.label())
            .collect();
        for (x, y) in a.iter().zip(&b) {
            if x.well != "B03" && !near.contains(&x.well) {
                assert_eq!(x.fsa, y.fsa, "{}", x.well);
            }
        }
        let mut bad = spec.clone();
        bad.fixed_wells[0].clones[0].alleles.pop();
        assert!(generate_plate(&bad).is_err());
    }

    /// Stutter ratios vary between runs by about `stutter_cv`; at 0 they
    /// follow the size rule exactly.
    #[test]
    fn stutter_varies_between_runs() {
        // One locus, one allele per well, no noise sources near it but the
        // baseline; measure the −1 repeat stutter ratio in each well.
        let mut base = SynthSpec {
            max_clones: 1,
            failed_fraction: 0.0,
            saturated_fraction: 0.0,
            data_points: 8000,
            baseline: None,
            ..SynthSpec::demo(21)
        };
        // One allele, so the size rule gives every run the same ratio.
        base.loci[3].alleles = vec![349.2];
        let ratios = |spec: &SynthSpec| -> Vec<f64> {
            let plate = generate_plate(spec).unwrap();
            let mut out = Vec::new();
            for w in plate.iter().filter(|w| w.truth.kind == WellKind::Sample) {
                let f = parse_fsa(&w.fsa).unwrap();
                let l = &spec.loci[3]; // PfG2, 300–380 bp, green
                let a = &w.truth.loci[3].alleles[0];
                if a.height < 4000.0 || a.saturated {
                    continue;
                }
                let m = w.truth.mobility;
                let at =
                    |size: f64| f64::from(f.channels[1].data[m.index_of(size).round() as usize]);
                out.push((at(a.size - l.repeat_length) - 20.0) / (at(a.size) - 20.0));
            }
            out
        };
        let cv = |v: &[f64]| crate::stats::std_dev(v) / crate::stats::mean(v);
        let fixed = ratios(&SynthSpec {
            stutter_cv: 0.0,
            ..base.clone()
        });
        let varied = ratios(&base);
        assert!(fixed.len() > 30 && varied.len() > 30);
        assert!(cv(&fixed) < 0.08, "{}", cv(&fixed));
        assert!((0.12..0.3).contains(&cv(&varied)), "{}", cv(&varied));
        let mut s = base.clone();
        s.stutter_cv = -0.1;
        assert!(generate_plate(&s).is_err());
    }

    /// The study panel puts alleles under ladder fragments and under another
    /// dye's alleles, so bleedthrough is tested against true alleles; the
    /// demo panel keeps its pool indices.
    #[test]
    fn study_panel_overlaps_ladder_and_other_dyes() {
        let spec = SynthSpec::study(1);
        for (l, d) in spec.loci.iter().zip(&SynthSpec::demo(1).loci) {
            assert_eq!(l.alleles[..d.alleles.len()], d.alleles[..]);
        }
        assert!(generate_plate(&spec).is_ok());
        let near = |a: f64, b: f64| (a - b).abs() < 1.0;
        let under_ladder = spec
            .loci
            .iter()
            .filter(|l| {
                l.alleles
                    .iter()
                    .any(|&a| spec.ladder_sizes.iter().any(|&f| near(a, f)))
            })
            .count();
        assert!(under_ladder >= 3);
        let mut cross = 0;
        for l in &spec.loci {
            for m in spec.loci.iter().filter(|m| m.color != l.color) {
                cross += l
                    .alleles
                    .iter()
                    .filter(|&&a| m.alleles.iter().any(|&b| near(a, b)))
                    .count();
            }
        }
        assert!(cross >= 4, "{cross}"); // two pairs, counted from both sides
    }

    #[test]
    fn rejects_bad_specs() {
        let mut s = SynthSpec::demo(1);
        s.dye_count = 6;
        assert!(generate_plate(&s).is_err());
        let mut s = SynthSpec::demo(1);
        s.loci[0].color = Color::Red;
        assert!(generate_plate(&s).is_err());
        let mut s = SynthSpec::demo(1);
        s.ladder_color = Color::Orange;
        assert!(generate_plate(&s).is_err());
        let mut s = SynthSpec::demo(1);
        s.ntc_wells = vec!["Q99".into()];
        assert!(generate_plate(&s).is_err());
    }

    /// Stutter and bias are a property of the locus: in the ranges typical
    /// of 3730 data, different between loci, the same on every plate.
    #[test]
    fn locus_profiles_are_typical_and_fixed_per_locus() {
        let spec = SynthSpec::study(3);
        let profiles: Vec<LocusProfile> = spec.loci.iter().map(SynthLocus::profile).collect();
        for (l, p) in spec.loci.iter().zip(&profiles) {
            assert!((0.035..=0.20).contains(&p.minus_one), "{p:?}");
            assert!((0.01..=0.07).contains(&p.minus_two) || p.minus_two == 0.5 * p.minus_one);
            assert!(p.minus_two <= 0.5 * p.minus_one);
            assert!((0.01..=0.05).contains(&p.plus_one));
            assert_eq!(p.minus_three > 0.0, p.minus_one >= 0.15);
            assert!(p.bias > 0.0 && p.bias <= 0.095);
            let span = l.alleles.iter().copied().fold(0.0, f64::max) - l.shortest_allele();
            assert!((-p.bias * span).exp() >= 0.25 - 1e-12);
            let other = SynthSpec::study(99);
            let same = other.loci.iter().find(|m| m.label == l.label).unwrap();
            assert_eq!(*p, same.profile());
        }
        let distinct: std::collections::BTreeSet<u64> =
            profiles.iter().map(|p| p.minus_one.to_bits()).collect();
        assert_eq!(distinct.len(), profiles.len());
    }

    /// In a faulty capillary every blue peak shows in green, taller, and as a
    /// dip in yellow; the ladder dye is left alone.
    #[test]
    fn spectral_fault_copies_blue_into_green_and_dips_yellow() {
        let mut spec = small_spec(5);
        spec.baseline = None;
        spec.failed_fraction = 0.0;
        spec.spectral_fault_wells = vec!["C03".into()];
        let wells = generate_plate(&spec).unwrap();
        let w = wells.iter().find(|w| w.well == "C03").unwrap();
        assert!(w.truth.spectral_fault);
        assert!(wells.iter().filter(|w| w.truth.spectral_fault).count() == 1);
        let fsa = crate::abif::parse_fsa(&w.fsa).unwrap();
        let ch = |c: Color| &fsa.channels.iter().find(|d| d.color == c).unwrap().data;
        let (blue, green, yellow) = (ch(Color::Blue), ch(Color::Green), ch(Color::Yellow));
        let apex = (2000..blue.len()).max_by_key(|&i| blue[i]).unwrap();
        let b = f64::from(blue[apex]);
        assert!(b > 1000.0, "{b}");
        assert!(f64::from(green[apex]) > 0.9 * b, "{} vs {b}", green[apex]);
        assert!(
            f64::from(yellow[apex]) < -0.8 * b,
            "{} vs {b}",
            yellow[apex]
        );
    }

    fn plate_hash(spec: &SynthSpec) -> String {
        let mut h = 0xcbf2_9ce4_8422_2325u64;
        for w in generate_plate(spec).unwrap() {
            for &b in &w.fsa {
                h ^= u64::from(b);
                h = h.wrapping_mul(0x0000_0100_0000_01b3);
            }
        }
        format!("{h:016x}")
    }

    /// Pins the demo and study plates: accuracy numbers and the demo
    /// workspace depend on their exact content.
    #[test]
    fn demo_and_study_plates_are_unchanged() {
        assert_eq!(
            [
                plate_hash(&SynthSpec::demo(1)),
                plate_hash(&SynthSpec::study(2)),
                plate_hash(&SynthSpec::demo(7)),
            ],
            ["182c3dcf2edd2b08", "bedd27ae0e5c1938", "e58f183e718a9ce2"]
        );
    }

    /// The raw baseline changes no truth, puts each trace's level within its
    /// range, leaves a dip in yellow at every ladder peak, and gives a
    /// saturated sample dye's neighbors large artifacts at the same point.
    #[test]
    fn raw_baseline_levels_dips_and_saturation() {
        let raw = SynthSpec {
            saturated_fraction: 0.3,
            ..small_spec(31)
        };
        let clean = SynthSpec {
            baseline: None,
            ..raw.clone()
        };
        let (a, b) = (
            generate_plate(&clean).unwrap(),
            generate_plate(&raw).unwrap(),
        );
        let (mut dips, mut ladder_peaks, mut leaks) = (0, 0, 0);
        for (x, y) in a.iter().zip(&b) {
            assert_eq!(x.truth, y.truth);
            if x.truth.kind != WellKind::Sample {
                continue;
            }
            let f = parse_fsa(&y.fsa).unwrap();
            let m = x.truth.mobility;
            // Level: the median of a quiet stretch past the last fragment.
            for c in &f.channels {
                let mut q: Vec<i16> = c.data[7400..7900].to_vec();
                q.sort_unstable();
                let level = f64::from(q[q.len() / 2]);
                assert!((-200.0..=130.0).contains(&level), "{} {level}", x.well);
            }
            for &s in &raw.ladder_sizes {
                let i = m.index_of(s).round() as usize;
                ladder_peaks += 1;
                let local: f64 = f64::from(f.channels[2].data[i - 60]);
                if f64::from(f.channels[2].data[i]) < local - 40.0 {
                    dips += 1;
                }
            }
            if !f.offscale_indices.is_empty() {
                for &o in &f.offscale_indices {
                    let others = (0..3).filter(|&k| f.channels[k].data[o] > 2000).count();
                    if others >= 2 {
                        leaks += 1;
                    }
                }
            }
        }
        assert!(dips * 10 > ladder_peaks * 8, "{dips} of {ladder_peaks}");
        assert!(leaks > 0);
        let mut bad = raw.clone();
        bad.baseline = Some(SynthBaseline {
            offset: (60.0, -80.0),
            ..SynthBaseline::raw_3730()
        });
        assert!(generate_plate(&bad).is_err());
        bad.baseline = Some(SynthBaseline {
            saturation_leak: 2.0,
            ..SynthBaseline::raw_3730()
        });
        assert!(generate_plate(&bad).is_err());
    }
}
