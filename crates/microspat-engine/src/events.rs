//! The engine's event stream: task progress and data-changed notifications.
//!
//! Adapters call [`crate::Engine::subscribe`] once and forward every
//! [`AppEvent`] to the UI (SSE for HTTP, `microspat://event` for Tauri).
//! Delivery is a plain `std::sync::mpsc` channel per subscriber, so the
//! engine never blocks on a slow consumer and needs no async runtime.

use serde::Serialize;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Mutex;
use ts_rs::TS;

/// Entity names used in `changed` events. UI query keys start with these.
pub mod entity {
    /// Workspace identity and counts (`get_workspace_info`).
    pub const WORKSPACE: &str = "workspace";
    pub const LADDERS: &str = "ladders";
    pub const LOCI: &str = "loci";
    pub const LOCUS_SETS: &str = "locus_sets";
    pub const SAMPLES: &str = "samples";
    /// Plates, and everything under them: wells, channels, traces, runs, plate maps.
    pub const PLATES: &str = "plates";
    /// Analysis projects of every kind: parameters, samples, results, bins,
    /// artifact estimators, calls, and their staleness.
    pub const PROJECTS: &str = "projects";
    /// Controls (known strains) and their alleles.
    pub const CONTROLS: &str = "controls";
    /// Workspace settings (`get_settings`).
    pub const SETTINGS: &str = "settings";
    /// Entities counted in `get_workspace_info`; changing one also announces `workspace`.
    pub const COUNTED: &[&str] = &[PLATES, SAMPLES, LOCI, LOCUS_SETS, LADDERS];
    /// Entities project results are computed from: changing one may make
    /// results stale, so it also announces `projects`.
    pub const PROJECT_INPUTS: &[&str] = &[PLATES, SAMPLES, LOCI, LOCUS_SETS, LADDERS];
    /// Every entity; sent when a different workspace is opened.
    pub const ALL: &[&str] = &[
        WORKSPACE, LADDERS, LOCI, LOCUS_SETS, SAMPLES, PLATES, PROJECTS, CONTROLS, SETTINGS,
    ];
}

/// State of a background task.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Running,
    Done,
    Failed,
}

/// A background task as the task tray shows it.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
pub struct TaskInfo {
    pub id: String,
    /// Machine-readable kind, e.g. `import_plates`.
    pub kind: String,
    /// Human label, e.g. `Importing 3 plates`.
    pub label: String,
    pub status: TaskStatus,
    /// 0..=1, or null when indeterminate.
    pub progress: Option<f64>,
    /// Current step while running; the error when failed.
    pub message: Option<String>,
}

/// One event on the stream.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AppEvent {
    /// Progress or completion of a background task.
    Task { task: TaskInfo },
    /// Data of `entity` changed; `ids` are the affected ids when known.
    Changed {
        entity: String,
        ids: Option<Vec<i64>>,
    },
}

/// Fan-out of events to subscribers. Dropped receivers are pruned on send.
#[derive(Default)]
pub(crate) struct EventBus {
    subscribers: Mutex<Vec<Sender<AppEvent>>>,
}

impl EventBus {
    pub(crate) fn subscribe(&self) -> Receiver<AppEvent> {
        let (tx, rx) = channel();
        self.lock().push(tx);
        rx
    }

    pub(crate) fn emit(&self, event: AppEvent) {
        self.lock().retain(|s| s.send(event.clone()).is_ok());
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Vec<Sender<AppEvent>>> {
        // A panic while holding this lock cannot leave the Vec inconsistent.
        self.subscribers
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}
