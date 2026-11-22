//! Workspace settings stored in `meta`.

use crate::db;
use crate::error::{Result, RpcError};
use crate::events::entity::{PLATES, SAMPLES, SETTINGS};
use crate::rpc::Registry;
use crate::Engine;
use microspat_core::quality::QualityLimits;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Workspace settings.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
pub struct Settings {
    /// Negative controls with signal above this (RFU) flag their plate and locus as contaminated.
    pub contamination_limit: i64,
    /// Plate-quality thresholds and negative-control peak calling limit.
    pub quality_limits: QualityLimits,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            contamination_limit: db::DEFAULT_CONTAMINATION_LIMIT,
            quality_limits: QualityLimits::default(),
        }
    }
}

/// Partial update to [`QualityLimits`]. Omitted fields stay unchanged.
#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(default)]
pub struct UpdateQualityLimitsParams {
    #[ts(optional)]
    pub pull_up_warning: Option<f64>,
    #[ts(optional)]
    pub pull_up_problem: Option<f64>,
    #[ts(optional)]
    pub crosstalk_warning: Option<f64>,
    #[ts(optional)]
    pub crosstalk_problem: Option<f64>,
    #[ts(optional)]
    pub crosstalk_saturated_warning: Option<f64>,
    #[ts(optional)]
    pub crosstalk_saturated_problem: Option<f64>,
    #[ts(optional)]
    pub low_ladder_fraction: Option<f64>,
    #[ts(optional)]
    pub weak_signal_rfu: Option<f64>,
    #[ts(optional)]
    pub noisy_factor: Option<f64>,
    #[ts(optional)]
    pub unseparated_min_peaks: Option<u32>,
    #[ts(optional)]
    pub spectral_deviation_limit: Option<f64>,
    #[ts(optional)]
    pub ladder_fade_limit: Option<f64>,
    #[ts(optional)]
    pub weak_plate_fraction: Option<f64>,
    #[ts(optional)]
    pub saturation_info_fraction: Option<f64>,
    #[ts(optional)]
    pub control_height_limit: Option<f64>,
}

impl UpdateQualityLimitsParams {
    fn apply_to(&self, target: &mut QualityLimits) {
        if let Some(v) = self.pull_up_warning {
            target.pull_up_warning = v;
        }
        if let Some(v) = self.pull_up_problem {
            target.pull_up_problem = v;
        }
        if let Some(v) = self.crosstalk_warning {
            target.crosstalk_warning = v;
        }
        if let Some(v) = self.crosstalk_problem {
            target.crosstalk_problem = v;
        }
        if let Some(v) = self.crosstalk_saturated_warning {
            target.crosstalk_saturated_warning = v;
        }
        if let Some(v) = self.crosstalk_saturated_problem {
            target.crosstalk_saturated_problem = v;
        }
        if let Some(v) = self.low_ladder_fraction {
            target.low_ladder_fraction = v;
        }
        if let Some(v) = self.weak_signal_rfu {
            target.weak_signal_rfu = v;
        }
        if let Some(v) = self.noisy_factor {
            target.noisy_factor = v;
        }
        if let Some(v) = self.unseparated_min_peaks {
            target.unseparated_min_peaks = v;
        }
        if let Some(v) = self.spectral_deviation_limit {
            target.spectral_deviation_limit = v;
        }
        if let Some(v) = self.ladder_fade_limit {
            target.ladder_fade_limit = v;
        }
        if let Some(v) = self.weak_plate_fraction {
            target.weak_plate_fraction = v;
        }
        if let Some(v) = self.saturation_info_fraction {
            target.saturation_info_fraction = v;
        }
        if let Some(v) = self.control_height_limit {
            target.control_height_limit = v;
        }
    }
}

/// Params of `update_settings`. Omitted fields are unchanged.
#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(default)]
pub struct UpdateSettingsParams {
    #[ts(optional)]
    pub contamination_limit: Option<i64>,
    #[ts(optional)]
    pub quality_limits: Option<UpdateQualityLimitsParams>,
    /// Reset every setting to its default before applying any other fields.
    #[ts(optional)]
    pub reset_defaults: Option<bool>,
}

pub(crate) fn register(r: &mut Registry) {
    r.query("get_settings", "Workspace settings.", get);
    r.mutation(
        "update_settings",
        &[SETTINGS, PLATES, SAMPLES],
        "Change workspace settings. Limits apply at once to plate reports and sample views.",
        update,
    );
}

fn load(c: &rusqlite::Connection) -> Result<Settings> {
    Ok(Settings {
        contamination_limit: db::contamination_limit(c)?,
        quality_limits: db::quality_limits(c)?,
    })
}

fn get(e: &Engine, _: ()) -> Result<Settings> {
    e.workspace()?.read(load)
}

fn update(e: &Engine, p: UpdateSettingsParams) -> Result<Settings> {
    let ws = e.workspace()?;
    let (old, saved) = ws.write(|tx| {
        let old = load(tx)?;
        let mut next = if p.reset_defaults == Some(true) {
            Settings::default()
        } else {
            old.clone()
        };
        if let Some(v) = p.contamination_limit {
            next.contamination_limit = v;
        }
        if let Some(q) = &p.quality_limits {
            q.apply_to(&mut next.quality_limits);
        }

        if !(0..=100_000).contains(&next.contamination_limit) {
            return Err(RpcError::invalid(
                "The contamination limit must be between 0 and 100,000 RFU.",
            ));
        }
        next.quality_limits.validate().map_err(RpcError::invalid)?;

        tx.execute(
            "INSERT INTO meta (key, value) VALUES ('contamination_limit', ?1)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value",
            [next.contamination_limit.to_string()],
        )?;
        if next.quality_limits == QualityLimits::default() {
            tx.execute("DELETE FROM meta WHERE key = 'quality_limits'", [])?;
        } else {
            let json = serde_json::to_string(&next.quality_limits)?;
            tx.execute(
                "INSERT INTO meta (key, value) VALUES ('quality_limits', ?1)
                 ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                [json],
            )?;
        }
        let saved = load(tx)?;
        Ok((old, saved))
    })?;

    if saved.quality_limits != old.quality_limits {
        let rescan_controls = (saved.quality_limits.control_height_limit
            - old.quality_limits.control_height_limit)
            .abs()
            > f64::EPSILON
            || saved.quality_limits.unseparated_min_peaks
                != old.quality_limits.unseparated_min_peaks
            || (saved.quality_limits.spectral_deviation_limit
                - old.quality_limits.spectral_deviation_limit)
                .abs()
                > f64::EPSILON;
        crate::quality::refresh_for_limits(&ws, &saved.quality_limits, rescan_controls)?;
    }

    e.changed(SETTINGS, None);
    let contam_changed =
        saved.contamination_limit != old.contamination_limit || p.contamination_limit.is_some();
    if contam_changed {
        e.changed(PLATES, None);
        e.changed(SAMPLES, None);
    } else if saved.quality_limits != old.quality_limits {
        e.changed(PLATES, None);
    }
    Ok(saved)
}
