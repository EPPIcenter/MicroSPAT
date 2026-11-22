//! Workspace lifecycle (new, open, save as, recent), info, tasks, and file writes.

use crate::db::{self, Workspace};
use crate::error::{io_err, Result, RpcError};
use crate::events::{entity, TaskInfo};
use crate::rpc::Registry;
use crate::{Engine, APP_VERSION, WORKSPACE_EXTENSION};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use ts_rs::TS;

/// Most recent workspaces remembered.
const MAX_RECENT: usize = 10;

/// What is in the workspace, for the workspace menu.
#[derive(Debug, Clone, Default, Serialize, TS)]
pub struct WorkspaceCounts {
    pub plates: u32,
    pub samples: u32,
    pub loci: u32,
    pub locus_sets: u32,
    pub ladders: u32,
}

/// The open workspace.
#[derive(Debug, Clone, Serialize, TS)]
pub struct WorkspaceInfo {
    /// Absolute path of the file, or null for an untitled workspace.
    pub path: Option<String>,
    pub name: String,
    pub counts: WorkspaceCounts,
    pub schema_version: i64,
    pub app_version: String,
    /// Size of the file in bytes.
    pub file_size: u64,
}

/// Params of `new_workspace`.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct NewWorkspaceParams {
    /// Where to create it (`.microspat` is appended if missing); null for an untitled workspace.
    #[serde(default)]
    #[ts(optional = nullable)]
    pub path: Option<String>,
}

/// Params of methods that take a file path.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct PathParams {
    pub path: String,
}

/// Params of `write_text_file`.
#[derive(Debug, Clone, Deserialize, TS)]
pub struct WriteTextFileParams {
    pub path: String,
    pub content: String,
}

/// A recently used workspace.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct RecentWorkspace {
    pub path: String,
    pub name: String,
    /// False when the file has since been moved or deleted.
    pub exists: bool,
}

pub(crate) fn register(r: &mut Registry) {
    r.query(
        "get_workspace_info",
        "Path, name, counts, schema and app version of the open workspace.",
        info,
    );
    r.mutation(
        "new_workspace",
        entity::ALL,
        "Create and open a new workspace (seeded with standard ladders). Without a path it is untitled until saved.",
        new_workspace,
    );
    r.mutation(
        "open_workspace",
        entity::ALL,
        "Open an existing workspace file.",
        open_workspace,
    );
    r.mutation(
        "save_workspace_as",
        entity::ALL,
        "Write a compact standalone copy of the workspace to a path and continue working in the copy.",
        save_as,
    );
    r.query(
        "list_recent_workspaces",
        "Recently opened workspaces, newest first.",
        recent,
    );
    r.query(
        "list_tasks",
        "Running and recently finished background tasks.",
        list_tasks,
    );
    r.mutation(
        "write_text_file",
        &[],
        "Write text to a file (used by the desktop app to save exports).",
        write_text_file,
    );
    r.task(
        "load_demo_data",
        &[entity::PLATES, entity::SAMPLES, entity::LOCI, entity::LOCUS_SETS, entity::LADDERS, entity::PROJECTS, entity::CONTROLS],
        "Generate a synthetic study (three plates, six loci, a locus set, plate maps) and import it through the normal import path, then build and analyze its projects: bin and artifact estimators, controls, a quantification-bias estimator from control mixtures, and a genotyping project with peak probabilities.",
        super::demo::load_demo_data,
    );
}

/// Info about an open workspace.
pub fn workspace_info(ws: &Workspace) -> Result<WorkspaceInfo> {
    ws.read(|c| {
        let count = |table: &str| -> Result<u32> {
            Ok(c.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))?)
        };
        Ok(WorkspaceInfo {
            path: (!ws.is_untitled()).then(|| ws.path().display().to_string()),
            name: ws.name(),
            counts: WorkspaceCounts {
                plates: count("plate")?,
                samples: count("sample")?,
                loci: count("locus")?,
                locus_sets: count("locus_set")?,
                ladders: count("ladder")?,
            },
            schema_version: db::schema_version(c)?,
            app_version: APP_VERSION.to_string(),
            file_size: ws.file_size(),
        })
    })
}

fn info(e: &Engine, _: ()) -> Result<WorkspaceInfo> {
    workspace_info(&*e.workspace()?)
}

/// A fresh path for an untitled workspace in the temp directory.
pub(crate) fn untitled_path() -> Result<PathBuf> {
    let dir = std::env::temp_dir().join("microspat-untitled");
    std::fs::create_dir_all(&dir).map_err(|e| io_err(&dir, e))?;
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos());
    // The clock is only microsecond-precise on macOS, so two engines in one
    // process (parallel tests) could otherwise get the same file.
    static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let seq = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    Ok(dir.join(format!(
        "untitled-{}-{nanos}-{seq}.{WORKSPACE_EXTENSION}",
        std::process::id()
    )))
}

fn with_extension(path: &str) -> Result<PathBuf> {
    let t = path.trim();
    if t.is_empty() {
        return Err(RpcError::invalid("The workspace path is empty."));
    }
    let p = PathBuf::from(t);
    Ok(
        if p.extension()
            .is_some_and(|e| e.eq_ignore_ascii_case(WORKSPACE_EXTENSION))
        {
            p
        } else {
            let mut s = p.into_os_string();
            s.push(format!(".{WORKSPACE_EXTENSION}"));
            PathBuf::from(s)
        },
    )
}

fn new_workspace(e: &Engine, p: NewWorkspaceParams) -> Result<WorkspaceInfo> {
    match p.path {
        Some(path) => {
            let ws = Workspace::create(&with_extension(&path)?, false)?;
            e.set_workspace(ws);
        }
        None => e.create_untitled()?,
    }
    info(e, ())
}

fn open_workspace(e: &Engine, p: PathParams) -> Result<WorkspaceInfo> {
    let ws = Workspace::open(Path::new(&p.path))?;
    e.set_workspace(ws);
    info(e, ())
}

fn save_as(e: &Engine, p: PathParams) -> Result<WorkspaceInfo> {
    let current = e.workspace()?;
    let dest = with_extension(&p.path)?;
    if !current.is_untitled() && same_file(current.path(), &dest) {
        return info(e, ());
    }
    current.save_copy(&dest)?;
    let old_untitled = current.is_untitled().then(|| current.path().to_path_buf());
    drop(current);
    e.set_workspace(Workspace::open(&dest)?);
    if let Some(old) = old_untitled {
        // Saved under a real name; the temp file has served its purpose. If a
        // task still holds it open, the OS keeps it until that ends.
        let _ = std::fs::remove_file(old);
    }
    info(e, ())
}

fn same_file(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

fn recent_file(e: &Engine) -> Option<PathBuf> {
    e.inner
        .config
        .state_dir
        .as_ref()
        .map(|d| d.join("recent-workspaces.json"))
}

fn read_recent(e: &Engine) -> Vec<String> {
    recent_file(e)
        .and_then(|f| std::fs::read_to_string(f).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Puts `path` at the top of the recent list (best effort).
pub(crate) fn remember_recent(e: &Engine, path: &Path) {
    let Some(file) = recent_file(e) else { return };
    // `dunce`, not `Path::canonicalize`: on Windows the latter returns a
    // verbatim `\\?\C:\…` path, which would then be shown to the user and
    // compared against ordinary paths.
    let path = dunce::canonicalize(path)
        .unwrap_or_else(|_| path.to_path_buf())
        .display()
        .to_string();
    let mut list = read_recent(e);
    list.retain(|p| p != &path);
    list.insert(0, path);
    list.truncate(MAX_RECENT);
    if let Some(dir) = file.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(json) = serde_json::to_string_pretty(&list) {
        let _ = std::fs::write(file, json);
    }
}

fn recent(e: &Engine, _: ()) -> Result<Vec<RecentWorkspace>> {
    Ok(read_recent(e)
        .into_iter()
        .map(|path| {
            let p = Path::new(&path);
            RecentWorkspace {
                name: p
                    .file_stem()
                    .map_or_else(|| path.clone(), |s| s.to_string_lossy().into_owned()),
                exists: p.is_file(),
                path,
            }
        })
        .collect())
}

fn list_tasks(e: &Engine, _: ()) -> Result<Vec<TaskInfo>> {
    Ok(e.inner.tasks.snapshot())
}

fn write_text_file(_: &Engine, p: WriteTextFileParams) -> Result<()> {
    let path = Path::new(&p.path);
    std::fs::write(path, p.content).map_err(|e| io_err(path, e))
}
