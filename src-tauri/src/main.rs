//! MicroSPAT desktop app: the engine in a native window (Tauri 2).
//!
//! A thin adapter, like `microspat-server`: one `rpc` command forwards to
//! [`Engine::dispatch`] on a blocking thread, and every engine event goes to the
//! webview as `microspat://event`. The rest is what only a desktop app does:
//! choosing the workspace at launch and when the OS opens a `.microspat` file
//! (`workspace.rs`), the native menu (`menu.rs`), the window title, and closing
//! the workspace on exit so the file is left as one self-contained database.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod menu;
#[cfg(feature = "verify")]
mod verify;
mod workspace;

use microspat_engine::{AppEvent, Engine, EngineConfig, ErrorCode, RpcError};
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::ipc::Response;
use tauri::{AppHandle, Emitter, Manager, RunEvent, WindowEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_window_state::StateFlags;

/// Event carrying every engine `AppEvent` (the transport contract).
const ENGINE_EVENT: &str = "microspat://event";
/// Event asking the UI to run a shell action (menu items, a workspace opened by the OS).
const ACTION_EVENT: &str = "microspat://action";
/// Label of the one window (also in `tauri.conf.json` and the capability).
const MAIN_WINDOW: &str = "main";

/// App state shared by the command, the event loop and helper threads.
struct Shell {
    engine: Engine,
    /// What to open at launch, until something opens a workspace (`workspace.rs`).
    startup: Mutex<Option<workspace::Startup>>,
    /// The user agreed to quit while a task was running.
    quit_confirmed: AtomicBool,
    /// A quit confirmation dialog is already on screen.
    quit_prompt_open: AtomicBool,
}

/// The whole RPC surface: `invoke('rpc', { method, params })`.
///
/// Runs on the blocking pool so long calls never stall the event loop. The
/// result is serialized once here and passed through as raw JSON.
#[tauri::command]
async fn rpc(app: AppHandle, method: String, params: Option<Value>) -> Result<Response, RpcError> {
    tauri::async_runtime::spawn_blocking(move || {
        workspace::ensure_open(&app);
        let shell = app.state::<Shell>();
        let value = shell
            .engine
            .dispatch(&method, params.unwrap_or(Value::Null))?;
        serde_json::to_string(&value)
            .map(Response::new)
            .map_err(|e| RpcError::new(ErrorCode::Internal, format!("Cannot encode result: {e}")))
    })
    .await
    .map_err(|e| RpcError::new(ErrorCode::Internal, format!("Request crashed: {e}")))?
}

/// Forwards engine events to the webview and keeps the window title current.
fn forward_events(app: AppHandle, engine: &Engine) {
    let rx = engine.subscribe();
    let spawned = std::thread::Builder::new()
        .name("microspat-events".into())
        .spawn(move || {
            for event in rx {
                if matches!(&event, AppEvent::Changed { entity, .. } if entity == "workspace") {
                    workspace::update_title(&app);
                }
                let _ = app.emit(ENGINE_EVENT, &event);
            }
        });
    if let Err(e) = spawned {
        eprintln!("microspat: cannot start the event thread: {e}");
    }
}

/// Labels of running tasks (asked before quitting).
fn running_tasks(engine: &Engine) -> Vec<String> {
    let Ok(Value::Array(tasks)) = engine.dispatch("list_tasks", Value::Null) else {
        return Vec::new();
    };
    tasks
        .iter()
        .filter(|t| t["status"] == "running")
        .filter_map(|t| t["label"].as_str().map(str::to_string))
        .collect()
}

/// True when quitting may go ahead now. Otherwise asks the user (off the event
/// loop) and exits if they agree.
pub(crate) fn may_quit(app: &AppHandle) -> bool {
    let Some(shell) = app.try_state::<Shell>() else {
        return true;
    };
    if shell.quit_confirmed.load(Ordering::SeqCst) {
        return true;
    }
    let running = running_tasks(&shell.engine);
    if running.is_empty() {
        return true;
    }
    if shell.quit_prompt_open.swap(true, Ordering::SeqCst) {
        return false;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let quit = app
            .dialog()
            .message(format!(
                "{} is still running. If you quit now, its work is lost.",
                running.join(", ")
            ))
            .title("Quit MicroSPAT?")
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom(
                "Quit".into(),
                "Keep working".into(),
            ))
            .blocking_show();
        if let Some(shell) = app.try_state::<Shell>() {
            shell.quit_prompt_open.store(false, Ordering::SeqCst);
            if quit {
                shell.quit_confirmed.store(true, Ordering::SeqCst);
                app.exit(0);
            }
        }
    });
    false
}

fn main() {
    let app = tauri::Builder::default()
        // First, so a second launch hands over its file and exits before doing anything else.
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            workspace::focus_main(app);
            if let Some(path) = workspace::file_argument(&argv, std::path::Path::new(&cwd)) {
                workspace::open_from_os(app, path);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED)
                .build(),
        )
        .manage(workspace::LaunchFile::default())
        .invoke_handler(tauri::generate_handler![rpc])
        .setup(|app| {
            let handle = app.handle().clone();
            let engine = Engine::new(EngineConfig {
                state_dir: app.path().app_data_dir().ok(),
            });
            let args: Vec<String> = std::env::args().collect();
            let cwd = std::env::current_dir().unwrap_or_default();
            app.manage(Shell {
                engine: engine.clone(),
                startup: Mutex::new(Some(workspace::Startup {
                    file: workspace::file_argument(&args, &cwd)
                        .or_else(|| workspace::take_launch_file(&handle)),
                })),
                quit_confirmed: AtomicBool::new(false),
                quit_prompt_open: AtomicBool::new(false),
            });
            forward_events(handle.clone(), &engine);
            app.set_menu(menu::build(&handle)?)?;
            app.on_menu_event(menu::handle);
            workspace::open_soon(&handle);
            #[cfg(feature = "verify")]
            verify::start(&handle);
            // Hidden until the window-state plugin has restored the saved size and position.
            if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                window.show()?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == MAIN_WINDOW && !may_quit(window.app_handle()) {
                    api.prevent_close();
                }
            }
        })
        .build(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("microspat: cannot start: {e}");
            std::process::exit(1);
        });

    app.run(|app, event| match event {
        RunEvent::ExitRequested { api, .. } => {
            if !may_quit(app) {
                api.prevent_exit();
            }
        }
        RunEvent::Exit => {
            // Checkpoints the WAL and returns the file to rollback-journal mode,
            // leaving one self-contained file with no -wal/-shm sidecars.
            if let Some(shell) = app.try_state::<Shell>() {
                shell.engine.close_workspace();
            }
        }
        #[cfg(target_os = "macos")]
        RunEvent::Opened { urls } => {
            if let Some(path) = urls
                .iter()
                .filter_map(|u| u.to_file_path().ok())
                .find(|p| workspace::is_workspace_file(p))
            {
                if app.try_state::<Shell>().is_some() {
                    workspace::open_from_os(app, path);
                } else {
                    // A double-clicked file arrives before setup has run; setup opens it.
                    workspace::set_launch_file(app, path);
                }
            }
        }
        _ => {}
    });
}
