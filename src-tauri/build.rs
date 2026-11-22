fn main() {
    // Declaring the app's commands makes each one need a permission (`allow-rpc`
    // in capabilities/main.json) instead of being callable by default.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["rpc"])),
    )
    .expect("tauri-build failed");
}
