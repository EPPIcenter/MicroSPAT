//! `microspat-server`: the MicroSPAT engine over HTTP, serving the UI.
//! For development, browser end-to-end tests, and headless/lab-server use.

use clap::Parser;
use microspat_engine::{Engine, EngineConfig};
use microspat_server::{router, AppState, UiSource};
use serde_json::{json, Value};
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(version, about = "MicroSPAT engine over HTTP, serving the UI")]
struct Args {
    /// Workspace file to open (created if missing). Without it, an untitled workspace is used.
    #[arg(long)]
    workspace: Option<PathBuf>,
    #[arg(long, default_value_t = 7878)]
    port: u16,
    /// Address to bind. There is no authentication: keep 127.0.0.1 unless the network is trusted.
    #[arg(long, default_value = "127.0.0.1")]
    host: String,
    /// Serve the UI from this directory (a built `ui/dist`).
    #[arg(long)]
    ui_dir: Option<PathBuf>,
    /// Open the app in the default browser once listening.
    #[arg(long)]
    open: bool,
    /// Load the demo data set if the workspace has no plates.
    #[arg(long)]
    demo: bool,
    /// Let API requests name any file on this machine's disk, not only uploaded files.
    /// For trusted, scripted use.
    #[arg(long)]
    allow_host_paths: bool,
}

fn ui_source(args: &Args) -> Result<UiSource, String> {
    if let Some(dir) = &args.ui_dir {
        if !dir.join("index.html").is_file() {
            return Err(format!(
                "{} has no index.html (build the UI with `pnpm build`)",
                dir.display()
            ));
        }
        return Ok(UiSource::Dir(dir.clone()));
    }
    #[cfg(feature = "embed-ui")]
    return Ok(UiSource::Embedded);
    #[cfg(not(feature = "embed-ui"))]
    Ok(UiSource::None)
}

fn setup(args: &Args) -> Result<Engine, String> {
    let engine = Engine::new(EngineConfig {
        state_dir: dirs::data_dir().map(|d| d.join("MicroSPAT")),
    });
    match &args.workspace {
        Some(path) => engine.open_or_create(path),
        None => engine.create_untitled(),
    }
    .map_err(|e| e.message)?;
    if args.demo {
        let info = engine
            .dispatch("get_workspace_info", Value::Null)
            .map_err(|e| e.message)?;
        if info["counts"]["plates"].as_u64() == Some(0) {
            eprintln!("loading demo data…");
            let r = engine
                .dispatch("load_demo_data", json!(null))
                .map_err(|e| e.message)?;
            let imported = r["plates"].as_array().map_or(0, |p| {
                p.iter().filter(|p| p["status"] == "imported").count()
            });
            eprintln!("demo data: {imported} plates imported");
        } else {
            eprintln!("--demo ignored: the workspace already has plates");
        }
    }
    Ok(engine)
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let term = async {
        if let Ok(mut s) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            s.recv().await;
        }
    };
    #[cfg(not(unix))]
    let term = std::future::pending::<()>();
    tokio::select! {
        _ = ctrl_c => {},
        _ = term => {},
    }
}

#[tokio::main]
async fn main() {
    let args = Args::parse();
    let fail = |m: String| -> ! {
        eprintln!("microspat-server: {m}");
        std::process::exit(1)
    };
    let ui = ui_source(&args).unwrap_or_else(|e| fail(e));
    let engine = tokio::task::block_in_place(|| setup(&args)).unwrap_or_else(|e| fail(e));
    let host_bare = args
        .host
        .strip_prefix('[')
        .and_then(|s| s.strip_suffix(']'))
        .unwrap_or(&args.host);
    let loopback = host_bare.eq_ignore_ascii_case("localhost")
        || host_bare
            .parse::<std::net::IpAddr>()
            .is_ok_and(|ip| ip.is_loopback());
    let state = AppState::new(engine.clone(), ui.clone())
        .unwrap_or_else(|e| fail(e.to_string()))
        .allow_host_paths(args.allow_host_paths)
        .loopback_only(loopback);
    let listener = tokio::net::TcpListener::bind((host_bare, args.port))
        .await
        .unwrap_or_else(|e| fail(format!("cannot listen on {}:{}: {e}", args.host, args.port)));
    let bound = listener.local_addr().ok();
    let url = match bound {
        Some(std::net::SocketAddr::V6(v6)) => format!("http://[{}]:{}/", v6.ip(), v6.port()),
        Some(std::net::SocketAddr::V4(v4)) => {
            if host_bare.eq_ignore_ascii_case("localhost") {
                format!("http://localhost:{}/", v4.port())
            } else {
                format!("http://{}:{}/", v4.ip(), v4.port())
            }
        }
        None => format!("http://{}:{}/", args.host, args.port),
    };
    let ws = engine
        .workspace()
        .map(|w| w.path().display().to_string())
        .unwrap_or_default();
    eprintln!(
        "MicroSPAT {} listening on {url}",
        microspat_engine::APP_VERSION
    );
    eprintln!("  workspace: {ws}");
    eprintln!("  ui: {ui:?}");
    if args.open {
        if let Err(e) = open::that(&url) {
            eprintln!("could not open a browser: {e}");
        }
    }
    let streams = state.clone();
    let served = axum::serve(listener, router(state))
        .with_graceful_shutdown(async move {
            shutdown_signal().await;
            eprintln!("shutting down");
            streams.close_event_streams();
        })
        .await;
    // Close the workspace so the file is left as one self-contained database.
    engine.close_workspace();
    if let Err(e) = served {
        fail(e.to_string());
    }
    eprintln!("stopped");
}
