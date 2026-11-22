//! The HTTP transport contract, exercised against the router in-process.

use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use microspat_engine::{Engine, EngineConfig};
use microspat_server::{router, AppState, UiSource};
use serde_json::{json, Value};
use std::time::Duration;
use tower::ServiceExt;

fn app(ui: UiSource) -> (Router, AppState, tempfile::TempDir) {
    let dir = tempfile::tempdir().unwrap();
    let engine = Engine::new(EngineConfig::default());
    engine
        .open_or_create(&dir.path().join("t.microspat"))
        .unwrap();
    let state = AppState::new(engine, ui).unwrap();
    (router(state.clone()), state, dir)
}

async fn rpc(app: &Router, method: &str, body: Value) -> (StatusCode, Value) {
    let res = app
        .clone()
        .oneshot(
            Request::post(format!("/api/rpc/{method}"))
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = res.status();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

#[tokio::test(flavor = "multi_thread")]
async fn rpc_results_and_errors() {
    let (app, _, _dir) = app(UiSource::None);
    let (s, v) = rpc(&app, "get_workspace_info", Value::Null).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(v["name"], "t");
    assert_eq!(v["counts"]["ladders"], 4);

    let (s, v) = rpc(&app, "get_plate", json!({ "id": 42 })).await;
    assert_eq!(s, StatusCode::NOT_FOUND);
    assert_eq!(v["error"]["code"], "not_found");
    assert!(v["error"]["message"].as_str().unwrap().contains("42"));

    let (s, v) = rpc(&app, "nope", Value::Null).await;
    assert_eq!(
        (s, v["error"]["code"].as_str()),
        (StatusCode::NOT_FOUND, Some("unknown_method"))
    );

    let (s, v) = rpc(&app, "create_locus", json!({ "label": "" , "color": "blue", "min_base_length": 1, "max_base_length": 2, "nucleotide_repeat_length": 2})).await;
    assert_eq!(
        (s, v["error"]["code"].as_str()),
        (StatusCode::BAD_REQUEST, Some("invalid"))
    );

    let (s, _) = rpc(
        &app,
        "write_text_file",
        json!({ "path": "/tmp/x", "content": "x" }),
    )
    .await;
    assert_eq!(s, StatusCode::FORBIDDEN);

    // Cross-site form posts cannot reach the RPC endpoint.
    let res = app
        .clone()
        .oneshot(
            Request::post("/api/rpc/get_workspace_info")
                .header(header::CONTENT_TYPE, "text/plain")
                .body(Body::from("null"))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::UNSUPPORTED_MEDIA_TYPE);

    // Empty body means no params.
    let res = app
        .clone()
        .oneshot(
            Request::post("/api/rpc/list_ladders")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    let res = app
        .clone()
        .oneshot(
            Request::get("/api/nothing/here")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::NOT_FOUND);
}

#[tokio::test(flavor = "multi_thread")]
async fn upload_saves_files_and_keeps_folder_structure() {
    let (app, _, _dir) = app(UiSource::None);
    let boundary = "XBOUNDARYX";
    let mut body = Vec::new();
    for (name, data) in [
        ("plate/A01.fsa", b"one".as_slice()),
        ("../../evil.fsa", b"two".as_slice()),
    ] {
        body.extend_from_slice(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"files\"; filename=\"{name}\"\r\nContent-Type: application/octet-stream\r\n\r\n").as_bytes());
        body.extend_from_slice(data);
        body.extend_from_slice(b"\r\n");
    }
    body.extend_from_slice(format!("--{boundary}--\r\n").as_bytes());
    let res = app
        .clone()
        .oneshot(
            Request::post("/api/upload")
                .header("x-microspat-request", "1")
                .header(
                    header::CONTENT_TYPE,
                    format!("multipart/form-data; boundary={boundary}"),
                )
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let v: Value =
        serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let files = v.as_array().unwrap();
    assert_eq!(files.len(), 2);
    assert_eq!(files[0]["name"], "A01.fsa");
    let p0 = std::path::PathBuf::from(files[0]["path"].as_str().unwrap());
    assert!(p0.ends_with("plate/A01.fsa"));
    assert_eq!(std::fs::read(&p0).unwrap(), b"one");
    let p1 = std::path::PathBuf::from(files[1]["path"].as_str().unwrap());
    assert_eq!(
        p1.parent(),
        p0.parent().unwrap().parent(),
        "`..` cannot escape the upload directory"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn events_stream_changed_and_task_events() {
    let (app, state, _dir) = app(UiSource::None);
    let res = app
        .clone()
        .oneshot(Request::get("/api/events").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(res.headers()[header::CONTENT_TYPE], "text/event-stream");
    let mut body = res.into_body();
    let (s, _) = rpc(&app, "create_sample", json!({ "barcode": "S1" })).await;
    assert_eq!(s, StatusCode::OK);
    let mut text = String::new();
    while !text.contains("\"changed\"") {
        let frame = tokio::time::timeout(Duration::from_secs(5), body.frame())
            .await
            .expect("event within 5 s")
            .unwrap()
            .unwrap();
        if let Ok(d) = frame.into_data() {
            text.push_str(&String::from_utf8_lossy(&d));
        }
    }
    let line = text.lines().find(|l| l.starts_with("data:")).unwrap();
    let ev: Value = serde_json::from_str(line.trim_start_matches("data:").trim()).unwrap();
    assert_eq!(
        ev,
        json!({ "type": "changed", "entity": "samples", "ids": [1] })
    );
    // Shutdown ends the stream instead of hanging the server.
    state.close_event_streams();
    let end = tokio::time::timeout(Duration::from_secs(5), async {
        while let Some(f) = body.frame().await {
            if f.is_err() {
                break;
            }
        }
    })
    .await;
    assert!(end.is_ok(), "stream did not end on shutdown");
}

#[tokio::test(flavor = "multi_thread")]
async fn serves_the_ui_with_spa_fallback() {
    let ui = tempfile::tempdir().unwrap();
    std::fs::write(ui.path().join("index.html"), "<html>app</html>").unwrap();
    std::fs::create_dir(ui.path().join("assets")).unwrap();
    std::fs::write(ui.path().join("assets/app.js"), "console.log(1)").unwrap();
    let (app, _, _dir) = app(UiSource::Dir(ui.path().to_path_buf()));
    let get = |p: &str| {
        let app = app.clone();
        let p = p.to_string();
        async move {
            let res = app
                .oneshot(Request::get(p).body(Body::empty()).unwrap())
                .await
                .unwrap();
            let ct = res.headers()[header::CONTENT_TYPE]
                .to_str()
                .unwrap()
                .to_string();
            (
                res.status(),
                ct,
                String::from_utf8(res.into_body().collect().await.unwrap().to_bytes().to_vec())
                    .unwrap(),
            )
        }
    };
    assert_eq!(get("/").await.2, "<html>app</html>");
    let (s, ct, body) = get("/plates/12").await;
    assert_eq!((s, body.as_str()), (StatusCode::OK, "<html>app</html>"));
    assert!(ct.starts_with("text/html"));
    let (_, ct, body) = get("/assets/app.js").await;
    assert!(ct.starts_with("text/javascript") && body.contains("console"));
    assert_eq!(get("/../../etc/passwd").await.2, "<html>app</html>");
}

async fn upload_one(
    app: &Router,
    name: &str,
    content: &str,
    with_header: bool,
) -> (StatusCode, Value) {
    let boundary = "XBOUNDARY";
    let body = format!(
        "--{boundary}\r\nContent-Disposition: form-data; name=\"files\"; filename=\"{name}\"\r\n\r\n{content}\r\n--{boundary}--\r\n"
    );
    let mut req = Request::post("/api/upload").header(
        header::CONTENT_TYPE,
        format!("multipart/form-data; boundary={boundary}"),
    );
    if with_header {
        req = req.header("x-microspat-request", "1");
    }
    let res = app
        .clone()
        .oneshot(req.body(Body::from(body)).unwrap())
        .await
        .unwrap();
    let status = res.status();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

#[tokio::test(flavor = "multi_thread")]
async fn uploads_need_the_request_header() {
    let (app, _, _dir) = app(UiSource::None);
    // What a form on another site can send: refused.
    let (s, _) = upload_one(&app, "a.csv", "x", false).await;
    assert_eq!(s, StatusCode::FORBIDDEN);
    let (s, v) = upload_one(&app, "a.csv", "x", true).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(v[0]["name"], "a.csv");
}

#[tokio::test(flavor = "multi_thread")]
async fn rpc_paths_are_confined_to_uploads() {
    let (app, state, dir) = app(UiSource::None);
    let outside = dir.path().join("loci.csv");
    let csv = "Label,Min. Base Length,Max. Base Length,Nucleotide Repeat Length,Color\nL1,60,140,3,blue\n";
    std::fs::write(&outside, csv).unwrap();

    // A file elsewhere on the server's disk cannot be read…
    let (s, v) = rpc(&app, "import_loci_csv", json!({ "path": outside })).await;
    assert_eq!(s, StatusCode::FORBIDDEN, "{v}");
    assert!(v["error"]["message"].as_str().unwrap().contains("uploaded"));
    // …nor a workspace written or opened anywhere.
    for (method, path) in [
        ("save_workspace_as", dir.path().join("copy.microspat")),
        ("new_workspace", dir.path().join("new.microspat")),
        ("open_workspace", dir.path().join("t.microspat")),
    ] {
        let (s, _) = rpc(&app, method, json!({ "path": path })).await;
        assert_eq!(s, StatusCode::FORBIDDEN, "{method}");
    }
    let (s, _) = rpc(
        &app,
        "import_plates",
        json!({ "paths": ["/etc"], "ladder_id": 1 }),
    )
    .await;
    assert_eq!(s, StatusCode::FORBIDDEN);

    // An uploaded file is accepted for data import…
    let (_, up) = upload_one(&app, "loci.csv", csv.trim_end(), true).await;
    let (s, v) = rpc(&app, "import_loci_csv", json!({ "path": up[0]["path"] })).await;
    assert_eq!(s, StatusCode::OK, "{v}");

    // …but workspace switching via uploaded files and listing host recent paths remain refused.
    let (s, _) = rpc(&app, "open_workspace", json!({ "path": up[0]["path"] })).await;
    assert_eq!(s, StatusCode::FORBIDDEN);
    let (s, _) = rpc(&app, "list_recent_workspaces", Value::Null).await;
    assert_eq!(s, StatusCode::FORBIDDEN);

    // And the restriction can be lifted for trusted use.
    let open = router(state.allow_host_paths(true));
    let (s, v) = rpc(
        &open,
        "save_workspace_as",
        json!({ "path": dir.path().join("copy.microspat") }),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "{v}");
}

#[tokio::test(flavor = "multi_thread")]
async fn loopback_server_refuses_foreign_hosts() {
    let (_, state, _dir) = app(UiSource::None);
    let app = router(state.loopback_only(true));
    let call = |host: &'static str| {
        let app = app.clone();
        async move {
            app.oneshot(
                Request::post("/api/rpc/get_workspace_info")
                    .header(header::HOST, host)
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from("null"))
                    .unwrap(),
            )
            .await
            .unwrap()
            .status()
        }
    };
    for ok in [
        "localhost:7878",
        "127.0.0.1:7878",
        "[::1]:7878",
        "localhost",
    ] {
        assert_eq!(call(ok).await, StatusCode::OK, "{ok}");
    }
    for bad in [
        "evil.example:7878",
        "127.0.0.1.evil.example",
        "192.168.1.5:7878",
        "[::1]evil.com",
        "[::1]:",
    ] {
        assert_eq!(call(bad).await, StatusCode::FORBIDDEN, "{bad}");
    }
}
