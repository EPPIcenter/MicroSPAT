//! Method registry: name → typed handler, plus the metadata the TypeScript
//! generator needs. Adapters only ever see `dispatch(name, Value) -> Value`.
//!
//! A handler is a plain function `fn(&Engine, P) -> Result<R>` with
//! `P: Deserialize + TS` and `R: Serialize + TS`. Registering it records its
//! kind, the `changed` entities it may emit (documentation and a test check),
//! and how to export `P` and `R` to TypeScript.

use crate::error::{ErrorCode, Result, RpcError};
use crate::events::entity;
use crate::Engine;
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;
use ts_rs::{Config, ExportError, TypeVisitor, TS};

/// How a method behaves, for docs and the generated client.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MethodKind {
    /// Reads only; emits nothing.
    Query,
    /// Changes data and emits `changed` for its entities.
    Mutation,
    /// Runs as a background task (emits `task` events), then returns its result.
    Task,
}

/// Static description of a registered method.
#[derive(Clone)]
pub struct MethodInfo {
    pub name: &'static str,
    pub doc: &'static str,
    pub kind: MethodKind,
    /// Entities this method may announce in `changed` events. Includes
    /// `workspace` whenever it touches an entity counted in `get_workspace_info`,
    /// and `projects` whenever it touches an input of project results.
    pub changes: Vec<&'static str>,
    pub(crate) params_ts: fn(&Config) -> String,
    pub(crate) result_ts: fn(&Config) -> String,
    pub(crate) export: fn(&Config) -> std::result::Result<(), ExportError>,
}

impl MethodInfo {
    /// TypeScript type of the params (`null` for none).
    pub fn params_type(&self, cfg: &Config) -> String {
        (self.params_ts)(cfg)
    }
    /// TypeScript type of the result.
    pub fn result_type(&self, cfg: &Config) -> String {
        (self.result_ts)(cfg)
    }
    /// Exports the params and result types (and their dependencies) to `cfg.out_dir()`.
    pub fn export_types(&self, cfg: &Config) -> std::result::Result<(), ExportError> {
        (self.export)(cfg)
    }
}

type Handler = Box<dyn Fn(&Engine, Value) -> Result<Value> + Send + Sync>;

/// All methods, by name.
#[derive(Default)]
pub struct Registry {
    methods: BTreeMap<&'static str, (MethodInfo, Handler)>,
}

fn ts_name<T: TS>(cfg: &Config) -> String {
    T::name(cfg)
}

/// Exports every exportable type reachable from `T`.
struct Exporter<'a> {
    cfg: &'a Config,
    error: Option<ExportError>,
}

impl TypeVisitor for Exporter<'_> {
    fn visit<T: TS + 'static + ?Sized>(&mut self) {
        if self.error.is_some() {
            return;
        }
        if T::output_path().is_some() {
            if let Err(e) = T::export_all(self.cfg) {
                self.error = Some(e);
            }
        } else {
            T::visit_generics(self);
            T::visit_dependencies(self);
        }
    }
}

fn export_pair<P: TS + 'static, R: TS + 'static>(
    cfg: &Config,
) -> std::result::Result<(), ExportError> {
    let mut v = Exporter { cfg, error: None };
    v.visit::<P>();
    v.visit::<R>();
    v.error.map_or(Ok(()), Err)
}

fn parse_params<P: DeserializeOwned>(method: &str, params: Value) -> Result<P> {
    let was_null = params.is_null();
    match serde_json::from_value::<P>(params) {
        Ok(p) => Ok(p),
        // Methods whose params are all optional also accept a missing body.
        Err(e) if was_null => serde_json::from_value::<P>(Value::Object(Default::default()))
            .map_err(|_| RpcError::invalid(format!("Invalid parameters for {method}: {e}"))),
        Err(e) => Err(RpcError::invalid(format!(
            "Invalid parameters for {method}: {e}"
        ))),
    }
}

impl Registry {
    fn add<P, R>(
        &mut self,
        name: &'static str,
        kind: MethodKind,
        changes: &'static [&'static str],
        doc: &'static str,
        f: fn(&Engine, P) -> Result<R>,
    ) where
        P: DeserializeOwned + TS + 'static,
        R: Serialize + TS + 'static,
    {
        // The workspace menu shows counts; any change to a counted entity refreshes them.
        let counts_change = kind != MethodKind::Query
            && !changes.contains(&entity::WORKSPACE)
            && changes.iter().any(|c| entity::COUNTED.contains(c));
        // Project staleness is derived from these inputs; any change to one
        // can change what the project screens show.
        let inputs_change = kind != MethodKind::Query
            && !changes.contains(&entity::PROJECTS)
            && changes.iter().any(|c| entity::PROJECT_INPUTS.contains(c));
        let mut all = changes.to_vec();
        if counts_change {
            all.push(entity::WORKSPACE);
        }
        if inputs_change {
            all.push(entity::PROJECTS);
        }
        let info = MethodInfo {
            name,
            doc,
            kind,
            changes: all,
            params_ts: ts_name::<P>,
            result_ts: ts_name::<R>,
            export: export_pair::<P, R>,
        };
        let handler: Handler = Box::new(move |engine, params| {
            let p = parse_params::<P>(name, params)?;
            let r = f(engine, p);
            if counts_change {
                // Also after a failure: a task may have committed part of its work.
                engine.changed(entity::WORKSPACE, None);
            }
            if inputs_change {
                engine.changed(entity::PROJECTS, None);
            }
            Ok(serde_json::to_value(r?)?)
        });
        assert!(
            self.methods.insert(name, (info, handler)).is_none(),
            "method {name} registered twice"
        );
    }

    /// Registers a read-only method.
    pub fn query<P, R>(
        &mut self,
        name: &'static str,
        doc: &'static str,
        f: fn(&Engine, P) -> Result<R>,
    ) where
        P: DeserializeOwned + TS + 'static,
        R: Serialize + TS + 'static,
    {
        self.add(name, MethodKind::Query, &[], doc, f)
    }

    /// Registers a method that changes `changes` entities.
    pub fn mutation<P, R>(
        &mut self,
        name: &'static str,
        changes: &'static [&'static str],
        doc: &'static str,
        f: fn(&Engine, P) -> Result<R>,
    ) where
        P: DeserializeOwned + TS + 'static,
        R: Serialize + TS + 'static,
    {
        self.add(name, MethodKind::Mutation, changes, doc, f)
    }

    /// Registers a method whose handler runs a background task (see [`Engine::run_task`]).
    pub fn task<P, R>(
        &mut self,
        name: &'static str,
        changes: &'static [&'static str],
        doc: &'static str,
        f: fn(&Engine, P) -> Result<R>,
    ) where
        P: DeserializeOwned + TS + 'static,
        R: Serialize + TS + 'static,
    {
        self.add(name, MethodKind::Task, changes, doc, f)
    }

    pub(crate) fn call(&self, engine: &Engine, method: &str, params: Value) -> Result<Value> {
        let (_, handler) = self.methods.get(method).ok_or_else(|| {
            RpcError::new(
                ErrorCode::UnknownMethod,
                format!("Unknown method \"{method}\""),
            )
        })?;
        handler(engine, params)
    }

    /// Metadata of every method, sorted by name.
    pub fn infos(&self) -> impl Iterator<Item = &MethodInfo> {
        self.methods.values().map(|(i, _)| i)
    }

    /// Metadata of one method.
    pub fn info(&self, name: &str) -> Option<&MethodInfo> {
        self.methods.get(name).map(|(i, _)| i)
    }
}
