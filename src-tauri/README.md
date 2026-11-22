# MicroSPAT desktop app and packaging

MicroSPAT ships two ways:

- **Desktop app** (this folder): the engine and the UI in one native window, built with Tauri 2. Installers for macOS (`.dmg`), Windows (NSIS `setup.exe`) and Linux (`.AppImage`, `.deb`).
- **Standalone server** (`crates/microspat-server` with the `embed-ui` feature): one binary that serves the UI to a browser, for headless or shared lab-server use.

Both are thin adapters over `crates/microspat-engine`. The desktop app has one command, `rpc`, which forwards `{ method, params }` to `Engine::dispatch` on a blocking thread. Engine events reach the page as `microspat://event`. `ui/src/api/transport.ts` is the other side.

## Commands

Run these from the repository root. You need Rust 1.94, Node 24 or later, and pnpm. On Linux you also need the [Tauri system packages](https://v2.tauri.app/start/prerequisites/) (see `.github/workflows/ci.yml` for the apt list).

```sh
pnpm install           # Tauri CLI at the root, then ui/ (postinstall)
pnpm dev               # desktop app with hot reload (Vite on :5173 + debug build)
pnpm build             # release bundles for this platform (target/release/bundle/)
pnpm serve             # browser mode: build the UI, run the server with it embedded, open a browser
pnpm build:server      # just build target/release/microspat-server (UI embedded)
pnpm check             # fmt, clippy, Rust tests, UI typecheck, lint, tests
pnpm icons             # regenerate src-tauri/icons/* from icons/icon.svg
```

`pnpm serve` passes extra arguments on to the server, for example `pnpm serve --workspace lab.microspat --port 8080`. The server binary needs nothing else on disk: copy it anywhere and run it.

On macOS, `pnpm build` makes the `.dmg` window layout with Finder through AppleScript, so the first build asks for permission to control Finder. Where nobody can answer that prompt (CI, SSH), run `CI=true pnpm build`. The `.dmg` is the same, without the custom icon layout.

## Version

The one version number is `[workspace.package] version` in the root `Cargo.toml`. `tauri.conf.json` has no `version`, so Tauri reads the crate's inherited version. It reaches the bundle names, `Info.plist`, the installers, the native About panel, and the engine's `get_workspace_info().app_version`. The release workflow refuses to build when a tag does not match it. To release, bump `Cargo.toml`, then push the tag `v<version>`.

## Behavior

- **Workspace at launch.** The app opens the workspace the OS asked it to open (double-click, `open`, or a command-line argument). Otherwise it reopens the most recent workspace. Failing that, it opens or creates `Documents/MicroSPAT/Workspace.microspat`. The default lives in Documents rather than in the app-data folder because the file is the user's analysis and the unit they share: it should be visible and backed up, and easy to attach to an email. If the last workspace is gone or cannot be opened, the app says so and opens the default. The recent list and the window state live in the app-data folder (`~/Library/Application Support/org.eppicenter.microspat` on macOS).
- **One instance.** Opening a `.microspat` file while the app runs switches the running app to it. On Windows and Linux a second launch passes its file to the first and exits.
- **Exit.** Quitting closes the workspace through the engine, which checkpoints SQLite and leaves one self-contained file with no `-wal` or `-shm`. If a task is running, the app asks first. macOS's own Quit menu item skips that question, so the menu uses a custom item.
- **Menu.** File → New Workspace…, Open Workspace…, Save Workspace As…, Load Demo Data and Help → Take the Tour are sent to the UI as `microspat://action` events and run the same code as the in-app workspace menu. About is in the app menu on macOS and under Help on every platform. The Edit, View and Window menus exist only on macOS: on Windows and Linux the predefined items are unsupported or do nothing, and the webview handles the text shortcuts itself.
- **File type on Linux.** The `.deb` installs `linux/org.eppicenter.microspat.xml` into `/usr/share/mime/packages`, which declares `application/x-microspat` as a subclass of SQLite for `*.microspat`. Without it file managers report a workspace as a plain SQLite database and never offer MicroSPAT. The AppImage registers nothing.
- **Window.** The title is `<workspace> — MicroSPAT`. The default size is 1440×900, the minimum 1024×640, and size and position are remembered.
- **Security.** The capability (`capabilities/main.json`) allows only `rpc`, event listen and unlisten, and the open and save dialogs. The CSP allows only the app's own scripts and IPC, with no network access. The app has no updater.

## Signing and opening unsigned builds

Without a signing identity, macOS bundles are ad-hoc signed (`signingIdentity: "-"`). The app then gets the "unidentified developer" prompt instead of the "damaged" message that unsigned Apple-silicon apps get. To sign and notarize, set these as environment variables locally or as repository secrets in CI: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, plus either `APPLE_ID`, `APPLE_PASSWORD` and `APPLE_TEAM_ID`, or an App Store Connect API key. No configuration change is needed. Windows builds are unsigned. To sign them, add `bundle.windows.signCommand` (or `certificateThumbprint`) in `tauri.windows.conf.json`.

To open unsigned builds:

- **macOS:** open the `.dmg` and drag MicroSPAT to Applications. The first time, double-clicking says Apple cannot check the app for malware. Click Done, open System Settings → Privacy & Security, and click **Open Anyway** next to the MicroSPAT message. Alternatively, run `xattr -dr com.apple.quarantine /Applications/MicroSPAT.app`.
- **Windows:** SmartScreen shows "Windows protected your PC". Click **More info**, then **Run anyway**. The installer installs per user and needs no administrator rights.
- **Linux:** `chmod +x MicroSPAT_*.AppImage` and run it, or install the `.deb` with `sudo apt install ./MicroSPAT_*.deb`.
- **Server binary (macOS/Linux):** `tar -xzf microspat-server-*.tar.gz`. On macOS, also run `xattr -d com.apple.quarantine microspat-server`.

## Releases (CI)

- `.github/workflows/ci.yml` runs on pull requests and pushes to `master`: Rust fmt, clippy and tests on Linux, the UI's typecheck, lint, tests and build, and cross-platform compilation of the desktop app and standalone server (plus desktop shell unit tests) on Linux, Windows and macOS.
- `.github/workflows/release.yml` runs on a `v*` tag. It checks the version, creates a draft release (automatically marking tags that contain a hyphen, like `v3.0.0-beta.1`, as GitHub pre-releases), then builds the macOS universal app, the Windows x64 app and the Linux x64 app with `tauri-apps/tauri-action`, plus the standalone server for each platform, and attaches everything to the draft. Review the draft and publish it by hand.

## Verifying a built app (macOS)

WKWebView cannot be driven by WebDriver. For automated checks, build with the `verify` feature, which is never part of a release bundle (`pnpm tauri build --features verify --bundles app`). Then run the app with `MICROSPAT_VERIFY_DIR=<dir>`, for example `open --env MICROSPAT_VERIFY_DIR=… MicroSPAT.app`. The app polls that folder for three commands: `eval.js` to run JavaScript in the page, `snap` to save the WebView as `<name>.tiff`, and `state` to write the window title, size and position to `state.json`. See `src/verify.rs`. The menus can be driven with `osascript` (System Events) when the terminal has Accessibility permission.
