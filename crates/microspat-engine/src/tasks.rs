//! Background tasks.
//!
//! [`Engine::run_task`] runs the work on its own OS thread and blocks the
//! caller until it finishes, returning the work's result. Progress goes out as
//! `task` events while it runs. Because the work is not on the caller's
//! thread, it completes (and its events and `changed` notifications still go
//! out) even if the caller gives up, for example when an HTTP client
//! disconnects; adapters therefore need nothing task-specific. Heavy work
//! inside a task should use rayon for data parallelism.

use crate::error::{Result, RpcError};
use crate::events::{AppEvent, TaskInfo, TaskStatus};
use crate::Engine;
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Most finished tasks remembered for `list_tasks`.
const KEEP_FINISHED: usize = 20;
/// Minimum time between two progress events of one task.
const THROTTLE: Duration = Duration::from_millis(50);

/// Something that accepts progress reports (a task, or a slice of one).
pub trait Progress: Sync {
    /// `fraction` in 0..=1 of this scope; `message` describes the current step.
    fn report(&self, fraction: f64, message: &str);
}

/// Handle given to the work closure of a task.
pub struct TaskCtx {
    engine: Engine,
    info: Mutex<TaskInfo>,
    last_emit: Mutex<Option<Instant>>,
}

impl TaskCtx {
    /// The engine, for workspace access and `changed` events.
    pub fn engine(&self) -> &Engine {
        &self.engine
    }

    fn lock_info(&self) -> std::sync::MutexGuard<'_, TaskInfo> {
        self.info.lock().unwrap_or_else(|p| p.into_inner())
    }
}

impl Progress for TaskCtx {
    fn report(&self, fraction: f64, message: &str) {
        let now = Instant::now();
        let mut last = self.last_emit.lock().unwrap_or_else(|p| p.into_inner());
        let snapshot = {
            let mut info = self.lock_info();
            info.progress = Some(fraction.clamp(0.0, 1.0));
            info.message = Some(message.to_string());
            info.clone()
        };
        self.engine.inner.tasks.update(&snapshot);
        if last.is_some_and(|t| now.duration_since(t) < THROTTLE) {
            return;
        }
        *last = Some(now);
        self.engine.emit(AppEvent::Task { task: snapshot });
    }
}

/// A sub-range `start..start + span` of another progress sink.
pub struct Scaled<'a> {
    inner: &'a dyn Progress,
    start: f64,
    span: f64,
}

impl<'a> Scaled<'a> {
    /// Maps this scope's 0..=1 onto `start..start + span` of `inner`.
    pub fn new(inner: &'a dyn Progress, start: f64, span: f64) -> Self {
        Scaled { inner, start, span }
    }
}

impl Progress for Scaled<'_> {
    fn report(&self, fraction: f64, message: &str) {
        self.inner
            .report(self.start + self.span * fraction.clamp(0.0, 1.0), message);
    }
}

/// Progress sink that discards reports (work run outside a task).
pub struct NoProgress;

impl Progress for NoProgress {
    fn report(&self, _: f64, _: &str) {}
}

/// Running and recently finished tasks.
#[derive(Default)]
pub(crate) struct Tasks {
    next: AtomicU64,
    list: Mutex<BTreeMap<u64, TaskInfo>>,
}

impl Tasks {
    fn lock(&self) -> std::sync::MutexGuard<'_, BTreeMap<u64, TaskInfo>> {
        self.list.lock().unwrap_or_else(|p| p.into_inner())
    }

    fn update(&self, info: &TaskInfo) {
        let Some(n) = info.id.strip_prefix("task-").and_then(|s| s.parse().ok()) else {
            return;
        };
        let mut list = self.lock();
        list.insert(n, info.clone());
        let finished: Vec<u64> = list
            .iter()
            .filter(|(_, t)| t.status != TaskStatus::Running)
            .map(|(k, _)| *k)
            .collect();
        for k in finished
            .iter()
            .take(finished.len().saturating_sub(KEEP_FINISHED))
        {
            list.remove(k);
        }
    }

    pub(crate) fn snapshot(&self) -> Vec<TaskInfo> {
        self.lock().values().cloned().collect()
    }
}

impl Engine {
    /// Runs `work` as a background task named `label` and waits for its result.
    ///
    /// Emits `task` events: running (progress 0), throttled progress from
    /// [`Progress::report`], then done or failed (with the error message).
    pub fn run_task<R: Send + 'static>(
        &self,
        kind: &str,
        label: impl Into<String>,
        work: impl FnOnce(&TaskCtx) -> Result<R> + Send + 'static,
    ) -> Result<R> {
        let n = self.inner.tasks.next.fetch_add(1, Ordering::Relaxed) + 1;
        let info = TaskInfo {
            id: format!("task-{n}"),
            kind: kind.to_string(),
            label: label.into(),
            status: TaskStatus::Running,
            progress: Some(0.0),
            message: None,
        };
        self.inner.tasks.update(&info);
        self.emit(AppEvent::Task { task: info.clone() });
        let ctx = TaskCtx {
            engine: self.clone(),
            info: Mutex::new(info),
            last_emit: Mutex::new(None),
        };
        let (tx, rx) = std::sync::mpsc::channel();
        let spawned = std::thread::Builder::new()
            .name(format!("microspat-{kind}"))
            .spawn(move || {
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| work(&ctx)))
                    .unwrap_or_else(|panic| {
                        let what = panic
                            .downcast_ref::<String>()
                            .cloned()
                            .or_else(|| panic.downcast_ref::<&str>().map(|s| s.to_string()))
                            .unwrap_or_else(|| "unknown panic".into());
                        Err(RpcError::internal(format!("Task crashed: {what}")))
                    });
                let mut info = ctx.lock_info().clone();
                match &result {
                    Ok(_) => {
                        info.status = TaskStatus::Done;
                        info.progress = Some(1.0);
                        info.message = None;
                    }
                    Err(e) => {
                        info.status = TaskStatus::Failed;
                        info.message = Some(e.message.clone());
                    }
                }
                ctx.engine.inner.tasks.update(&info);
                ctx.engine.emit(AppEvent::Task { task: info });
                // The caller may be gone; the work is done either way.
                let _ = tx.send(result);
            })
            .map_err(|e| RpcError::internal(format!("Cannot start task: {e}")))?;
        let result = rx
            .recv()
            .unwrap_or_else(|_| Err(RpcError::internal("Task ended without a result")));
        let _ = spawned.join();
        result
    }
}
