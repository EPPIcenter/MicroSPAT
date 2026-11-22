//! The workspace file: one SQLite database (`*.microspat`).
//!
//! **Connections.** One writer connection behind a mutex and a small pool of
//! read-only connections. The file runs in WAL mode while open, so readers
//! never wait for a writer: a plate import holds the writer only for its short
//! per-plate commit (parsing and sizing happen before, outside any lock), and
//! list/detail reads proceed in parallel on their own snapshot.
//!
//! **One self-contained file.** WAL needs `-wal`/`-shm` sidecars while open.
//! After every write transaction the WAL is checkpointed (passive), and when
//! the workspace closes it is checkpointed fully and switched back to
//! rollback-journal mode, which removes the sidecars, so a closed workspace
//! is a single plain SQLite file. "Save as" uses `VACUUM INTO`, which writes a
//! compact, consistent copy from a read snapshot (safe while other work runs),
//! and the copy is set to rollback-journal mode before it is moved into place.

pub mod schema;

use crate::error::{io_err, Result, RpcError};
use rusqlite::{Connection, OpenFlags, OptionalExtension, Transaction, TransactionBehavior};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

/// Idle read connections kept for reuse.
const MAX_IDLE_READERS: usize = 8;

/// Contamination limit (RFU) for negative controls, as in the old `config.py`.
pub const DEFAULT_CONTAMINATION_LIMIT: i64 = 500;

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    // A panic inside a closure rolls its transaction back; the connection is still usable.
    m.lock().unwrap_or_else(|p| p.into_inner())
}

/// An open workspace file.
pub struct Workspace {
    path: PathBuf,
    untitled: bool,
    writer: Mutex<Connection>,
    readers: Mutex<Vec<Connection>>,
}

impl std::fmt::Debug for Workspace {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Workspace")
            .field("path", &self.path)
            .finish()
    }
}

fn configure_writer(conn: &Connection) -> rusqlite::Result<()> {
    conn.busy_timeout(std::time::Duration::from_secs(10))?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;
         PRAGMA cache_size = -65536;",
    )?;
    Ok(())
}

fn sqlite_err(path: &Path, e: rusqlite::Error) -> RpcError {
    match e {
        rusqlite::Error::SqliteFailure(f, _)
            if matches!(
                f.code,
                rusqlite::ErrorCode::NotADatabase | rusqlite::ErrorCode::DatabaseCorrupt
            ) =>
        {
            RpcError::invalid(format!(
                "{} is not a MicroSPAT workspace (not a SQLite database)",
                path.display()
            ))
        }
        e => RpcError::io(format!("Cannot open {}: {e}", path.display())),
    }
}

impl Workspace {
    /// Creates a new, empty workspace file. Fails if the file exists.
    pub fn create(path: &Path, untitled: bool) -> Result<Workspace> {
        if path.exists() {
            return Err(RpcError::conflict(format!(
                "{} already exists. Open it instead, or choose another name.",
                path.display()
            )));
        }
        if let Some(dir) = path.parent().filter(|d| !d.as_os_str().is_empty()) {
            std::fs::create_dir_all(dir).map_err(|e| io_err(dir, e))?;
        }
        let ws = Self::open_inner(path, untitled, true)?;
        ws.write(|tx| {
            crate::api::ladders::seed_ladders(tx)?;
            Ok(())
        })?;
        Ok(ws)
    }

    /// Opens an existing workspace, migrating it to the current schema.
    pub fn open(path: &Path) -> Result<Workspace> {
        if !path.is_file() {
            return Err(RpcError::not_found(format!(
                "Workspace file {} does not exist",
                path.display()
            )));
        }
        Self::open_inner(path, false, false)
    }

    fn open_inner(path: &Path, untitled: bool, new: bool) -> Result<Workspace> {
        let mut conn = Connection::open(path).map_err(|e| sqlite_err(path, e))?;
        // Validate before switching journal modes, so a foreign file is left untouched.
        let app_id: i32 = conn
            .query_row("PRAGMA application_id", [], |r| r.get(0))
            .map_err(|e| sqlite_err(path, e))?;
        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        let has_tables: bool = conn.query_row(
            "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table')",
            [],
            |r| r.get(0),
        )?;
        if app_id != schema::APPLICATION_ID && (has_tables || !new) {
            return Err(RpcError::invalid(format!(
                "{} is not a MicroSPAT workspace",
                path.display()
            )));
        }
        if version < 0 {
            return Err(RpcError::invalid(format!(
                "{} is not a valid MicroSPAT workspace (invalid schema version {version})",
                path.display()
            )));
        }
        if version > schema::SCHEMA_VERSION {
            return Err(RpcError::invalid(format!(
                "{} was written by a newer MicroSPAT (schema {version}, this version reads up to {}). Update MicroSPAT to open it.",
                path.display(),
                schema::SCHEMA_VERSION
            )));
        }
        configure_writer(&conn).map_err(|e| sqlite_err(path, e))?;
        migrate(&mut conn, version)?;
        Ok(Workspace {
            path: path.to_path_buf(),
            untitled,
            writer: Mutex::new(conn),
            readers: Mutex::new(Vec::new()),
        })
    }

    /// Path of the database file.
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// True for a workspace created without a path (lives in the temp dir until saved).
    pub fn is_untitled(&self) -> bool {
        self.untitled
    }

    /// Display name: the file stem, or "Untitled workspace".
    pub fn name(&self) -> String {
        if self.untitled {
            return "Untitled workspace".into();
        }
        self.path
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Workspace".into())
    }

    fn open_reader(&self) -> Result<Connection> {
        let conn = Connection::open_with_flags(
            &self.path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(|e| sqlite_err(&self.path, e))?;
        conn.busy_timeout(std::time::Duration::from_secs(10))?;
        conn.execute_batch("PRAGMA cache_size = -32768;")?;
        Ok(conn)
    }

    /// Runs `f` on a read-only snapshot. Never waits for the writer.
    pub fn read<T>(&self, f: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
        let pooled = lock(&self.readers).pop();
        let conn = match pooled {
            Some(c) => c,
            None => self.open_reader()?,
        };
        let result = {
            let tx = conn.unchecked_transaction()?;
            f(&tx)
        };
        let mut pool = lock(&self.readers);
        if pool.len() < MAX_IDLE_READERS {
            pool.push(conn);
        }
        result
    }

    /// Runs `f` in one immediate write transaction; commits when it returns `Ok`.
    pub fn write<T>(&self, f: impl FnOnce(&Transaction) -> Result<T>) -> Result<T> {
        let mut conn = lock(&self.writer);
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let out = f(&tx)?;
        tx.commit()?;
        // Keep the main file current so it is usable even while open.
        let _ = conn.query_row("PRAGMA wal_checkpoint(PASSIVE)", [], |_| Ok(()));
        Ok(out)
    }

    /// Writes a compact standalone copy to `dest` (replacing it if present).
    pub fn save_copy(&self, dest: &Path) -> Result<()> {
        if matches!((self.path.canonicalize(), dest.canonicalize()), (Ok(a), Ok(b)) if a == b) {
            return Err(RpcError::invalid(
                "Choose a different path: this file is already the open workspace.",
            ));
        }
        let dir = dest
            .parent()
            .filter(|d| !d.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        std::fs::create_dir_all(dir).map_err(|e| io_err(dir, e))?;
        let tmp = tempfile::Builder::new()
            .prefix(".microspat-save-")
            .suffix(".tmp")
            .tempfile_in(dir)
            .map_err(|e| io_err(dir, e))?
            .into_temp_path();
        // VACUUM INTO refuses to overwrite, and the temp file exists (empty).
        std::fs::remove_file(&tmp).map_err(|e| io_err(&tmp, e))?;
        let tmp_str = tmp.to_str().ok_or_else(|| {
            RpcError::io(format!("Cannot write {}: non-UTF-8 path", dest.display()))
        })?;
        // VACUUM cannot run inside a transaction, so not through `read`.
        self.open_reader()?
            .execute("VACUUM INTO ?1", [tmp_str])
            .map_err(|e| RpcError::io(format!("Cannot write {}: {e}", dest.display())))?;
        {
            let copy = Connection::open(&tmp).map_err(|e| sqlite_err(&tmp, e))?;
            copy.query_row("PRAGMA journal_mode = DELETE", [], |_| Ok(()))?;
        }
        rename_with_retry(&tmp, dest).map_err(|e| io_err(dest, e))?;
        // The rename consumed the file; keep TempPath from deleting dest's old name.
        let _ = tmp.keep();
        // Remove any stale sidecars left by an earlier file at `dest` after the
        // replacement is in place, so they cannot be replayed into the new file.
        for suffix in ["-wal", "-shm", "-journal"] {
            let mut side = dest.as_os_str().to_owned();
            side.push(suffix);
            let _ = std::fs::remove_file(PathBuf::from(side));
        }
        Ok(())
    }

    /// Size of the database file in bytes (excluding a live WAL).
    pub fn file_size(&self) -> u64 {
        std::fs::metadata(&self.path).map(|m| m.len()).unwrap_or(0)
    }
}

impl Drop for Workspace {
    fn drop(&mut self) {
        lock(&self.readers).clear();
        let conn = lock(&self.writer);
        // Fold the WAL into the main file and drop the sidecars: a closed
        // workspace is one plain file that can be copied or emailed.
        let _ = conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_| Ok(()));
        let _ = conn.query_row("PRAGMA journal_mode = DELETE", [], |_| Ok(()));
    }
}

fn migrate(conn: &mut Connection, from: i64) -> Result<()> {
    if from >= schema::SCHEMA_VERSION {
        return Ok(());
    }
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    for (k, sql) in schema::MIGRATIONS.iter().enumerate().skip(from as usize) {
        tx.execute_batch(sql)
            .map_err(|e| RpcError::internal(format!("Migration {} failed: {e}", k + 1)))?;
    }
    if from == 0 {
        tx.execute(
            "INSERT INTO meta (key, value) VALUES ('created_at', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                ('created_by', ?1), ('contamination_limit', ?2)",
            rusqlite::params![
                crate::APP_VERSION,
                DEFAULT_CONTAMINATION_LIMIT.to_string()
            ],
        )?;
    }
    tx.execute_batch(&format!(
        "PRAGMA application_id = {}; PRAGMA user_version = {};",
        schema::APPLICATION_ID,
        schema::SCHEMA_VERSION
    ))?;
    tx.commit()?;
    Ok(())
}

/// Reads a `meta` value.
pub fn meta(conn: &Connection, key: &str) -> Result<Option<String>> {
    Ok(conn
        .query_row("SELECT value FROM meta WHERE key = ?1", [key], |r| r.get(0))
        .optional()?)
}

/// Contamination limit (RFU) of this workspace.
pub fn contamination_limit(conn: &Connection) -> Result<i64> {
    Ok(meta(conn, "contamination_limit")?
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_CONTAMINATION_LIMIT))
}

/// Plate-quality limits of this workspace.
pub fn quality_limits(conn: &Connection) -> Result<microspat_core::quality::QualityLimits> {
    Ok(meta(conn, "quality_limits")?
        .and_then(|v| serde_json::from_str(&v).ok())
        .unwrap_or_default())
}

/// Current schema version of an open connection.
pub fn schema_version(conn: &Connection) -> Result<i64> {
    Ok(conn.query_row("PRAGMA user_version", [], |r| r.get(0))?)
}

/// Renames, retrying briefly when the file is locked. On Windows a virus
/// scanner or a sync client (OneDrive) often holds a just-closed file for a
/// moment, and `rename` then fails with a sharing violation.
fn rename_with_retry(from: &Path, to: &Path) -> std::io::Result<()> {
    let mut wait = std::time::Duration::from_millis(40);
    for _ in 0..6 {
        match std::fs::rename(from, to) {
            Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => {
                std::thread::sleep(wait);
                wait *= 2;
            }
            other => return other,
        }
    }
    std::fs::rename(from, to)
}
