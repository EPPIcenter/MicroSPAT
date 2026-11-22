//! The native menu bar. Workspace items and Help → Take the Tour are
//! forwarded to the UI as `microspat://action` events, so they run the same
//! code as the in-app workspace menu (including its dialogs, toasts and task
//! progress).

use crate::{ACTION_EVENT, MAIN_WINDOW};
use tauri::menu::{AboutMetadata, Menu, MenuEvent, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Wry};

/// Menu item ids; each is also the action name the UI receives.
const NEW_WORKSPACE: &str = "new_workspace";
const OPEN_WORKSPACE: &str = "open_workspace";
const SAVE_WORKSPACE_AS: &str = "save_workspace_as";
const LOAD_DEMO_DATA: &str = "load_demo_data";
const START_TOUR: &str = "start_tour";
const OPEN_SETTINGS: &str = "open_settings";
/// Our own Quit: the predefined one on macOS terminates without an
/// `ExitRequested` event, so it could not ask about running tasks.
const QUIT: &str = "quit";
const ACTIONS: &[&str] = &[
    NEW_WORKSPACE,
    OPEN_WORKSPACE,
    SAVE_WORKSPACE_AS,
    LOAD_DEMO_DATA,
    START_TOUR,
    OPEN_SETTINGS,
];

fn about(app: &AppHandle) -> AboutMetadata<'static> {
    let info = app.package_info();
    AboutMetadata {
        name: Some(info.name.clone()),
        version: Some(info.version.to_string()),
        comments: Some(
            "Microsatellite genotyping from capillary electrophoresis, for mixed infections."
                .into(),
        ),
        copyright: Some(format!("{} · AGPL-3.0-or-later", info.authors)),
        license: Some("AGPL-3.0-or-later".into()),
        website: Some("https://github.com/EPPIcenter/MicroSPAT".into()),
        icon: app.default_window_icon().map(|i| i.clone().to_owned()),
        ..Default::default()
    }
}

/// Builds the menu bar.
pub(crate) fn build(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let item = |id: &str, text: &str, accel: Option<&str>| {
        let b = MenuItemBuilder::with_id(id, text);
        match accel {
            Some(a) => b.accelerator(a),
            None => b,
        }
        .build(app)
    };
    let file = SubmenuBuilder::new(app, "File")
        .item(&item(NEW_WORKSPACE, "New Workspace…", Some("CmdOrCtrl+N"))?)
        .item(&item(
            OPEN_WORKSPACE,
            "Open Workspace…",
            Some("CmdOrCtrl+O"),
        )?)
        .separator()
        .item(&item(
            SAVE_WORKSPACE_AS,
            "Save Workspace As…",
            Some("CmdOrCtrl+Shift+S"),
        )?)
        .separator()
        .item(&item(LOAD_DEMO_DATA, "Load Demo Data", None)?)
        .separator();
    #[cfg(not(target_os = "macos"))]
    let file = file
        .item(&item(OPEN_SETTINGS, "Settings…", Some("CmdOrCtrl+,"))?)
        .separator();
    let quit = item(QUIT, "Quit MicroSPAT", Some("CmdOrCtrl+Q"))?;
    #[cfg(target_os = "macos")]
    let file = file.close_window();
    #[cfg(not(target_os = "macos"))]
    let file = file.item(&quit);

    // Edit, View and Window exist only on macOS. There the webview's text
    // shortcuts (copy, paste, undo) are delivered through the Edit menu. On
    // Windows and Linux the webview handles them itself, and the predefined
    // items are missing or do nothing (GTK supports a handful, Windows has no
    // fullscreen item), so the menus would be empty or dead.
    #[cfg(target_os = "macos")]
    let edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    #[cfg(target_os = "macos")]
    let view = SubmenuBuilder::new(app, "View").fullscreen().build()?;
    #[cfg(target_os = "macos")]
    let window = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;
    let help = SubmenuBuilder::new(app, "Help")
        .item(&item(START_TOUR, "Take the Tour", None)?)
        .separator()
        .about_with_text("About MicroSPAT", Some(about(app)))
        .build()?;

    let menu = Menu::new(app)?;
    #[cfg(target_os = "macos")]
    {
        let app_menu = SubmenuBuilder::new(app, "MicroSPAT")
            .about(Some(about(app)))
            .separator()
            .item(&item(OPEN_SETTINGS, "Settings…", Some("CmdOrCtrl+,"))?)
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .item(&quit)
            .build()?;
        menu.append(&app_menu)?;
    }
    menu.append(&file.build()?)?;
    #[cfg(target_os = "macos")]
    {
        menu.append(&edit)?;
        menu.append(&view)?;
        menu.append(&window)?;
    }
    menu.append(&help)?;
    Ok(menu)
}

/// Forwards workspace actions and the tour to the UI; quits after asking about running tasks.
pub(crate) fn handle(app: &AppHandle, event: MenuEvent) {
    let id = event.id().as_ref();
    if id == QUIT {
        if crate::may_quit(app) {
            app.exit(0);
        }
    } else if ACTIONS.contains(&id) {
        crate::workspace::focus_main(app);
        let _ = app.emit_to(MAIN_WINDOW, ACTION_EVENT, id);
    }
}
