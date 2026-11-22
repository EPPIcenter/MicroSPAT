//! Durable file writes: a crash or power cut leaves either the old file or
//! the new one at the destination, never a partial file (with the
//! exceptions named on [`write_atomic`]).

use std::fs::{self, File, Metadata, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

/// A temp file of [`write_atomic`] this old was left by a crash.
const STALE_TEMP_AGE: Duration = Duration::from_secs(3600);

/// Replaces `path` with `contents`. The data goes to a temp file in the same
/// directory, is flushed to disk, and is renamed over `path`.
///
/// It refuses what a plain write would refuse: a file this process cannot
/// open for writing (read-only, or someone else's). A symlink at `path` is
/// followed, so the file it points to is replaced, not the link. Two cases
/// are written in place instead, which a crash can leave partly written: a
/// hard-linked file (a rename would split it from its other names), and a
/// file in a folder where this process cannot create the temp file.
pub(crate) fn write_atomic(path: &Path, contents: &[u8]) -> io::Result<()> {
    let target = match fs::symlink_metadata(path) {
        Ok(m) if m.file_type().is_symlink() => dunce::canonicalize(path)?,
        _ => path.to_path_buf(),
    };
    let existing = fs::metadata(&target).ok();
    if let Some(m) = &existing {
        OpenOptions::new().write(true).open(&target)?;
        if hard_linked(m) {
            return write_in_place(&target, contents);
        }
    }
    remove_stale_temps(&target);
    let tmp = temp_path(&target);
    // `create_new` gives the file the process's default permissions (umask).
    let file = match OpenOptions::new().write(true).create_new(true).open(&tmp) {
        Ok(f) => f,
        Err(e) if e.kind() == io::ErrorKind::PermissionDenied && existing.is_some() => {
            return write_in_place(&target, contents);
        }
        Err(e) => return Err(e),
    };
    let written = replace_with(file, &tmp, &target, existing.as_ref(), contents);
    if written.is_err() {
        let _ = fs::remove_file(&tmp);
        return written;
    }
    sync_dir(parent_dir(&target));
    Ok(())
}

/// Fills the temp file, flushes it, and renames it over `target`.
fn replace_with(
    mut file: File,
    tmp: &Path,
    target: &Path,
    existing: Option<&Metadata>,
    contents: &[u8],
) -> io::Result<()> {
    if let Some(m) = existing {
        // Keep the replaced file's mode; best effort.
        let _ = file.set_permissions(m.permissions());
    }
    file.write_all(contents)?;
    file.sync_all()?;
    drop(file);
    rename_with_retry(tmp, target)
}

fn write_in_place(path: &Path, contents: &[u8]) -> io::Result<()> {
    let mut f = OpenOptions::new().write(true).truncate(true).open(path)?;
    f.write_all(contents)?;
    f.sync_all()
}

#[cfg(unix)]
fn hard_linked(m: &Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    m.nlink() > 1
}

#[cfg(not(unix))]
fn hard_linked(_: &Metadata) -> bool {
    false
}

/// Flushes a file's contents to disk.
pub(crate) fn sync_file(path: &Path) -> io::Result<()> {
    // Write access: Windows' FlushFileBuffers refuses a read-only handle.
    OpenOptions::new().write(true).open(path)?.sync_all()
}

/// Flushes a directory's entries (a rename into it) to disk. Best effort, and
/// only on Unix: Windows cannot open a directory as a file, and NTFS journals
/// renames itself.
pub(crate) fn sync_dir(dir: &Path) {
    #[cfg(unix)]
    if let Ok(d) = fs::File::open(dir) {
        let _ = d.sync_all();
    }
    #[cfg(not(unix))]
    let _ = dir;
}

/// The directory holding `path` (`.` for a bare file name).
pub(crate) fn parent_dir(path: &Path) -> &Path {
    path.parent()
        .filter(|d| !d.as_os_str().is_empty())
        .unwrap_or(Path::new("."))
}

/// A unique hidden name next to `path`: `.<name>.<pid>-<n>.tmp`.
fn temp_path(path: &Path) -> PathBuf {
    static SEQ: AtomicU64 = AtomicU64::new(0);
    parent_dir(path).join(format!(
        ".{}.{}-{}.tmp",
        file_name(path),
        std::process::id(),
        SEQ.fetch_add(1, Ordering::Relaxed)
    ))
}

/// Removes temp files of [`temp_path`] for `path` that a crash left behind.
fn remove_stale_temps(path: &Path) {
    let prefix = format!(".{}.", file_name(path));
    let Ok(entries) = fs::read_dir(parent_dir(path)) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(middle) = name
            .to_str()
            .and_then(|n| n.strip_prefix(&prefix))
            .and_then(|n| n.strip_suffix(".tmp"))
        else {
            continue;
        };
        let ours = middle.split_once('-').is_some_and(|(pid, n)| {
            [pid, n]
                .iter()
                .all(|s| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()))
        });
        let stale = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.elapsed().ok())
            .is_some_and(|age| age >= STALE_TEMP_AGE);
        if ours && stale {
            let _ = fs::remove_file(entry.path());
        }
    }
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Renames, retrying briefly when the file is locked. On Windows a virus
/// scanner or a sync client (OneDrive) often holds a just-closed file for a
/// moment, and `rename` then fails with a sharing violation.
pub(crate) fn rename_with_retry(from: &Path, to: &Path) -> io::Result<()> {
    let mut wait = std::time::Duration::from_millis(40);
    for _ in 0..6 {
        match fs::rename(from, to) {
            Err(e) if e.kind() == io::ErrorKind::PermissionDenied => {
                std::thread::sleep(wait);
                wait *= 2;
            }
            other => return other,
        }
    }
    fs::rename(from, to)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_the_file_and_leaves_no_temp_file() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("out.csv");
        write_atomic(&p, b"old").unwrap();
        write_atomic(&p, b"new").unwrap();
        assert_eq!(fs::read(&p).unwrap(), b"new");
        let names: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name())
            .collect();
        assert_eq!(names, ["out.csv"]);
    }

    #[test]
    fn refuses_a_read_only_file_and_keeps_it() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("locked.csv");
        fs::write(&p, b"keep").unwrap();
        let mut perms = fs::metadata(&p).unwrap().permissions();
        perms.set_readonly(true);
        fs::set_permissions(&p, perms.clone()).unwrap();
        let err = write_atomic(&p, b"new").unwrap_err();
        assert_eq!(err.kind(), io::ErrorKind::PermissionDenied);
        assert_eq!(fs::read(&p).unwrap(), b"keep");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
        #[allow(clippy::permissions_set_readonly_false)]
        perms.set_readonly(false);
        fs::set_permissions(&p, perms).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn follows_a_symlink_and_keeps_the_mode() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let real = dir.path().join("real.csv");
        let link = dir.path().join("link.csv");
        fs::write(&real, b"old").unwrap();
        fs::set_permissions(&real, fs::Permissions::from_mode(0o640)).unwrap();
        std::os::unix::fs::symlink(&real, &link).unwrap();
        write_atomic(&link, b"new").unwrap();
        assert!(fs::symlink_metadata(&link)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(fs::read(&real).unwrap(), b"new");
        assert_eq!(
            fs::metadata(&real).unwrap().permissions().mode() & 0o777,
            0o640
        );
    }

    #[test]
    fn a_failed_write_leaves_no_temp_file() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("taken");
        fs::create_dir(&p).unwrap();
        assert!(write_atomic(&p, b"x").is_err());
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[test]
    fn removes_only_stale_temp_files_of_the_same_file() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("out.csv");
        let old = std::time::SystemTime::now() - STALE_TEMP_AGE * 2;
        let make = |name: &str, aged: bool| {
            let f = File::create(dir.path().join(name)).unwrap();
            if aged {
                f.set_modified(old).unwrap();
            }
        };
        make(".out.csv.123-4.tmp", true); // stale: removed
        make(".out.csv.123-5.tmp", false); // another write in progress: kept
        make(".out.csv.backup.tmp", true); // not ours: kept
        make(".other.csv.123-4.tmp", true); // another file's: kept
        write_atomic(&p, b"new").unwrap();
        let mut names: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        names.sort();
        assert_eq!(
            names,
            [
                ".other.csv.123-4.tmp",
                ".out.csv.123-5.tmp",
                ".out.csv.backup.tmp",
                "out.csv"
            ]
        );
    }

    #[cfg(unix)]
    #[test]
    fn writes_a_hard_linked_file_in_place() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a.csv");
        let b = dir.path().join("b.csv");
        fs::write(&a, b"old").unwrap();
        fs::hard_link(&a, &b).unwrap();
        write_atomic(&a, b"new").unwrap();
        assert_eq!(fs::read(&b).unwrap(), b"new");
    }

    #[cfg(unix)]
    #[test]
    fn writes_in_place_where_the_folder_takes_no_new_files() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let sub = dir.path().join("shared");
        fs::create_dir(&sub).unwrap();
        let p = sub.join("out.csv");
        fs::write(&p, b"old").unwrap();
        fs::set_permissions(&sub, fs::Permissions::from_mode(0o555)).unwrap();
        let result = write_atomic(&p, b"new");
        fs::set_permissions(&sub, fs::Permissions::from_mode(0o755)).unwrap();
        result.unwrap();
        assert_eq!(fs::read(&p).unwrap(), b"new");
    }
}
