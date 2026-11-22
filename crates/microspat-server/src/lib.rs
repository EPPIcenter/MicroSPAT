//! HTTP adapter around [`microspat_engine::Engine`], implementing the HTTP
//! side of the UI transport contract:
//!
//! - `POST /api/rpc/<method>`: JSON params in, JSON result out; errors are
//!   `{ "error": { "code", "message" } }` with a 4xx/5xx status.
//! - `GET /api/events`: Server-Sent Events, one JSON `AppEvent` per message.
//! - `POST /api/upload`: multipart field `files` (repeated), saved under a
//!   temp directory; returns `[{ "path", "name" }]`.
//! - Everything else: the UI (`index.html` for unknown paths, so client-side
//!   routes like `/plates/12` load the app).
//!
//! Engine calls block, so each runs on tokio's blocking pool; long methods are
//! engine tasks and report progress over the event stream.
//!
//! There is no authentication: bind to 127.0.0.1 (the default) unless the
//! network is trusted. What a client that can reach the server may do is
//! limited as follows:
//!
//! - RPC requires `Content-Type: application/json` and uploads require the
//!   `X-MicroSPAT-Request` header. A page on another site cannot send either
//!   without a CORS preflight, which this server never approves.
//! - When bound to a loopback address, requests whose `Host` is not a
//!   loopback name are refused, which defeats DNS rebinding.
//! - File paths in RPC parameters must point into the upload directory, so
//!   a client cannot read or overwrite other files on the server's disk
//!   (`--allow-host-paths` lifts this), and `write_text_file` is disabled
//!   (browsers download exports).

use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, Multipart, Path as AxPath, State};
use axum::http::{header, HeaderMap, Request, StatusCode, Uri};
use axum::middleware::{self, Next};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{any, get, post};
use axum::{Json, Router};
use microspat_engine::{Engine, ErrorCode, RpcError};
use serde::Serialize;
use serde_json::{json, Value};
use std::convert::Infallible;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use tokio::sync::broadcast;
use tokio_stream::wrappers::{BroadcastStream, WatchStream};
use tokio_stream::{Stream, StreamExt};

/// Largest accepted upload request (a few hundred plates of FSA files).
const MAX_UPLOAD_BYTES: usize = 4 * 1024 * 1024 * 1024;
/// Largest accepted RPC body (CSV content can be inlined).
const MAX_RPC_BYTES: usize = 64 * 1024 * 1024;
/// Methods the HTTP adapter refuses: browsers save exports themselves, and a
/// network-reachable arbitrary file write is not acceptable.
const BLOCKED_METHODS: &[&str] = &["write_text_file"];
/// Workspace host-path methods refused unless `--allow-host-paths` is set.
const HOST_PATH_METHODS: &[&str] = &[
    "open_workspace",
    "save_workspace_as",
    "list_recent_workspaces",
];
/// Header every upload must carry. It is not a secret: its only job is to
/// make a cross-site form post impossible without a CORS preflight.
const REQUEST_HEADER: &str = "x-microspat-request";

/// Where the UI files come from.
#[derive(Clone, Debug)]
pub enum UiSource {
    /// A built `ui/dist` directory.
    Dir(PathBuf),
    /// Files compiled into the binary (`embed-ui` feature).
    #[cfg(feature = "embed-ui")]
    Embedded,
    /// No UI: a page explaining how to get one.
    None,
}

/// Shared server state.
#[derive(Clone)]
pub struct AppState {
    engine: Engine,
    events: broadcast::Sender<String>,
    uploads: Arc<tempfile::TempDir>,
    upload_seq: Arc<AtomicU64>,
    ui: UiSource,
    shutdown: Arc<tokio::sync::watch::Sender<bool>>,
    allow_host_paths: bool,
    loopback_only: bool,
}

impl AppState {
    /// Wraps an engine and starts forwarding its events to SSE clients.
    pub fn new(engine: Engine, ui: UiSource) -> std::io::Result<AppState> {
        let (tx, _) = broadcast::channel(1024);
        let rx = engine.subscribe();
        let fwd = tx.clone();
        std::thread::Builder::new()
            .name("microspat-events".into())
            .spawn(move || {
                // Ends when the engine (and with it the sender side) is dropped.
                for event in rx {
                    if let Ok(s) = serde_json::to_string(&event) {
                        let _ = fwd.send(s);
                    }
                }
            })?;
        Ok(AppState {
            engine,
            events: tx,
            uploads: Arc::new(
                tempfile::Builder::new()
                    .prefix("microspat-uploads-")
                    .tempdir()?,
            ),
            upload_seq: Arc::new(AtomicU64::new(0)),
            ui,
            shutdown: Arc::new(tokio::sync::watch::channel(false).0),
            allow_host_paths: false,
            loopback_only: false,
        })
    }

    /// Lets RPC parameters name any path on the server's disk, not only
    /// uploaded files. For trusted, scripted use.
    pub fn allow_host_paths(mut self, allow: bool) -> AppState {
        self.allow_host_paths = allow;
        self
    }

    /// Refuses API requests whose `Host` header is not a loopback name. Set
    /// this when the listener is bound to a loopback address.
    pub fn loopback_only(mut self, on: bool) -> AppState {
        self.loopback_only = on;
        self
    }

    /// Ends every open event stream, so a graceful shutdown does not wait on them.
    pub fn close_event_streams(&self) {
        self.shutdown.send_replace(true);
    }

    /// The engine.
    pub fn engine(&self) -> &Engine {
        &self.engine
    }
}

/// The full router.
pub fn router(state: AppState) -> Router {
    let api = Router::new()
        .route(
            "/rpc/{method}",
            post(rpc).layer(DefaultBodyLimit::max(MAX_RPC_BYTES)),
        )
        .route("/events", get(events))
        .route(
            "/upload",
            post(upload).layer(DefaultBodyLimit::max(MAX_UPLOAD_BYTES)),
        )
        .route("/{*rest}", any(api_not_found))
        .layer(middleware::from_fn_with_state(state.clone(), check_host));
    Router::new()
        .nest("/api", api)
        .fallback(get(ui))
        .with_state(state)
}

fn status_of(code: ErrorCode) -> StatusCode {
    match code {
        ErrorCode::NotFound | ErrorCode::UnknownMethod => StatusCode::NOT_FOUND,
        ErrorCode::Invalid => StatusCode::BAD_REQUEST,
        ErrorCode::Conflict | ErrorCode::InUse | ErrorCode::NoWorkspace => StatusCode::CONFLICT,
        ErrorCode::Io | ErrorCode::Internal => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

fn error_response(status: StatusCode, code: &str, message: &str) -> Response {
    (
        status,
        Json(json!({ "error": { "code": code, "message": message } })),
    )
        .into_response()
}

impl From<RpcErrorResponse> for Response {
    fn from(e: RpcErrorResponse) -> Response {
        error_response(status_of(e.0.code), e.0.code.as_str(), &e.0.message)
    }
}

struct RpcErrorResponse(RpcError);

/// True for `localhost`, `127.0.0.1`, `[::1]` and names under `.localhost`,
/// with or without a port.
fn is_loopback_host(host: &str) -> bool {
    let name = if let Some(rest) = host.strip_prefix('[') {
        let Some((inner, after)) = rest.split_once(']') else {
            return false;
        };
        if !after.is_empty() {
            let Some(port) = after.strip_prefix(':') else {
                return false;
            };
            if port.is_empty() || !port.bytes().all(|b| b.is_ascii_digit()) {
                return false;
            }
        }
        inner
    } else {
        host.rsplit_once(':').map_or(host, |(h, port)| {
            if !port.is_empty() && port.bytes().all(|b| b.is_ascii_digit()) {
                h
            } else {
                host
            }
        })
    };
    let name = name.to_ascii_lowercase();
    name == "localhost"
        || name.ends_with(".localhost")
        || name
            .parse::<std::net::IpAddr>()
            .is_ok_and(|ip| ip.is_loopback())
}

/// Against DNS rebinding: a hostile page can make its own domain resolve to
/// 127.0.0.1 and then talk to this server as "same origin", but the browser
/// still sends that domain as `Host`.
async fn check_host(
    State(s): State<AppState>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Response {
    if s.loopback_only {
        let host = request
            .headers()
            .get(header::HOST)
            .and_then(|v| v.to_str().ok())
            .or_else(|| request.uri().host());
        if !host.is_some_and(is_loopback_host) {
            return error_response(
                StatusCode::FORBIDDEN,
                "invalid",
                "This server only answers requests addressed to localhost.",
            );
        }
    }
    next.run(request).await
}

/// Checks that every file path in the parameters (`path`, `paths`) points
/// into the upload directory.
fn check_paths(params: &Value, uploads: &Path) -> Result<(), String> {
    let Some(obj) = params.as_object() else {
        return Ok(());
    };
    let root = uploads
        .canonicalize()
        .map_err(|e| format!("Upload directory is unavailable: {e}"))?;
    let named = obj.get("path").into_iter().chain(
        obj.get("paths")
            .and_then(Value::as_array)
            .into_iter()
            .flatten(),
    );
    for value in named {
        let Some(path) = value.as_str() else { continue };
        let inside = Path::new(path)
            .canonicalize()
            .is_ok_and(|p| p.starts_with(&root));
        if !inside {
            return Err(format!(
                "Over HTTP, files must be uploaded first: {path} is not an uploaded file. \
                 (Start the server with --allow-host-paths to use files on its disk.)"
            ));
        }
    }
    Ok(())
}

async fn rpc(
    State(s): State<AppState>,
    AxPath(method): AxPath<String>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let is_json = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("application/json"));
    if !is_json {
        return error_response(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "invalid",
            "RPC requests must have Content-Type: application/json",
        );
    }
    if BLOCKED_METHODS.contains(&method.as_str()) {
        return error_response(
            StatusCode::FORBIDDEN,
            "unknown_method",
            &format!("{method} is not available over HTTP"),
        );
    }
    let params: Value = if body.iter().all(u8::is_ascii_whitespace) {
        Value::Null
    } else {
        match serde_json::from_slice(&body) {
            Ok(v) => v,
            Err(e) => {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid",
                    &format!("Body is not JSON: {e}"),
                )
            }
        }
    };
    if !s.allow_host_paths {
        if HOST_PATH_METHODS.contains(&method.as_str())
            || (method == "new_workspace"
                && params
                    .as_object()
                    .and_then(|o| o.get("path"))
                    .is_some_and(|v| !v.is_null()))
        {
            return error_response(
                StatusCode::FORBIDDEN,
                "invalid",
                &format!(
                    "{method} on host paths is disabled over HTTP. \
                     (Start the server with --allow-host-paths to enable it.)"
                ),
            );
        }
        if let Err(message) = check_paths(&params, s.uploads.path()) {
            return error_response(StatusCode::FORBIDDEN, "invalid", &message);
        }
    }
    let engine = s.engine.clone();
    match tokio::task::spawn_blocking(move || engine.dispatch(&method, params)).await {
        Ok(Ok(v)) => Json(v).into_response(),
        Ok(Err(e)) => RpcErrorResponse(e).into(),
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal",
            &format!("Request crashed: {e}"),
        ),
    }
}

async fn events(State(s): State<AppState>) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let events = BroadcastStream::new(s.events.subscribe())
        // A client too slow to keep up misses events (it refetches on the next `changed`).
        .filter_map(|m| m.ok().map(Some));
    let closing = WatchStream::new(s.shutdown.subscribe()).filter_map(|stop| stop.then_some(None));
    let stream = events
        .merge(closing)
        .take_while(Option::is_some)
        .map(|data| Ok(Event::default().data(data.unwrap_or_default())));
    Sse::new(stream).keep_alive(KeepAlive::default())
}

#[derive(Serialize)]
struct Uploaded {
    path: String,
    name: String,
}

/// Keeps the relative path a browser sends for directory uploads, minus anything that could escape.
fn safe_relative(name: &str) -> Option<PathBuf> {
    let p: PathBuf = Path::new(&name.replace('\\', "/"))
        .components()
        .filter_map(|c| match c {
            Component::Normal(s) => Some(s.to_os_string()),
            _ => None,
        })
        .collect();
    (!p.as_os_str().is_empty()).then_some(p)
}

async fn upload(State(s): State<AppState>, headers: HeaderMap, mut form: Multipart) -> Response {
    if !headers.contains_key(REQUEST_HEADER) {
        return error_response(
            StatusCode::FORBIDDEN,
            "invalid",
            "Uploads must carry the X-MicroSPAT-Request header",
        );
    }
    let batch = s.uploads.path().join(format!(
        "upload-{}",
        s.upload_seq.fetch_add(1, Ordering::Relaxed) + 1
    ));
    let mut out = Vec::new();
    loop {
        let mut field = match form.next_field().await {
            Ok(Some(f)) => f,
            Ok(None) => break,
            Err(e) => {
                let _ = tokio::fs::remove_dir_all(&batch).await;
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid",
                    &format!("Bad upload: {e}"),
                );
            }
        };
        if field.name() != Some("files") {
            continue;
        }
        let Some(rel) = field.file_name().and_then(safe_relative) else {
            let _ = tokio::fs::remove_dir_all(&batch).await;
            return error_response(
                StatusCode::BAD_REQUEST,
                "invalid",
                "Uploaded file has no name",
            );
        };
        let name = rel
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let dest = batch.join(&rel);
        // Streamed to disk chunk by chunk: an upload can be gigabytes.
        let write = async {
            if let Some(dir) = dest.parent() {
                tokio::fs::create_dir_all(dir).await?;
            }
            let mut file = tokio::fs::File::create(&dest).await?;
            loop {
                match field.chunk().await {
                    Ok(Some(chunk)) => file.write_all(&chunk).await?,
                    Ok(None) => break,
                    Err(e) => return Err(std::io::Error::other(e)),
                }
            }
            file.flush().await
        };
        if let Err(e) = write.await {
            let _ = tokio::fs::remove_dir_all(&batch).await;
            return error_response(
                StatusCode::BAD_REQUEST,
                "io",
                &format!("Cannot store upload: {e}"),
            );
        }
        out.push(Uploaded {
            path: dest.display().to_string(),
            name,
        });
    }
    Json(out).into_response()
}

async fn api_not_found(uri: Uri) -> Response {
    error_response(
        StatusCode::NOT_FOUND,
        "not_found",
        &format!("No API route {}", uri.path()),
    )
}

async fn ui(State(s): State<AppState>, uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    match &s.ui {
        UiSource::Dir(dir) => serve_dir(dir, path).await,
        #[cfg(feature = "embed-ui")]
        UiSource::Embedded => embedded::serve(path),
        UiSource::None => Html(NO_UI).into_response(),
    }
}

const NO_UI: &str =
    "<!doctype html><title>MicroSPAT</title><body style=\"font-family:sans-serif\">\
<h1>MicroSPAT server</h1><p>The API is running at <code>/api</code>, but no UI is being served.</p>\
<p>Build it (<code>cd ui &amp;&amp; pnpm build</code>) and pass <code>--ui-dir ui/dist</code>, \
run <code>pnpm dev</code> in <code>ui/</code> (it proxies <code>/api</code> here), \
or build the server with <code>--features embed-ui</code>.</p></body>";

fn content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" | "map" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

async fn serve_dir(dir: &Path, path: &str) -> Response {
    let file = safe_relative(path)
        .map(|rel| dir.join(rel))
        .filter(|p| p.is_file())
        .unwrap_or_else(|| dir.join("index.html"));
    let is_index = file.file_name().is_some_and(|n| n == "index.html");
    match tokio::fs::read(&file).await {
        Ok(bytes) => {
            // Hashed assets never change; index.html must always be revalidated.
            let cache = if is_index {
                "no-cache"
            } else {
                "public, max-age=31536000, immutable"
            };
            (
                [
                    (header::CONTENT_TYPE, content_type(&file)),
                    (header::CACHE_CONTROL, cache),
                ],
                bytes,
            )
                .into_response()
        }
        Err(_) => Html(NO_UI).into_response(),
    }
}

#[cfg(feature = "embed-ui")]
mod embedded {
    use super::*;

    #[derive(rust_embed::RustEmbed)]
    #[folder = "../../ui/dist"]
    struct Assets;

    pub(super) fn serve(path: &str) -> Response {
        let (name, file) = match Assets::get(path).filter(|_| !path.is_empty()) {
            Some(f) => (path.to_string(), f),
            None => match Assets::get("index.html") {
                Some(f) => ("index.html".to_string(), f),
                None => return Html(NO_UI).into_response(),
            },
        };
        let is_index = name == "index.html";
        let cache = if is_index {
            "no-cache"
        } else {
            "public, max-age=31536000, immutable"
        };
        let ct = match content_type(Path::new(&name)) {
            "application/octet-stream" => mime_guess::from_path(&name)
                .first_or_octet_stream()
                .as_ref()
                .to_string(),
            known => known.to_string(),
        };
        (
            [
                (header::CONTENT_TYPE, ct),
                (header::CACHE_CONTROL, cache.to_string()),
            ],
            file.data.into_owned(),
        )
            .into_response()
    }
}
