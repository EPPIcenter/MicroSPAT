//! Hooks for automated checks of a built app (cargo feature `verify`, never in
//! release bundles). macOS WebViews cannot be driven by WebDriver, and a locked
//! screen blocks `screencapture`, so a test run sets `MICROSPAT_VERIFY_DIR` and
//! the app polls that folder:
//!
//! - `eval.js`: run in the page, then deleted (the script can write results
//!   back with `rpc('write_text_file')`).
//! - `snap`: a name; the WebView's contents are saved as `<name>.tiff` (macOS),
//!   then `snap` is deleted.
//! - `state`: the native window's title, size and position are written to
//!   `state.json`, then `state` is deleted.

use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Manager, WebviewWindow};

/// Starts polling `MICROSPAT_VERIFY_DIR` if it is set.
pub(crate) fn start(app: &AppHandle) {
    let Some(dir) = std::env::var_os("MICROSPAT_VERIFY_DIR").map(PathBuf::from) else {
        return;
    };
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(300));
        let Some(window) = app.get_webview_window(crate::MAIN_WINDOW) else {
            continue;
        };
        if let Some(js) = take(&dir.join("eval.js")) {
            let _ = window.eval(&js);
        }
        if let Some(name) = take(&dir.join("snap")) {
            snapshot(&window, dir.join(format!("{}.tiff", name.trim())));
        }
        if take(&dir.join("state")).is_some() {
            let state = serde_json::json!({
                "title": window.title().ok(),
                "inner_size": window.inner_size().ok().map(|s| [s.width, s.height]),
                "outer_position": window.outer_position().ok().map(|p| [p.x, p.y]),
                "scale_factor": window.scale_factor().ok(),
                "visible": window.is_visible().ok(),
                "pid": std::process::id(),
            });
            let _ = std::fs::write(dir.join("state.json"), state.to_string());
        }
    });
}

/// Reads and deletes a command file.
fn take(path: &Path) -> Option<String> {
    let text = std::fs::read_to_string(path).ok()?;
    std::fs::remove_file(path).ok()?;
    Some(text)
}

#[cfg(target_os = "macos")]
fn snapshot(window: &WebviewWindow, path: PathBuf) {
    use block2::RcBlock;
    use objc2_app_kit::NSImage;
    use objc2_foundation::NSError;
    use objc2_web_kit::WKWebView;

    let _ = window.with_webview(move |wv| {
        let handler = RcBlock::new(move |image: *mut NSImage, _error: *mut NSError| {
            // SAFETY: WebKit passes a valid NSImage or null.
            let tiff = unsafe { image.as_ref() }.and_then(|i| i.TIFFRepresentation());
            match tiff {
                Some(data) => {
                    let _ = std::fs::write(&path, data.to_vec());
                }
                None => eprintln!("verify: snapshot failed"),
            }
        });
        // SAFETY: on macOS `inner()` is the WKWebView, and this runs on the main thread.
        unsafe {
            let view = &*wv.inner().cast::<WKWebView>();
            view.takeSnapshotWithConfiguration_completionHandler(None, &handler);
        }
    });
}

#[cfg(not(target_os = "macos"))]
fn snapshot(_window: &WebviewWindow, _path: PathBuf) {
    eprintln!("verify: snapshots are only implemented on macOS");
}
