//! Crash safety: a process that dies during a plate import leaves a workspace
//! that opens cleanly, holds only whole plates, and finishes the import when
//! it is run again.
//!
//! The test runs itself as the child process: with `CHILD_ENV` set, the test
//! function opens the workspace and imports instead of supervising. The child
//! dies in two ways, and after each death the parent checks the file:
//!
//! 1. Inside a write transaction, after its work and before its commit, at
//!    fixed points (the debug-build hook `db::CRASH_BEFORE_COMMIT_ENV`). This
//!    is certain to catch a plate written in more than one transaction.
//! 2. Killed (SIGKILL, or TerminateProcess on Windows) at a different moment
//!    of a plate's work each round, until an import runs to the end.

mod common;

use common::{id, study, Harness};
use microspat_engine::db::{CRASH_BEFORE_COMMIT_ENV, CRASH_EXIT_CODE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, ExitStatus, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

const TEST_NAME: &str = "killed_import_leaves_whole_plates_and_resumes";
const CHILD_ENV: &str = "MICROSPAT_CRASH_TEST_CHILD";
/// Marks the lines the child prints; libtest prints other lines too.
const MARK: &str = "CRASH-TEST ";
const PLATES: usize = 10;
/// Write transactions to crash in, one child each: the first plate's, and
/// the next two, so a plate split over up to three transactions is caught.
const CRASH_POINTS: [u32; 3] = [1, 2, 3];
const MAX_KILL_ROUNDS: usize = 12;
/// A child silent this long is stuck: it is killed and the test fails.
const SILENCE_LIMIT: Duration = Duration::from_secs(300);

/// What the child imports, passed in `CHILD_ENV`.
#[derive(Serialize, Deserialize)]
struct Job {
    workspace: PathBuf,
    state: PathBuf,
    zips: Vec<PathBuf>,
    ladder_id: i64,
}

/// A plate of the study and its well count.
struct ExpectedPlate {
    label: String,
    wells: usize,
}

#[test]
fn killed_import_leaves_whole_plates_and_resumes() {
    if let Ok(job) = std::env::var(CHILD_ENV) {
        return child(serde_json::from_str(&job).unwrap());
    }

    let dir = tempfile::tempdir().unwrap();
    let st = study(dir.path(), PLATES, 9100);
    let ws = dir.path().join("crash.microspat");
    let state = dir.path().join("state");
    let ladder_id = {
        let h = Harness::new(&state);
        h.call("new_workspace", json!({ "path": ws.to_str() }));
        let ladders = h.call("list_ladders", Value::Null);
        let ladder_id = ladders
            .as_array()
            .unwrap()
            .iter()
            .find(|l| l["label"] == "HD ROX 400")
            .map(id)
            .unwrap();
        h.engine.close_workspace();
        ladder_id
    };
    let expected: Vec<ExpectedPlate> = st
        .specs
        .iter()
        .zip(&st.plates)
        .map(|(s, p)| ExpectedPlate {
            label: s.plate_name.clone(),
            wells: p.len(),
        })
        .collect();
    let job = serde_json::to_string(&Job {
        workspace: ws.clone(),
        state: state.clone(),
        zips: st.zips.clone(),
        ladder_id,
    })
    .unwrap();

    // 1. Crash inside a write transaction, before its commit.
    if cfg!(debug_assertions) {
        for at in CRASH_POINTS {
            let (status, result) = ChildRun::spawn(&job, Some(at)).finish();
            assert_eq!(
                status.code(),
                Some(CRASH_EXIT_CODE),
                "crash point {at} not reached: {status}, {result:?}"
            );
            check_workspace(&ws, &expected, true);
        }
    }

    // 2. Kill at a different moment each round until an import runs to the end.
    let mut kills = 0;
    let mut finished = None;
    // Time from one plate's commit to the next, measured in the first round.
    let mut interval: Option<Duration> = None;
    for round in 0..MAX_KILL_ROUNDS {
        let mut run = ChildRun::spawn(&job, None);
        // After the first plate this round commits, kill during the next
        // plate's parsing, sizing, or write.
        let mut kill_after = None;
        if run.next_message().as_deref() == Some("plate") {
            match interval {
                Some(t) => kill_after = Some(t.mul_f64((round as f64 * 0.618).fract())),
                None => {
                    let t0 = Instant::now();
                    if run.next_message().as_deref() == Some("plate") {
                        interval = Some(t0.elapsed());
                        kill_after = Some(Duration::ZERO);
                    }
                }
            }
        }
        let mut killed = false;
        if let Some(delay) = kill_after {
            std::thread::sleep(delay);
            killed = run.kill();
            kills += usize::from(killed);
        }
        let (status, result) = run.finish();
        match result {
            None => {
                assert!(killed, "child died without a result: {status}");
                check_workspace(&ws, &expected, true);
            }
            Some(r) => {
                // A kill can land after the result line, while the child exits.
                assert!(status.success() || killed, "child failed: {status}");
                check_workspace(&ws, &expected, false);
                finished = Some(r);
                break;
            }
        }
    }
    assert!(kills > 0, "no import was interrupted");
    let finished = finished.expect("the import never ran to the end");
    assert!(finished.contains("failed=0"), "{finished}");

    // Every plate is in, once, and the workspace works.
    let h = Harness::new(&state);
    h.call("open_workspace", json!({ "path": ws.to_str() }));
    let plates = h.call("list_plates", Value::Null);
    let labels: Vec<&str> = plates
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["label"].as_str().unwrap())
        .collect();
    assert_eq!(labels.len(), PLATES, "{labels:?}");
    for plate in &expected {
        assert!(
            labels.contains(&plate.label.as_str()),
            "{} missing: {labels:?}",
            plate.label
        );
    }
}

/// A child process running [`child`], and the marked lines it prints.
struct ChildRun {
    process: std::process::Child,
    messages: Receiver<String>,
    reader: JoinHandle<()>,
    result: Option<String>,
}

impl ChildRun {
    /// Starts a child; with `crash_at`, it dies in that write transaction.
    fn spawn(job: &str, crash_at: Option<u32>) -> ChildRun {
        let mut cmd = Command::new(std::env::current_exe().unwrap());
        cmd.args([TEST_NAME, "--exact", "--nocapture", "--test-threads=1"])
            .env(CHILD_ENV, job)
            .env_remove(CRASH_BEFORE_COMMIT_ENV)
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        if let Some(n) = crash_at {
            cmd.env(CRASH_BEFORE_COMMIT_ENV, n.to_string());
        }
        let mut process = cmd.spawn().unwrap();
        let stdout = process.stdout.take().unwrap();
        let (tx, messages) = mpsc::channel();
        let reader = std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(|l| l.ok()) {
                // Not a prefix: libtest's "test <name> ... " has no newline
                // and may sit in front of the child's first line.
                if let Some(i) = line.find(MARK) {
                    let _ = tx.send(line[i + MARK.len()..].to_string());
                }
            }
        });
        ChildRun {
            process,
            messages,
            reader,
            result: None,
        }
    }

    /// The child's next line; None once it has exited. Fails the test if
    /// the child stays silent past `SILENCE_LIMIT`.
    fn next_message(&mut self) -> Option<String> {
        match self.messages.recv_timeout(SILENCE_LIMIT) {
            Ok(m) => {
                if m.starts_with("result ") {
                    self.result = Some(m.clone());
                }
                Some(m)
            }
            Err(RecvTimeoutError::Disconnected) => None,
            Err(RecvTimeoutError::Timeout) => {
                let _ = self.process.kill();
                panic!("the child printed nothing for {SILENCE_LIMIT:?}");
            }
        }
    }

    /// Kills the child; false if it had already exited.
    fn kill(&mut self) -> bool {
        if self.process.try_wait().unwrap().is_some() {
            return false;
        }
        self.process.kill().unwrap();
        true
    }

    /// Waits for the child to exit (killing it past `SILENCE_LIMIT`); returns
    /// its status and its result line, if it printed one.
    fn finish(mut self) -> (ExitStatus, Option<String>) {
        let started = Instant::now();
        let status = loop {
            if let Some(s) = self.process.try_wait().unwrap() {
                break s;
            }
            if started.elapsed() > SILENCE_LIMIT {
                let _ = self.process.kill();
                panic!("the child did not exit within {SILENCE_LIMIT:?}");
            }
            std::thread::sleep(Duration::from_millis(10));
        };
        self.reader.join().unwrap();
        let result = self
            .result
            .or_else(|| self.messages.try_iter().find(|m| m.starts_with("result ")));
        (status, result)
    }
}

/// The child: opens the workspace and imports every plate, printing a line
/// after each plate commits and one with the outcome counts at the end.
fn child(job: Job) {
    let h = Harness::new(&job.state);
    h.call("open_workspace", json!({ "path": job.workspace }));
    h.drain();
    let Harness { engine, events } = h;
    std::thread::spawn(move || {
        for e in events {
            if matches!(&e, microspat_engine::AppEvent::Changed { entity, .. } if entity == "plates")
            {
                report_to_parent("plate");
            }
        }
    });
    let r = engine
        .dispatch(
            "import_plates",
            json!({ "paths": job.zips, "ladder_id": job.ladder_id }),
        )
        .unwrap();
    let count = |s: &str| {
        r["plates"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|p| p["status"] == s)
            .count()
    };
    report_to_parent(&format!(
        "result imported={} duplicate={} failed={}",
        count("imported"),
        count("duplicate"),
        count("failed")
    ));
}

/// Prints a marked line for the parent.
fn report_to_parent(msg: &str) {
    let mut out = std::io::stdout().lock();
    let _ = writeln!(out, "{MARK}{msg}");
    let _ = out.flush();
}

/// What the workspace holds for one plate.
struct PlateRows {
    label: String,
    wells: i64,
    channels: i64,
    traces: i64,
    quality_reports: i64,
}

/// Checks the file as the dead child left it: SQLite reports no damage, and
/// every plate in it is complete.
fn check_workspace(ws: &Path, expected: &[ExpectedPlate], died: bool) {
    if died {
        // The unclean path: a clean close would have removed the WAL.
        assert!(
            sidecar(ws, "-wal").exists(),
            "no WAL left by the dead process"
        );
    }
    let conn = rusqlite::Connection::open(ws).unwrap();
    let integrity: String = conn
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .unwrap();
    assert_eq!(integrity, "ok");
    let fk_problems: i64 = conn
        .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(fk_problems, 0);

    let mut stmt = conn
        .prepare(
            "SELECT p.label,
                    (SELECT COUNT(*) FROM well w WHERE w.plate_id = p.id),
                    (SELECT COUNT(*) FROM channel c JOIN well w ON c.well_id = w.id
                      WHERE w.plate_id = p.id),
                    (SELECT COUNT(*) FROM trace t JOIN channel c ON t.channel_id = c.id
                      JOIN well w ON c.well_id = w.id WHERE w.plate_id = p.id),
                    (SELECT COUNT(*) FROM plate_quality q WHERE q.plate_id = p.id)
               FROM plate p",
        )
        .unwrap();
    let plates: Vec<PlateRows> = stmt
        .query_map([], |r| {
            Ok(PlateRows {
                label: r.get(0)?,
                wells: r.get(1)?,
                channels: r.get(2)?,
                traces: r.get(3)?,
                quality_reports: r.get(4)?,
            })
        })
        .unwrap()
        .map(Result::unwrap)
        .collect();
    for p in plates {
        let label = &p.label;
        let want = expected
            .iter()
            .find(|e| e.label == p.label)
            .unwrap_or_else(|| panic!("unexpected plate {label}"));
        assert_eq!(p.wells as usize, want.wells, "{label}: partial plate");
        assert!(
            p.channels > 0 && p.channels % p.wells == 0,
            "{label}: {} channels",
            p.channels
        );
        assert_eq!(p.traces, p.channels, "{label}: channels without traces");
        assert_eq!(p.quality_reports, 1, "{label}: no quality report");
    }
}

fn sidecar(ws: &Path, suffix: &str) -> PathBuf {
    let mut s = ws.as_os_str().to_owned();
    s.push(suffix);
    PathBuf::from(s)
}
