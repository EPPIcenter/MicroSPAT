//! The one error type every RPC method returns: a stable machine-readable
//! code plus a message written for a toast.

use serde::Serialize;
use ts_rs::TS;

/// Stable error codes. The UI may branch on these; never rename one.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    /// The id or label does not exist.
    NotFound,
    /// Bad parameters or bad input data (CSV, FSA, ladder spec, ...).
    Invalid,
    /// Would duplicate something unique (label, barcode, plate already imported).
    Conflict,
    /// Cannot delete or change: something else depends on it.
    InUse,
    /// No workspace is open.
    NoWorkspace,
    /// The method name is not registered.
    UnknownMethod,
    /// Reading or writing a file failed.
    Io,
    /// A bug or an unexpected database failure.
    Internal,
}

impl ErrorCode {
    /// The wire form, e.g. `not_found`.
    pub fn as_str(self) -> &'static str {
        match self {
            ErrorCode::NotFound => "not_found",
            ErrorCode::Invalid => "invalid",
            ErrorCode::Conflict => "conflict",
            ErrorCode::InUse => "in_use",
            ErrorCode::NoWorkspace => "no_workspace",
            ErrorCode::UnknownMethod => "unknown_method",
            ErrorCode::Io => "io",
            ErrorCode::Internal => "internal",
        }
    }
}

/// Error returned by [`crate::Engine::dispatch`] and by every handler.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS, thiserror::Error)]
#[error("{message}")]
pub struct RpcError {
    pub code: ErrorCode,
    pub message: String,
}

/// Engine-wide result type.
pub type Result<T, E = RpcError> = std::result::Result<T, E>;

impl RpcError {
    /// An error with the given code and message.
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        RpcError {
            code,
            message: message.into(),
        }
    }
    /// `not_found`.
    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::NotFound, message)
    }
    /// `invalid`.
    pub fn invalid(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::Invalid, message)
    }
    /// `conflict`.
    pub fn conflict(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::Conflict, message)
    }
    /// `in_use`.
    pub fn in_use(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::InUse, message)
    }
    /// `io`.
    pub fn io(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::Io, message)
    }
    /// `internal`.
    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::Internal, message)
    }
}

impl From<rusqlite::Error> for RpcError {
    fn from(e: rusqlite::Error) -> Self {
        RpcError::internal(format!("Database error: {e}"))
    }
}

impl From<serde_json::Error> for RpcError {
    fn from(e: serde_json::Error) -> Self {
        RpcError::internal(format!("Serialization error: {e}"))
    }
}

/// Attach a path to an I/O error.
pub fn io_err(path: &std::path::Path, e: std::io::Error) -> RpcError {
    RpcError::io(format!("{}: {e}", path.display()))
}

/// Shorthand for "X not found" lookups on `Option`.
pub trait OrNotFound<T> {
    /// Turn `None` into a `not_found` error with the given message.
    fn or_not_found(self, what: impl FnOnce() -> String) -> Result<T>;
}

impl<T> OrNotFound<T> for Option<T> {
    fn or_not_found(self, what: impl FnOnce() -> String) -> Result<T> {
        self.ok_or_else(|| RpcError::not_found(what()))
    }
}
