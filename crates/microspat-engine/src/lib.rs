//! MicroSPAT engine: the workspace file, the services over it, and one
//! transport-agnostic RPC surface with an event stream.
//!
//! ```text
//! adapter (HTTP / Tauri)
//!     │  dispatch(method, JSON) -> JSON | RpcError        subscribe() -> events
//!     ▼
//! Engine ── Registry (rpc.rs): name → typed handler fn(&Engine, P) -> Result<R>
//!     │        handlers live in api/*.rs, one module per entity
//!     ├── Workspace (db/): one SQLite file, writer + reader pool, migrations
//!     ├── EventBus (events.rs): `task` and `changed` events
//!     └── Tasks (tasks.rs): background work with progress
//! ```
//!
//! Analysis itself lives in `microspat_core`; this crate stores its inputs
//! and outputs and orchestrates it (rayon over wells and channels).

pub mod api;
pub mod bindings;
pub mod codec;
pub mod db;
pub mod error;
pub mod events;
pub mod fingerprint;
pub mod locus_runs;
pub mod peak_codec;
pub mod projects;
pub mod quality;
pub mod rpc;
pub mod scan_cache;
pub mod sizing;
pub mod tasks;

pub use db::Workspace;
pub use error::{ErrorCode, Result, RpcError};
pub use events::{entity, AppEvent, TaskInfo, TaskStatus};
pub use rpc::{MethodInfo, MethodKind, Registry};
pub use tasks::{Progress, TaskCtx};

use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

/// Version of this build, reported by `get_workspace_info`.
pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

/// File extension of workspace files (without the dot).
pub const WORKSPACE_EXTENSION: &str = "microspat";

/// Settings an adapter provides.
#[derive(Debug, Clone, Default)]
pub struct EngineConfig {
    /// Where to keep per-user state (the recent-workspaces list). None: not kept.
    pub state_dir: Option<PathBuf>,
}

/// The engine. Cheap to clone; share one per process.
#[derive(Clone)]
pub struct Engine {
    pub(crate) inner: Arc<Inner>,
}

pub(crate) struct Inner {
    registry: Registry,
    workspace: RwLock<Option<Arc<Workspace>>>,
    events: events::EventBus,
    pub(crate) tasks: tasks::Tasks,
    pub(crate) config: EngineConfig,
    scans: scan_cache::ScanCache,
}

impl Engine {
    /// An engine with no workspace open.
    pub fn new(config: EngineConfig) -> Engine {
        let mut registry = Registry::default();
        api::register(&mut registry);
        Engine {
            inner: Arc::new(Inner {
                registry,
                workspace: RwLock::new(None),
                events: Default::default(),
                tasks: Default::default(),
                config,
                scans: Default::default(),
            }),
        }
    }

    /// Calls `method` with JSON `params` (`null` for none) and returns its JSON result.
    pub fn dispatch(&self, method: &str, params: Value) -> Result<Value> {
        self.inner.registry.call(self, method, params)
    }

    /// Subscribes to all future events. Drop the receiver to unsubscribe.
    pub fn subscribe(&self) -> std::sync::mpsc::Receiver<AppEvent> {
        self.inner.events.subscribe()
    }

    /// The method registry (names, docs, types), e.g. for code generation.
    pub fn registry(&self) -> &Registry {
        &self.inner.registry
    }

    /// The open workspace, or a `no_workspace` error.
    pub fn workspace(&self) -> Result<Arc<Workspace>> {
        self.inner
            .workspace
            .read()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
            .ok_or_else(|| {
                RpcError::new(
                    ErrorCode::NoWorkspace,
                    "No workspace is open. Create or open one first.",
                )
            })
    }

    /// True when a workspace is open.
    pub fn has_workspace(&self) -> bool {
        self.workspace().is_ok()
    }

    /// Opens `path` if it exists, otherwise creates it. Used by adapters at startup.
    pub fn open_or_create(&self, path: &Path) -> Result<()> {
        let ws = if path.exists() {
            Workspace::open(path)?
        } else {
            Workspace::create(path, false)?
        };
        self.set_workspace(ws);
        Ok(())
    }

    /// Creates an untitled workspace in the temp directory.
    pub fn create_untitled(&self) -> Result<()> {
        let ws = Workspace::create(&api::workspace::untitled_path()?, true)?;
        self.set_workspace(ws);
        Ok(())
    }

    /// Closes the open workspace (call on shutdown). The file is left as one
    /// self-contained database once any task still using it finishes.
    pub fn close_workspace(&self) {
        let old = self
            .inner
            .workspace
            .write()
            .unwrap_or_else(|p| p.into_inner())
            .take();
        drop(old);
    }

    /// Makes `ws` the open workspace and tells the UI that everything changed.
    pub(crate) fn set_workspace(&self, ws: Workspace) {
        if !ws.is_untitled() {
            api::workspace::remember_recent(self, ws.path());
        }
        let old = self
            .inner
            .workspace
            .write()
            .unwrap_or_else(|p| p.into_inner())
            .replace(Arc::new(ws));
        // Close the previous file (unless a task still holds it) outside the lock.
        drop(old);
        for e in entity::ALL {
            self.changed(e, None);
        }
    }

    /// The process-wide cache of scanned peaks (see `scan_cache`).
    pub fn scan_cache(&self) -> &scan_cache::ScanCache {
        &self.inner.scans
    }

    /// Emits an event to every subscriber.
    pub fn emit(&self, event: AppEvent) {
        self.inner.events.emit(event);
    }

    /// Emits `changed` for `entity`; `ids` are the affected ids when known.
    pub fn changed(&self, entity: &str, ids: Option<Vec<i64>>) {
        self.emit(AppEvent::Changed {
            entity: entity.to_string(),
            ids,
        });
    }
}
