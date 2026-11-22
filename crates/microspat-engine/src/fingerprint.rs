//! Content fingerprints: stable 64-bit hashes of analysis inputs.
//!
//! Every stored project result records a fingerprint of each input it was
//! computed from (see `projects::inputs`). Staleness is then a comparison of
//! the recorded fingerprints with fingerprints of the current inputs, so it
//! needs no flags kept in step by every mutation, and re-applying an identical
//! plate map or setting a parameter back to its old value makes a result
//! current again.
//!
//! The hash is FNV-1a over an explicit byte encoding. Unlike `std`'s
//! `DefaultHasher` it is stable across Rust versions, which matters because
//! fingerprints are stored in the workspace file.

/// Incremental FNV-1a (64-bit) hasher with typed writers.
#[derive(Debug, Clone, Copy)]
pub struct Fingerprint(u64);

impl Default for Fingerprint {
    fn default() -> Self {
        Fingerprint(0xcbf2_9ce4_8422_2325)
    }
}

impl Fingerprint {
    /// A fresh hasher.
    pub fn new() -> Self {
        Self::default()
    }

    /// Adds raw bytes.
    pub fn bytes(&mut self, b: &[u8]) -> &mut Self {
        for &x in b {
            self.0 ^= u64::from(x);
            self.0 = self.0.wrapping_mul(0x0000_0100_0000_01b3);
        }
        self
    }

    /// Adds a string with its length, so concatenations cannot collide.
    pub fn str(&mut self, s: &str) -> &mut Self {
        self.u64(s.len() as u64).bytes(s.as_bytes())
    }

    /// Adds an integer.
    pub fn u64(&mut self, v: u64) -> &mut Self {
        self.bytes(&v.to_le_bytes())
    }

    /// Adds a signed integer.
    pub fn i64(&mut self, v: i64) -> &mut Self {
        self.bytes(&v.to_le_bytes())
    }

    /// Adds a float by its bit pattern (0.0 and -0.0 are the same value).
    pub fn f64(&mut self, v: f64) -> &mut Self {
        let v = if v == 0.0 { 0.0 } else { v };
        self.bytes(&v.to_bits().to_le_bytes())
    }

    /// Adds an optional value with a presence marker.
    pub fn opt_i64(&mut self, v: Option<i64>) -> &mut Self {
        match v {
            Some(x) => self.u64(1).i64(x),
            None => self.u64(0),
        }
    }

    /// Adds an optional float with a presence marker.
    pub fn opt_f64(&mut self, v: Option<f64>) -> &mut Self {
        match v {
            Some(x) => self.u64(1).f64(x),
            None => self.u64(0),
        }
    }

    /// The hash so far.
    pub fn finish(&self) -> u64 {
        self.0
    }

    /// The hash as 16 hex digits (the stored form).
    pub fn hex(&self) -> String {
        format!("{:016x}", self.0)
    }
}

/// Hex fingerprint of a JSON-serializable value (serialized once; serde_json
/// output is deterministic for structs and `preserve_order` maps).
///
/// It also hashes the peak measurement version
/// ([`microspat_core::peaks::MEASUREMENT_VERSION`]): every caller fingerprints
/// analysis parameters, and a result whose peaks an older version measured
/// (raw heights, say) must read as stale, not mix with new ones.
pub fn of_json<T: serde::Serialize>(v: &T) -> String {
    let s = serde_json::to_string(v).unwrap_or_default();
    Fingerprint::new()
        .str(&s)
        .u64(u64::from(microspat_core::peaks::MEASUREMENT_VERSION))
        .hex()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_and_discriminating() {
        // Pinned: stored fingerprints must not change between versions.
        assert_eq!(Fingerprint::new().str("abc").hex(), "c11ab6d2519bc2b2");
        let a = Fingerprint::new().str("ab").str("c").finish();
        let b = Fingerprint::new().str("a").str("bc").finish();
        assert_ne!(a, b);
        // Stored before measurement versions: same parameters, now stale.
        let unversioned = Fingerprint::new().str("{}").hex();
        assert_ne!(of_json(&serde_json::json!({})), unversioned);
        assert_eq!(
            Fingerprint::new().f64(0.0).finish(),
            Fingerprint::new().f64(-0.0).finish()
        );
    }
}
