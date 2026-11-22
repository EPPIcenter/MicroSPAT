//! MicroSPAT core: pure, storage-free analysis of capillary electrophoresis
//! fragment data, built for samples that are mixtures of genomes.
//!
//! Pipeline: [`abif`] parses instrument files, [`ladder`] maps data points to
//! base pairs, [`peaks`] finds and annotates peaks, [`bins`] turns peak sizes
//! into alleles, [`artifact`] models stutter, [`quant_bias`] corrects allele
//! proportions, and [`genotyping`] calls alleles in mixtures. [`quality`]
//! measures each plate and capillary and lists what a lab should hear about.

pub mod types;

// Instrument data and signal handling.
#[cfg(feature = "signal")]
pub mod abif;
#[cfg(feature = "signal")]
pub mod ladder;
#[cfg(feature = "signal")]
pub mod peaks;
#[cfg(feature = "signal")]
pub mod plate;
#[cfg(feature = "signal")]
pub mod signal;
#[cfg(feature = "signal")]
pub mod synth;

// Calibration and genotyping.
#[cfg(feature = "calling")]
pub mod artifact;
#[cfg(feature = "calling")]
pub mod bins;
#[cfg(feature = "calling")]
pub mod genotyping;
#[cfg(feature = "calling")]
pub mod quant_bias;
// Needs both: measures traces, judges peaks with the calling rules.
#[cfg(all(feature = "signal", feature = "calling"))]
pub mod quality;
#[cfg(feature = "calling")]
pub mod stats;

pub use types::*;
