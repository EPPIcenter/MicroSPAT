//! Which workspace is open: at launch, when the OS opens a `.microspat` file,
//! and the window title that names it.
//!
//! Launch order: the file the OS asked to open (a command-line argument on
//! Windows and Linux; on macOS an `Opened` event that arrives before setup
//! runs), else the most recent workspace, else the default
//! workspace `Documents/MicroSPAT/Workspace.microspat` (created on first launch;
//! the app-data directory if Documents is unavailable; an untitled temp file as
//! a last resort). Documents rather than app data because the file is the
//! user's analysis and the unit they share with other labs: it should be
//! visible in Finder/Explorer, backed up with their documents, and easy to
//! attach to an email, not hidden under `~/Library/Application Support`.
//!
//! The launch choice runs on the first RPC call, or shortly after startup if
//! the UI has not called by then, so startup never waits on opening a file.
//! Files the OS hands over later (`Opened`, a second launch) replace it.

use crate::{Shell, ACTION_EVENT, MAIN_WINDOW};
use microspat_engine::{Engine, WORKSPACE_EXTENSION};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

/// File name of the default workspace.
const DEFAULT_FILE_NAME: &str = "Workspace.microspat";
/// Folder for the default workspace, under the user's documents.
const DEFAULT_FOLDER: &str = "MicroSPAT";
/// How long to wait for the UI's first call before opening the launch workspace anyway.
const OPEN_ANYWAY_AFTER: Duration = Duration::from_millis(1500);

/// A file the OS asked to open before setup ran (macOS delivers a
/// double-clicked file's `Opened` event that early).
#[derive(Default)]
pub(crate) struct LaunchFile(Mutex<Option<PathBuf>>);

/// Remembers a file to open at launch.
#[cfg(target_os = "macos")]
pub(crate) fn set_launch_file(app: &AppHandle, path: PathBuf) {
    *app.state::<LaunchFile>()
        .0
        .lock()
        .unwrap_or_else(|p| p.into_inner()) = Some(path);
}

/// The file the OS asked to open before setup, if any.
pub(crate) fn take_launch_file(app: &AppHandle) -> Option<PathBuf> {
    app.state::<LaunchFile>()
        .0
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .take()
}

/// What to open at launch.
pub(crate) struct Startup {
    /// A workspace file given on the command line.
    pub(crate) file: Option<PathBuf>,
}

/// True for paths with the workspace extension.
pub(crate) fn is_workspace_file(path: &Path) -> bool {
    path.extension()
        .is_some_and(|e| e.eq_ignore_ascii_case(WORKSPACE_EXTENSION))
}

/// The first `.microspat` argument after the program name, made absolute.
pub(crate) fn file_argument(args: &[String], cwd: &Path) -> Option<PathBuf> {
    args.iter()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .map(|a| path_from_argument(a))
        .find(|p| is_workspace_file(p))
        .map(|p| if p.is_absolute() { p } else { cwd.join(p) })
}

/// A launch argument as a path. Linux and Windows launchers may pass a
/// `file://` URI (percent-encoded) instead of a plain path.
fn path_from_argument(arg: &str) -> PathBuf {
    if arg
        .get(..7)
        .is_some_and(|p| p.eq_ignore_ascii_case("file://"))
    {
        if let Ok(url) = tauri::Url::parse(arg) {
            if let Ok(path) = url.to_file_path() {
                return path;
            }
        }
    }
    PathBuf::from(arg)
}

fn lock_startup(shell: &Shell) -> MutexGuard<'_, Option<Startup>> {
    shell.startup.lock().unwrap_or_else(|p| p.into_inner())
}

/// Opens the launch workspace if nothing has been opened yet. Blocks other
/// callers until it is open, so no call sees "no workspace".
pub(crate) fn ensure_open(app: &AppHandle) {
    let shell = app.state::<Shell>();
    let mut pending = lock_startup(&shell);
    if let Some(startup) = pending.take() {
        open_at_launch(app, &shell.engine, startup);
    }
}

/// Opens the launch workspace shortly after startup if the UI has not asked yet
/// (so the title is right even before the page loads).
pub(crate) fn open_soon(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(OPEN_ANYWAY_AFTER);
        ensure_open(&app);
    });
}

fn open_path(engine: &Engine, path: &Path) -> Result<(), String> {
    engine
        .dispatch("open_workspace", json!({ "path": path }))
        .map(|_| ())
        .map_err(|e| e.message)
}

fn open_at_launch(app: &AppHandle, engine: &Engine, startup: Startup) {
    let mut problems = Vec::new();
    if let Some(file) = startup.file {
        match open_path(engine, &file) {
            Ok(()) => return,
            Err(e) => problems.push(e),
        }
    }
    let defaults = default_locations(app);
    let recent = engine
        .dispatch("list_recent_workspaces", Value::Null)
        .ok()
        .and_then(|v| v.as_array().and_then(|a| a.first().cloned()));
    if let Some(last) = recent.and_then(|r| r["path"].as_str().map(PathBuf::from)) {
        if last.is_file() {
            match open_path(engine, &last) {
                Ok(()) => return report(app, &problems),
                Err(e) => problems.push(e),
            }
        } else if !defaults.contains(&last) {
            problems.push(format!(
                "The last workspace, {}, has been moved or deleted.",
                last.display()
            ));
        }
    }
    let mut opened = false;
    for path in &defaults {
        match engine.open_or_create(path) {
            Ok(()) => {
                opened = true;
                break;
            }
            Err(e) => problems.push(e.message),
        }
    }
    if !opened {
        if let Err(e) = engine.create_untitled() {
            problems.push(e.message);
        }
    }
    if !problems.is_empty() {
        let now = engine
            .workspace()
            .map(|w| format!("Opened {} instead.", w.name()))
            .unwrap_or_else(|_| "No workspace could be opened.".into());
        problems.push(now);
    }
    report(app, &problems);
}

/// Where the default workspace goes, in order of preference.
fn default_locations(app: &AppHandle) -> Vec<PathBuf> {
    let paths = app.path();
    [
        paths
            .document_dir()
            .ok()
            .map(|d| d.join(DEFAULT_FOLDER).join(DEFAULT_FILE_NAME)),
        paths.app_data_dir().ok().map(|d| d.join(DEFAULT_FILE_NAME)),
    ]
    .into_iter()
    .flatten()
    .collect()
}

fn report(app: &AppHandle, problems: &[String]) {
    if problems.is_empty() {
        return;
    }
    app.dialog()
        .message(problems.join("\n\n"))
        .title("Workspace")
        .kind(MessageDialogKind::Warning)
        .show(|_| {});
}

/// Opens a workspace the OS handed over (double-click, `open`, a second launch).
pub(crate) fn open_from_os(app: &AppHandle, path: PathBuf) {
    let app = app.clone();
    std::thread::spawn(move || {
        let shell = app.state::<Shell>();
        // Held while opening, so the UI's calls wait for this workspace.
        let mut pending = lock_startup(&shell);
        // Before the engine changes workspace: the UI takes its page down, so
        // that the engine's `changed` events find nothing to refetch from a
        // workspace that lacks the page's items.
        let _ = app.emit_to(MAIN_WINDOW, ACTION_EVENT, "workspace_opening");
        let already_open = shell
            .engine
            .workspace()
            .is_ok_and(|w| same_file(w.path(), &path));
        let result = if already_open {
            Ok(())
        } else {
            open_path(&shell.engine, &path)
        };
        match result {
            Ok(()) => {
                pending.take();
                drop(pending);
                let _ = app.emit_to(MAIN_WINDOW, ACTION_EVENT, "workspace_opened");
            }
            Err(e) => {
                if let Some(startup) = pending.take() {
                    open_at_launch(&app, &shell.engine, startup);
                }
                drop(pending);
                let _ = app.emit_to(MAIN_WINDOW, ACTION_EVENT, "workspace_open_failed");
                app.dialog()
                    .message(e)
                    .title("Could not open workspace")
                    .kind(MessageDialogKind::Error)
                    .show(|_| {});
            }
        }
        focus_main(&app);
    });
}

fn same_file(a: &Path, b: &Path) -> bool {
    matches!((a.canonicalize(), b.canonicalize()), (Ok(a), Ok(b)) if a == b)
}

/// Brings the main window to the front.
pub(crate) fn focus_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(MAIN_WINDOW) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Sets the window title to the open workspace's name.
pub(crate) fn update_title(app: &AppHandle) {
    let shell = app.state::<Shell>();
    let title = match shell.engine.workspace() {
        Ok(ws) => format!("{} — MicroSPAT", ws.name()),
        Err(_) => "MicroSPAT".to_string(),
    };
    if let Some(w) = app.get_webview_window(MAIN_WINDOW) {
        let _ = w.set_title(&title);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_workspace_argument() {
        let args = |a: &[&str]| a.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        #[cfg(unix)]
        {
            let cwd = Path::new("/home/me");
            assert_eq!(
                file_argument(&args(&["app", "--flag", "lab.MicroSPAT"]), cwd),
                Some(PathBuf::from("/home/me/lab.MicroSPAT"))
            );
            assert_eq!(
                file_argument(&args(&["app", "/data/a.microspat"]), cwd),
                Some(PathBuf::from("/data/a.microspat"))
            );
            assert_eq!(file_argument(&args(&["app", "notes.txt"]), cwd), None);
            assert_eq!(
                file_argument(
                    &args(&["app", "file:///data/my%20lab/a%CC%8A.microspat"]),
                    cwd
                ),
                Some(PathBuf::from("/data/my lab/a\u{30a}.microspat"))
            );
            assert_eq!(file_argument(&args(&["a.microspat"]), cwd), None);
        }
        #[cfg(windows)]
        {
            let cwd = Path::new(r"D:\work");
            assert_eq!(
                file_argument(&args(&["app", "--flag", "lab.MicroSPAT"]), cwd),
                Some(PathBuf::from(r"D:\work\lab.MicroSPAT"))
            );
            assert_eq!(
                file_argument(&args(&["app", r"C:\data\a.microspat"]), cwd),
                Some(PathBuf::from(r"C:\data\a.microspat"))
            );
            assert_eq!(file_argument(&args(&["app", "notes.txt"]), cwd), None);
            assert_eq!(
                file_argument(&args(&["app", "file:///C:/Users/alice/a.microspat"]), cwd),
                Some(PathBuf::from(r"C:\Users\alice\a.microspat"))
            );
            assert_eq!(
                file_argument(
                    &args(&["app", "file:///C%3A/Users/alice/my%20lab.microspat"]),
                    cwd
                ),
                Some(PathBuf::from(r"C:\Users\alice\my lab.microspat"))
            );
            assert_eq!(file_argument(&args(&["a.microspat"]), cwd), None);
        }
    }
}
