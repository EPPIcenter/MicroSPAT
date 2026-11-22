# microspat-engine

The layer between the analysis library (`microspat-core`) and the UI: the workspace file, the services over it, and one transport-agnostic RPC surface with an event stream. The HTTP server (`crates/microspat-server`) and the Tauri shell are thin adapters over it.

## Architecture

```text
adapter (HTTP / Tauri)
    │  engine.dispatch(method, serde_json::Value) -> Result<Value, RpcError { code, message }>
    │  engine.subscribe() -> Receiver<AppEvent>          (task progress, `changed`)
    ▼
Engine ── Registry (rpc.rs)    name → typed handler fn(&Engine, P) -> Result<R>
   │        handlers: src/api/<entity>.rs, each with a `register` fn
   ├── Workspace (db/)         one SQLite file: writer mutex + read-only connection pool, migrations
   ├── EventBus (events.rs)    fan-out of AppEvent to subscribers (std mpsc, no async runtime)
   └── Tasks (tasks.rs)        background work on its own thread, progress events
```

| Module | Role |
|---|---|
| `db/mod.rs`, `db/schema.rs` | Open/create/save-as, WAL handling, versioned migrations |
| `codec.rs` | Trace compression (delta + zigzag + per-block bit packing) |
| `sizing.rs` | Ladder fit per well, base sizes rebuilt from stored peaks, signal summaries |
| `quality.rs` | Plate quality reports: measured at import and re-sizing, negative controls refreshed on plate-map and designation changes, stored per plate (see Plate quality) |
| `locus_runs.rs` | Bulk load of every run of a locus (traces + base sizes) for locus analysis |
| `projects/` | Project model and locus parameters (`mod.rs`), scan → filter pipeline (`pipeline.rs`), per-kind locus analysis (`analysis.rs`), staleness fingerprints (`inputs.rs`) |
| `fingerprint.rs` | Stable FNV-1a content hashes used for staleness |
| `scan_cache.rs` | In-memory, content-keyed cache of scanned peak candidates |
| `peak_codec.rs` | Compact binary storage of annotated peaks (calls) and bin-plot scatter |
| `api/*.rs` | RPC methods: `workspace`, `ladders`, `loci` (+ locus sets), `samples`, `plates` (+ wells, traces), `import`, `plate_map`, `demo`, `settings`, `projects`, `bins`, `artifacts`, `controls`, `calls`, `exports`, `quality` |
| `bindings.rs`, `bin/gen-bindings.rs` | TypeScript generation |

## Workspace file

One SQLite database (`*.microspat`, bundled SQLite, `PRAGMA application_id = 'MSP3'`).

- **Concurrency.** WAL mode while open. Writes go through one connection behind a mutex, in short `IMMEDIATE` transactions. Reads use a pool of read-only connections on their own snapshot and never wait for the writer. A plate import parses, sizes and compresses outside any lock and holds the writer only for its per-plate commit.
- **One file.** After every write the WAL is checkpointed (passive). On close it is checkpointed fully and the file is switched back to rollback-journal mode, which removes the `-wal`/`-shm` sidecars. `save_workspace_as` uses `VACUUM INTO` (a consistent, compact copy from a snapshot), sets the copy to rollback-journal mode, and moves it into place. Adapters must call `engine.close_workspace()` on shutdown.
- **Traces** are stored in their own table (`trace`, one blob per channel) so channel and well listings never touch trace pages. The codec is about 2.4x smaller than raw `i16` and decodes a 9,000-point trace in about 10 µs.
- **Base sizes are recomputed, not stored.** A well's fit is stored as its matched ladder peaks (`ladder_peak_indices`, `ladder_peak_sizes`, about 20 pairs). The per-point sizes are a pure function of those, and storing them (36–72 KB per well) would cost more than all of the well's traces. See `sizing.rs`.
- **JSON columns** hold structs that core owns and extends (`ladder.spec` is a `LadderSpec`; peak index lists). They are read with serde defaults, so new core fields need no migration.

### Tables (schema 1)

| Table | Key columns |
|---|---|
| `meta` | key/value: `created_at`, `created_by`, `contamination_limit` (500 RFU), `quality_limits` (JSON `QualityLimits`) |
| `ladder` | `label` (unique, case-insensitive), `spec` (JSON `LadderSpec`) |
| `locus` | `label` (unique), `color`, `min_base_length`, `max_base_length`, `nucleotide_repeat_length` |
| `locus_set`, `locus_set_member` | label; (set, locus) pairs |
| `sample` | `barcode` (unique, case-insensitive), `designation` (`sample`, `negative_control`, `positive_control`) |
| `plate` | `label`, `content_hash` (unique: SHA-256 of the sorted FSA hashes), `run_date`, `instrument`, `instrument_model`, `plate_size`, `ladder_id`, `source`, run-condition traces (codec blobs) |
| `well` | `plate_id`, `label` (`A01`), `sample_name` (from the FSA), `fsa_hash` (unique), `trace_len`, ladder fit (peak indices, sizes, `sizing_quality`; NULL quality = failed, with `sizing_error` saying why; next to a quality, `sizing_error` is a note on the fit, today only why its assignment is ambiguous), `manual_ladder`, `offscale_indices` |
| `channel` | `well_id`, `dye_number`, `color`, `dye_name`, `wavelength`, `max_signal` (in the sized range) |
| `trace` | `channel_id`, `data` (codec blob) |
| `run` | `channel_id`, `locus_id`, `sample_id`, `max_signal` (inside the locus range). Unique (channel, locus) |

### Tables (schema 2: projects)

| Table | Key columns |
|---|---|
| `project` | `kind` (`bin_estimator`, `artifact_estimator`, `quant_bias_estimator`, `genotyping`), `title` (unique per kind), `description`, `locus_set_id` (RESTRICT), `bin_estimator_id` / `artifact_estimator_id` / `quant_bias_estimator_id` (RESTRICT, self-references), `all_samples`, probabilistic pass: `prob_options`, `prob_fingerprint`, `prob_computed_at` |
| `project_locus` | (project, locus): `params` (JSON `LocusParams`, `{}` = defaults), last analysis: `analyzed_at`, `analysis_rev`, `fingerprint` (JSON map of input hashes), `result` (kind-specific JSON), `scatter` (bin plot, f32 pairs) |
| `project_sample` | (project, sample; sample RESTRICT), `moi` |
| `bin` | `project_id` (bin estimator), `locus_id`, `label` (unique per locus), `base_size`, `bin_buffer`, `peak_count` |
| `artifact_estimator` | one artifact class: `project_id`, `locus_id`, `label`, `artifact_distance`, `artifact_distance_buffer`, `points` and `equations` (core JSON) |
| `control`, `control_allele` | a known strain of a bin estimator (`label` unique per bin estimator); its bin per locus (`bin_id` SET NULL when the bin is deleted) |
| `control_mixture` | (project, sample, control) → `proportion`; cascades from `project_sample`, RESTRICTs the control |
| `genotype` | the call of one sample at one locus (genotyping and quant-bias projects): `reference_run_id`, `peaks` (peak_codec blob), `alleles` (JSON bin ids, any number), `failure`, `offscale`, `manual_curation`, `comment`, `reviewed_key` (schema 3; see Review state) |

Schema 4 adds `control_allele.deleted_bin_label` / `deleted_bin_size` and a `BEFORE DELETE ON bin` trigger that fills them for every control allele pointing at the bin, before the foreign key sets `bin_id` to NULL. Whatever deletes the bin (`update_locus_bins`, re-estimating bins, which drops bins whose label is gone), the control then reads "allele bin deleted" rather than "not set". Setting the allele again through `create_control` / `update_control`, to a bin or to null, clears them; `duplicate_project` copies them.

`run` is what a plate map creates and what analysis works on (core's `genotyping::Run` maps to it). It is a separate table because one channel can carry several loci of the same dye at different sizes (the demo multiplexes two loci per dye). Sizing state (good, flagged, unusable, failed) is computed when read from `sizing_quality`, the matched ladder sizes and the plate's current ladder spec, so changing the limits applies at once (`sizing.rs`, core `LadderSpec::assess`). The rules, for automatic and manual fits alike: a fit with fewer matched peaks than the ladder's sizes minus `maximum_missing_peak_count` (default 5; the old application's rule for automatic fits) is unusable whatever its quality, because leave-one-out cannot see a self-consistent fit to the wrong part of the ladder; otherwise quality above `sq_unusable_limit` is unusable and above `sq_flag_limit` flagged. The quality includes the end peaks (each predicted from its three neighbors by a quadratic), and an automatic fit drops an end peak its neighbors do not support (worse than `sq_flag_limit`), so the sized range stops short of it rather than extrapolating from a wrong peak. **Plates are fitted in two passes** (core `ladder::resolve_with_plate`, used by `import_plates` and `size_plate`): every well alone, in parallel; then each well whose assignment its own trace cannot settle (a ladder whose spacing repeats, such as evenly spaced sizes or GeneScan 600's 100 bp pattern, with peaks missing at one end: core finds a rival assignment shifted by whole fragments that costs almost the same) is fitted again against the plate's consensus, built from the wells that stand on their own (usable and unambiguous, however few). The consensus picks the candidate whose implied capillary offset and stretch match the plate's wells. `set_well_ladder_peaks` / `preview_well_ladder_peaks` without peaks do the same for one well with the plate's other stored fits. A well that stays ambiguous (imported alone, every well of the plate ambiguous, or no clear winner) is stored with a quality of at least the size difference between the rivals, so every reader treats it as unusable, and its `sizing_reason` says the assignment is ambiguous and to state the peak sizes by hand. A *run* is also unusable when its locus range reaches more than 5 bp past the well's outermost matched ladder peak on a side where the well is missing the ladder's own outermost size (sizes there would be extrapolated from a partial ladder; extrapolating past the end of the ladder itself is the same for every well and left alone). Such a well is flagged and its `sizing_reason` names the loci. Every state other than good carries a `sizing_reason`. Contamination is also computed when read: a run is contaminated when its sample is a negative control and `max_signal` exceeds `meta.contamination_limit`. Every run of that locus on that plate is then `locus_contaminated`. Changing a sample's designation therefore updates the flags immediately.

### Tables (schema 5: plate quality)

| Table | Key columns |
|---|---|
| `plate_quality` | `plate_id` (primary key, cascades with the plate), `version` (core `quality::QUALITY_VERSION` it was measured with), `computed_at`, `problems` / `warnings` / `infos` (issue counts, so `list_plates` reads them without parsing), `report` (JSON of core `quality::PlateQuality`) |

The report is one JSON document because it is read whole (the plate view and its export) and its shape is core's; only the counts the plate list needs are columns. A plate imported before schema 5 has no row until `compute_plate_quality` fills it.

### Adding a table or migration

1. Append a SQL string to `MIGRATIONS` in `db/schema.rs`. Never edit a shipped entry. The schema version is the number of entries. Opening an older file applies the missing entries in one transaction, and a newer file is refused with a clear message.
2. Use `REFERENCES … ON DELETE CASCADE` for owned children and `ON DELETE RESTRICT` for things the user must detach first. Still check in-use cases in the handler, so the error names what uses the item (see `delete_locus`).
3. Read inside `ws.read(|conn| …)` and write inside `ws.write(|tx| …)`. Keep heavy computation out of `write`: compute on a read snapshot (rayon), then write.
4. `apply_plate_map` keeps run ids for unchanged (channel, locus, sample) assignments, so attached analysis survives re-applying a corrected map. A call's `reference_run_id` is `ON DELETE SET NULL`; deleting a plate that holds reference runs is refused (see Projects).

## RPC

Names are `verb_noun` in snake_case: `list_*` (summaries), `get_*` (one item with detail), `create_*`, `update_*` (omitted fields unchanged), `delete_*`, `import_*`, or a verb for an action. Params are a JSON object, or `null` for none. Every handler returns `RpcError { code, message }`. The message is written for a toast.

| code | HTTP | meaning |
|---|---|---|
| `not_found` | 404 | id or label does not exist |
| `invalid` | 400 | bad params or input data (CSV, ladder spec, plate map) |
| `conflict` | 409 | duplicate label, barcode or plate |
| `in_use` | 409 | something depends on it; the message says what |
| `no_workspace` | 409 | no workspace open |
| `unknown_method` | 404 | |
| `io`, `internal` | 500 | |

### Adding a method

```rust
// src/api/plates.rs
#[derive(Debug, Clone, Deserialize, TS)]
pub struct RenamePlateParams { pub id: i64, pub label: String }

pub(crate) fn register(r: &mut Registry) {
    // r.query(name, doc, fn) | r.mutation(name, &[entities], doc, fn) | r.task(name, &[entities], doc, fn)
    r.mutation("rename_plate", &[PLATES], "Rename a plate.", rename);
}

fn rename(e: &Engine, p: RenamePlateParams) -> Result<PlateSummary> {
    let s = e.workspace()?.write(|tx| { /* … */ })?;
    e.changed(PLATES, Some(vec![p.id]));   // after the commit
    Ok(s)
}
```

Then regenerate the TypeScript (the `bindings` test fails until you do):

```sh
cargo run -p microspat-engine --bin gen-bindings
```

This rewrites `ui/src/api/bindings/` (one file per type, from `ts_rs`) and `ui/src/api/client.ts` (`api.<method>(params)`, the `Methods` type map, `METHOD_CHANGES`, `TASK_METHODS`). Every params, result and entity type derives `ts_rs::TS`. Use `#[serde(default)] #[ts(optional)]` for optional params. `i64` ids come out as `number`. Types that the UI needs before any method returns them can be added to the explicit list in `bindings.rs`.

### Events and entity names

`changed` events carry an entity name. UI query keys start with it, for example `['plates', id, 'wells']`. Emit with `engine.changed(entity, ids)` after the commit. Declare the entities when registering, so they appear in the generated `METHOD_CHANGES`. A test checks that every mutation declares entities. Any mutation that touches an entity counted in `get_workspace_info` (plates, samples, loci, locus sets, ladders) also emits `workspace` automatically.

| entity | covers | announced by |
|---|---|---|
| `workspace` | path, name, counts | `new_workspace`, `open_workspace`, `save_workspace_as`, and any change to a counted entity |
| `ladders` | ladders, plate counts | `create/update/delete_ladder`, `import_plates`, `size_plate` (ladder switch), `delete_plate`, demo |
| `loci` | loci, run counts, locus-set membership | `create/update/delete_locus`, `import_loci_csv`, locus-set mutations, plate maps, `delete_plate`, demo |
| `locus_sets` | locus sets | `create/update/delete_locus_set`, demo |
| `samples` | samples, run counts, sample runs | sample mutations (including the batch methods), `import_samples_csv`, plate maps, `size_plate`, `set_well_ladder_peaks`, `delete_plate`, demo |
| `plates` | plates, wells, channels, traces, runs, plate maps, contamination, quality reports | `import_plates` (one event per plate), `delete_plate`, `size_plate`, `set_well_ladder_peaks`, plate maps, `update_ladder`, `update_locus` (range), `update_sample` (designation), `update_settings`, `compute_plate_quality`, demo |
| `projects` | projects of every kind, their samples, parameters, results (bins, artifact classes, β, calls), statuses | every project mutation (ids = project ids when only that project changed; null when dependents may have changed too), and automatically every mutation that touches `plates`, `samples`, `loci`, `locus_sets` or `ladders` (staleness is derived from them) |
| `controls` | controls, their alleles, mixture counts | control mutations, `update_locus_bins` (deleted bins unset alleles), `analyze_project` (bin estimators: re-estimated bins may drop a control's bin), `set_control_mixtures`, `import_control_mixtures_csv` (when applied), `remove_project_samples` (quant-bias estimators), `duplicate_project`, `delete_project`, demo |
| `settings` | `get_settings` | `update_settings` |

Opening or creating a workspace emits every entity. Like `workspace`, `projects` is added by the registry: any mutation that declares one of the project inputs (`entity::PROJECT_INPUTS`) also declares and emits `projects`.

### Methods

| method | params → result | changes |
|---|---|---|
| `get_workspace_info` | – → `WorkspaceInfo` {path, name, counts, schema_version, app_version, file_size} | |
| `new_workspace` | {path?: string\|null} → `WorkspaceInfo` | all |
| `open_workspace` / `save_workspace_as` | {path} → `WorkspaceInfo` | all |
| `list_recent_workspaces` | – → `RecentWorkspace[]` | |
| `list_tasks` | – → `TaskInfo[]` | |
| `write_text_file` | {path, content} → null (disabled over HTTP) | |
| `load_demo_data` (task) | – → `DemoResult` | plates, samples, loci, locus_sets, ladders, projects, controls |
| `list_ladders` / `get_ladder` | – / {id} → `Ladder[]` / `Ladder` | |
| `create_ladder` | {label, spec: Partial<LadderSpec> (omitted fields take the HD ROX 400 defaults)} → `Ladder` | ladders |
| `update_ladder` | {id, label?, spec?} → `Ladder` | ladders, plates |
| `delete_ladder` | {id} → null | ladders |
| `list_loci` / `get_locus` | – / {id} → `Locus[]` / `Locus` | |
| `create_locus` | {label, color, min_base_length, max_base_length, nucleotide_repeat_length} → `Locus` | loci |
| `update_locus` | {id, …optional fields} → `Locus` | loci, plates |
| `delete_locus` | {id} → null | loci |
| `import_loci_csv` | {path? \| content?} → {created: Locus[]} | loci |
| `list_locus_sets` / `get_locus_set` | – / {id} → `LocusSet[]` / `LocusSetDetail` | |
| `create_locus_set` / `update_locus_set` | {label, locus_ids} / {id, label?, locus_ids?} → `LocusSetDetail` | locus_sets, loci |
| `delete_locus_set` | {id} → null | locus_sets, loci |
| `list_samples` / `get_sample` | – / {id} → `Sample[]` (run, plate and locus counts, `plate_labels`) / `SampleDetail` (runs by locus and plate; each run's own sizing state, and `sizing_reason?` when not good: the well's reason, or the locus lying outside the sized range, as `sizing.rs` `assess_run` words it) | |
| `create_sample` / `update_sample` | {barcode, designation?} / {id, barcode?, designation?} → `Sample` | samples (+ plates) |
| `delete_sample` | {id} → null | samples |
| `set_samples_designation` | {sample_ids, designation} → `SamplesBatchResult` {done: number[], refused: [{sample_id, barcode, reason}]} | samples (one event), plates |
| `delete_samples` | {sample_ids} → `SamplesBatchResult` (samples with runs or in projects are refused, not an error) | samples (one event) |
| `import_samples_csv` | {path? \| content?} → {created, existing} | samples |
| `import_plates` (task) | {paths: string[], ladder_id} → {plates: PlateImportOutcome[]} (an imported plate's outcome carries its quality issue counts) | plates, ladders |
| `list_plates` | – → `PlateSummary[]` (wells, sizing counts, plate map, contaminated loci, `quality`: issue counts by severity and the worst, null when not checked) | |
| `get_plate` | {id} → `PlateDetail` (every well's sizing and per-dye signal and runs, without traces) | |
| `get_plate_run_traces` | {id} → voltage, current, power, temperature | |
| `delete_plate` | {id} → null | plates, samples, loci, ladders |
| `size_plate` (task) | {id, ladder_id?} → `PlateSummary` | plates, samples, ladders |
| `get_well` | {id, traces?: bool (default true)} → `WellDetail` (dye traces, base sizes, ladder peaks with sizes, quality, `sizing_reason`, and with traces `ladder_candidates` [{index, height}]: the ladder-channel peaks the automatic fit considers) | |
| `set_well_ladder_peaks` | {id, peaks?: [{index, size}], peak_indices?: number[] \| null} → `WellDetail` (no traces). `peaks` states each peak's ladder size (validated against the ladder); `peak_indices` lets the fitter assign sizes, guided by where the plate's other usable wells put each size; neither = automatic fit (settled with the plate's other wells when the trace alone is ambiguous). Both given, or an empty list (`peaks: []`, `peak_indices: []`), is `invalid` | plates, samples |
| `preview_well_ladder_peaks` | same params → `LadderPreview` {sizing, sizing_quality, reason, peaks: [{index, size}]}; stores nothing; an impossible proposal comes back `failed` with the reason. Input errors are refused exactly as `set_well_ladder_peaks` refuses them (same `invalid` messages) | |
| `get_channel_trace` | {id} → {trace, base_sizes} | |
| `apply_plate_map` | {plate_id, path? \| content?, create_samples?, dry_run?} → `PlateMapReport` (counts, problems, and `assignments`: [{well, locus_id, locus_label, barcode, sample_id, change: new \| unchanged \| removed, creates_sample}] in well order) | plates, samples, loci |
| `clear_plate_map` | {id} → null | plates, samples, loci |
| `export_plate_map` | {id} → {filename, content} | |
| `get_plate_quality` | {id} → `PlateQualityView` {plate_id, plate_label, instrument, instrument_model, run_date, computed_at?, report: `PlateQuality` \| null, summary: `QualitySummary` \| null}. `report` is null for a plate imported before quality checks existed | |
| `compute_plate_quality` (task) | {ids?} → {plate_ids}: measures the given plates again, or (no ids) every plate without a report of the current version. One `changed: plates` event per plate, plus `projects` on completion | plates, projects |
| `export_plate_quality` | {id} → {filename, content}: one CSV row per well (capillary, sizing quality, plate error, ladder height and fade, strongest sample signal, off-scale points, tall peaks, breakdowns, copies, per dye noise SD, baseline, max signal, off-scale points; flags; titles of the issues naming the well), with the plate's ladder height, pull-up per dye pair and crosstalk per distance repeated on every row | |

| `get_settings` | – → `Settings` {contamination_limit, quality_limits} | |
| `update_settings` | {contamination_limit?, quality_limits?, reset_defaults?} → `Settings` (changing `quality_limits` immediately updates stored plate quality reports) | settings, plates, samples |

#### Projects

| method | params → result | changes |
|---|---|---|
| `list_projects` | {kind?} → `ProjectSummary[]` (links, sample/locus counts, current/stale/unanalyzed loci, probabilities status) | |
| `get_project` | {id} → `ProjectDetail` {project, loci: [{locus…, status {state, reasons, analyzed_at}, custom_params, warnings? (artifact estimators: empty model, see Empty artifact models)}], dependents, upstream_warnings} | |
| `create_project` | {kind, title, description?, locus_set_id, bin_estimator_id?, artifact_estimator_id?, quant_bias_estimator_id?, all_samples?} → `ProjectDetail` | projects |
| `update_project` | {id, title?, description?, bin_estimator_id?, artifact_estimator_id?: number\|null, quant_bias_estimator_id?: number\|null, all_samples?} → `ProjectDetail` (absent = unchanged, null = unlink) | projects |
| `duplicate_project` | {id, title} → `ProjectDetail` (parameters, samples; estimators also results) | projects, controls |
| `delete_project` | {id} → null (refused while linked) | projects, controls |
| `list_project_samples` | {id} → `ProjectSampleRow[]` {sample_id, barcode, designation, run_count, moi, controls, max_alleles? (genotyping: most alleles called at one locus, over calls with a reference run, as in `get_project_sample_calls`)} | |
| `add_project_samples` | {id, sample_ids} → {added, already} | projects |
| `import_project_samples_csv` | {id, path? \| content?} (Barcode column) → {added, already} | projects |
| `remove_project_samples` | {id, sample_ids} → number removed | projects |
| `get_project_locus_params` | {project_id, locus_id} → `LocusParamsView` {locus_id, params: LocusParams, is_default} | |
| `update_project_locus_params` | {project_id, locus_ids? (omit = all loci), params: every section optional and partial (merged)} → `LocusParamsView[]`. A value equal to its default is a default (`is_default` stays true, the locus stays current) | projects |
| `reset_project_locus_params` | {project_id, locus_ids?} → `LocusParamsView[]` | projects |
| `analyze_project` (task) | {id, locus_ids?, only_stale?} → {loci: LocusAnalysis[] {locus_id, run_count, usable_runs, summary, warnings, ms}} | projects |
| `get_locus_bins` | {project_id, locus_id} → `LocusBins` {bins, status} | |
| `update_locus_bins` | {project_id, locus_id, bins: Bin[] (id ≤ 0 = new), delete_ids?} → `LocusBins` | projects, controls |
| `get_bin_estimator_peaks` | {project_id, locus_id} → `BinScatter` {sizes: number[], relative_heights: number[], status} | |
| `export_bins` | {id} → {filename, content} | |
| `get_locus_artifact_estimators` | {project_id, locus_id} → `LocusArtifacts` {estimators: [{id, label, artifact_distance, buffer, points, equations}], mono_allelic_runs, status, warnings?} | |
| `add_artifact_breakpoint` / `remove_artifact_breakpoint` | {id (class), size} → `ArtifactEstimatorView` | projects |
| `set_artifact_equation_method` | {id, equation_index, method} → `ArtifactEstimatorView` | projects |
| `clear_artifact_breakpoints` / `refit_artifact_estimator` | {id} → `ArtifactEstimatorView` | projects |
| `set_artifact_error_estimator` | {project_id, locus_id, error_estimator: `mad` \| `rms`, ids?: class ids} → `LocusArtifacts`. Refits the classes in place (every segment's `error`), keeping breakpoints, methods and deleted classes. Without `ids` (every class) it also sets the locus's `artifact.error_estimator` and moves the stored result's `params` fingerprint along, so a current locus stays current (its dependents go stale: the artifact model changed). With `ids` the parameter is left alone | projects |
| `delete_artifact_estimator` | {id} → null | projects |
| `export_artifact_equations` | {id} → {filename, content} | |
| `list_controls` | {bin_estimator_id?} → `Control[]` {id, label, bin_estimator_id, alleles per locus {locus_id, locus_label, bin_id, bin_label, deleted_bin?: {label, base_size}}, mixture_count}. `deleted_bin` is present when `bin_id` is null because the allele's bin was deleted (absent: never set, or unset on purpose) | |
| `create_control` / `update_control` | {bin_estimator_id, label, alleles?} / {id, label?, alleles?} → `Control` | controls (+ projects) |
| `delete_control` | {id} → null (refused while in a mixture) | controls |
| `set_control_mixtures` | {id, mixtures: [{sample_id, components: [{control_id, proportion}]}]} → `MixturesReport` | projects, controls |
| `import_control_mixtures_csv` | {id, path? \| content?, dry_run?} → `MixturesReport` {applied, problems, mixtures, added, replaced}. Each root problem is reported once: a row naming an unknown control gets that problem only, not also a proportion-sum or "no controls" problem caused by dropping it | projects, controls |
| `get_locus_quant_bias` | {project_id, locus_id} → `LocusQuantBias` {estimate {beta, sd, r_squared, n_peaks, n_sets}, points, status, params?, params_recomputed?, mixtures?} (see Quantification-bias view) | |
| `get_locus_calls` | {project_id, locus_id} → `LocusCalls` {status, probabilities, bins, rows: CallRow[] {sample, alleles: [{bin_id, label, size?, proportion?, corrected_proportion?, probability?}] by size, flags, moi, comment, peak_count, max_height, min_probability?, narrow_misses?: [{bin_id, label, size, height, reason: artifact \| probability, value, limit}], plate_label?, well_label?, run_count, reviewed, review_dropped?}} | |
| `get_sample_locus_call` | {project_id, sample_id, locus_id} → `SampleLocusCallView` {row, peaks, bins, reference {trace, base_sizes}, runs (every run, re-annotated, with `plate_pull_up` when available), status} | |
| `get_project_sample_calls` | {project_id, sample_id} → `SampleCalls` {moi (model), max_alleles?, max_alleles_loci: [{locus_id, locus_label}], loci: [{status, row, called: [{label, size, height, proportions, probability}]}]} | |
| `toggle_allele` | {project_id, sample_id, locus_id, bin_id} → `CallRow` (the updated row, as `get_locus_calls` returns it) | projects |
| `set_call_comment` | {project_id, sample_id, locus_id, comment} → `CallRow` | projects |
| `set_call_reviewed` | {project_id, sample_id, locus_id, reviewed} → `CallRow` | projects |
| `set_calls_reviewed` | {project_id, locus_id, sample_ids? (omit = every call at the locus), reviewed} → {updated, missing: sample ids without a call} | projects |
| `calculate_peak_probabilities` (task) | {id, moi_offset?} → {samples, moi: [{moi, samples}], manual_calls_kept}. The offset is stored on the project and reused when omitted | projects |
| `get_genotyping_summary` | {id} → `GenotypingSummary` {loci: [{typed, failed, no_run, failure_rate, alleles: [{count, prevalence, estimated_prevalence}], calls, reviewed}], moi, mean_moi, moi_source} | |
| `export_alleles_wide` / `export_alleles_long` / `export_peak_data` | {id, allow_stale?} → {filename, content}. Long: …, Probability, MOI, Reviewed. Peak data: "Proportion" and "Corrected Proportion" are shares of the called signal as in the long export (NA for uncalled peaks); the old meaning, height over every peak of the run, is in "Height Share of All Peaks", followed by "Spectral Dip Ratio", "Spectral Flag", "Expected Pull-Up", and "Pull-Up Error" (`NA` when unmeasured or off). `export_peak_data` also takes a quantification-bias estimator (the allele exports stay genotyping-only); see Quantification-bias view | |

All mutations except `write_text_file` also announce `workspace`. `ui/src/api/client.ts` is the authoritative list.

### Background tasks

`engine.run_task(kind, label, |task| { … })` runs the closure on its own thread and blocks the caller until it finishes, returning its result. It emits `task` events: running, progress (`task.report(fraction, message)`, throttled to 20 per second), then done or failed with the error message. Use `Scaled::new(&task, start, span)` to give part of the range to a sub-step (`import_paths` takes any `&dyn Progress`). The work runs off the caller's thread, so it completes and its events still go out even if an HTTP client disconnects. Adapters run `dispatch` on a blocking pool, as the HTTP server does with `spawn_blocking`. Emit `changed` from inside the task as results commit, for example one event per imported plate.

### Locus analysis

`locus_runs::load_locus_runs(conn, locus_id, LoadOptions { other_dyes })` returns every run of a locus with its decoded trace, rebuilt base sizes, sizing state and off-scale indices, plus the well's other dyes when asked (for bleedthrough); `load_locus_runs_for` takes a sample filter (applied in SQL for up to 2,000 samples). Projects build on it (next section).

## Projects

Four kinds share one schema and one service layer (`projects/`, `api/projects.rs`): a title, a locus set, per-locus parameters, a sample set, and links to the estimators they depend on. They differ only in what analyzing a locus produces.

| kind | links | a locus analysis stores |
|---|---|---|
| bin estimator | – | bins (`bin`), the peak scatter for the bin plot |
| artifact estimator | bin estimator (required) | artifact classes (`artifact_estimator`) |
| quantification-bias estimator | bin estimator, artifact estimator? | each control mixture's call (`genotype`), β with SD and R² (`project_locus.result`) |
| genotyping | bin estimator, artifact estimator?, quant-bias estimator? | one call per sample (`genotype`); the probabilistic pass adds MOI, prevalence and probabilities |

Linked estimators must be of the right kind and cover every locus of the project's locus set. Bin and artifact estimators default to every sample with runs at the locus set (`all_samples`); adding samples switches them to a list. A quantification-bias estimator's samples are its control mixtures.

**Parameters.** `LocusParams` = `{ scan, filter, bins? | artifact? | quant_bias? | genotyping? }` (core structs; exactly the kind's own section is present). Stored per locus as JSON holding only the values that differ from the kind's defaults, merged over those defaults when read, so `{}` means "defaults", a partial update is a merge, and a value the user never changed follows the defaults when they change. A value set equal to its default is a default (`is_default` stays true, the locus stays current). Artifact estimators also take `artifact.error_estimator` (`densest_half` default, `mad`, `rms`; see Accuracy) and `min_artifact_run_fraction` (0.5: a class must show in most of the mono-allelic runs tall enough to show it; `core::artifact` has the rule). Genotyping uses plate-measured pull-up by default (`genotyping.measured_pullup` true, `genotyping.pullup_sd_limit` 4.0) while keeping `bleedthrough_filter_limit` (5.0) as a fixed fallback for unmeasured dye pairs, unchecked plates, capillaries with unseparated dyes, and off-scale sources; `filter.max_bleedthrough` (10.0) remains the hard scan-filter ceiling, and estimators additionally drop peaks below that ceiling explained by measured pull-up (`drop_measured_pullup`). Crosstalk remains fixed (`crosstalk_filter_limit` 30.0 in genotyping; `max_crosstalk` 100.0 in calling, 10.0 in estimators). Engine defaults differ from core's for estimators because of polyclonal data (see Accuracy): bin and artifact estimators filter at 100 RFU (`min_peak_height`) and at a crosstalk ratio of 10 (`max_crosstalk`, against core's 100 for calling projects). Without the height floor, noise maxima form spurious bins, and in an artifact estimator wide (±3 bp) spurious classes that add their error to every peak. The floor truncates the low-level peaks the global estimator models (in a simulation, the global estimate rose from 0.0059 to 0.0100 of the main peak), but removing it costs callable minor alleles on the synthetic study (row "estimator floor 0 RFU" in Accuracy). Without the crosstalk filter, runs that pass as mono-allelic bring their neighbors' leaked alleles into the artifact model (row "artifact estimator crosstalk filter 100": callable minor alleles 99.0% → 41.6%).

**Pipeline** (`projects/pipeline.rs`, `projects/analysis.rs`). One read snapshot loads the runs (with other dyes for bleedthrough and the spectral dip ratio, well `offscale_indices` so pre-deconvolution saturated scans fall back to `fallback_bleedthrough_ratio`, and the same dye of capillaries within 2 positions for crosstalk; leak from 3 away is about 0.4%, under the calling limit even from a clipped peak), the plate quality reports (measured pull-up rates and unseparated capillary flags, omitted for fixed-only runs), the parameters, upstream bins / artifact model / β / control mixtures, and the input fingerprints. Scanning (through the scan cache), sizing and filtering then run in parallel over runs with no lock held, followed by the kind's step from `microspat_core` (`bins::estimate_bins`; `artifact::estimate_artifact_model` over runs whose main peak is in a bin; `quant_bias::assign_true_proportions` + `estimate_beta`; `genotyping::analyze_locus`). Unchecked plates fall back to the fixed bleedthrough limit and record warnings on `LocusAnalysis` and `ProjectDetail`. One write transaction stores the result with the fingerprints. A sample's reference run (genotyping and control mixtures alike) is a run with acceptable sizing and no off-scale in-bin peak and no in-bin peak at a spectral breakdown when it has one, then the one with the tallest in-bin peak; a sample whose every run has such a peak still gets its best run, flagged. The call's `spectral` flag is derived from its stored peaks when read, so it needs no column. A control's share goes to the peak *inside* its allele's bin (`in_bin`), as calling requires; a peak merely near the bin leaves the control's allele unfound. Stored peaks (`genotype.peaks`, `peak_codec.rs`) keep every value at full `f64` precision, so views that re-evaluate a limit on them (control points, flags, narrow misses) decide as the analysis did; the first format stored `f32` and showed 80/20 controls at `min_true_proportion` 0.2 as excluded although the fit used them. It is still read. Re-estimated bins whose label matches an existing bin keep its id, so controls and calls keep pointing at that allele. Re-analysis discards manual calls (as `core::genotyping` documents) but keeps comments and review marks (see Review state). `calculate_peak_probabilities` runs `genotyping::annotate_probabilities` over every call of the project (samples designated as controls are left out of the population model), requires every locus to be current, keeps manual calls, and stores MOI per sample and prevalence per locus.

**Probability model.** `calculate_peak_probabilities` weighs each candidate peak's height above its expected artifact against a prior from allele prevalence and the sample's MOI, conditioned on the sample's tallest peak (net of expected artifact) being real; `microspat_core::genotyping`'s module docs have the model. Its one option, the MOI offset, is stored on the project (`prob_options`) and is part of the pass's staleness fingerprint.

**Bias model.** β follows `h_i ∝ p_i · exp(γ · s_i)` for any number of alleles: it is estimated from centered log-ratios and reported as `2γ` (the log-odds slope of a two-allele mixture), and correction is `corrected_i ∝ observed_i · exp(−(β/2) · s_i)`. For two alleles this is exactly the previous MicroSPAT's per-peak log-odds model, so β, its SD and R², and corrected two-allele proportions are unchanged. For three or more alleles the per-peak form was not the model's (β from three-strain controls came out K-dependent; a corrected 70/10/10/10 mixture came back as 70/7/8/14), so results there differ from the previous version. `core::quant_bias` has the derivation.

**Empty artifact models.** An artifact estimator learns only from runs whose tallest peak is in a bin, so at a locus where its bin estimator has no bins, or no run qualifies, or no class passes the frequency limits, the model is empty, and calling projects then expect zero artifact at every stutter position. Analysis says so: the artifact estimator's locus carries a warning (`warnings` on the locus in `get_project` and in `get_locus_artifact_estimators`, also when every class was deleted by hand), and genotyping and quantification-bias projects linked to it get an upstream warning ("No artifact model for this locus … stutter is not being accounted for at …") and a warning in their own `analyze_project` result for that locus.

### Quantification-bias view

`get_locus_quant_bias` explains the stored β. Which control peaks entered the fit is decided by one function, core's `quant_bias::control_points`, which `estimate_beta` itself uses, so the view cannot disagree with the fit (the earlier view treated `min_true_proportion` as exclusive and showed 75/25 mixtures at the default 0.25 as unused while the fit used them). Analysis stores the parameters the fit used with the result (`project_locus.result.params`), and the view evaluates the stored peaks with them: on a stale locus the points still describe the stored β, and `params` says which parameters that was. Results stored before this was recorded fall back to the current parameters; on a stale locus `params_recomputed` is then true (re-analyzing clears it).

- `points[]`: every control peak (true proportion > 0; a peak with true proportion 0, such as stutter, is never a control peak, even at `min_true_proportion` 0) of every mixture's reference run, by barcode: the fit's x and y (`centered_size`, `log_odds_error`, named for the two-strain case; y is `2 · (clr(observed) − clr(true))` over the run's control peaks, which is `logit(observed) − logit(true)` for a two-strain mixture, and the fitted line is `β · x` for any number of strains; see `core::quant_bias`), `observed_proportion`, `true_proportion`, `corrected_proportion`, `used`, and `height`, `bin_id`, `bin_label` (as the fit saw them) and, when not used, `exclusion`: `below_min_true_proportion`, `below_min_height`, `control_allele_not_found` (part of the mixture is on no peak: a control has no allele at the locus, or no peak in its bin), `off_scale`, `single_peak_set` (fewer than two control peaks pass the limits), `partner_excluded` (another control peak of the run was left out, so the counted ones do not sum to 1), `above_max_true_proportion`. Peak-level reasons win over run-level ones; among run-level ones a missing allele comes first.
- `mixtures[]`: every control mixture of the project, by barcode: `reference_run_id?`, `plate_label?`, `well_label?` (absent when the sample has no usable run at the locus), `used`, and `components[]` {control_id, control_label, proportion, bin_id, bin_label, `missing?`: `not_set` \| `bin_deleted` \| `no_peak`}. Components describe the controls as they are now.

`export_peak_data` on a quantification-bias estimator writes `<title>_control_peak_data.csv`: every peak of each mixture's reference run with Sample, Locus, Plate, Well, Peak Size, Peak Height, Relative Peak Height, Peak Area, Artifact Contribution, Artifact Error, In Bin, Allele Label, Controls (the mixture's controls whose allele is this bin, `;`-joined), True Proportion, Proportion and Corrected Proportion (share of the control peaks' signal, as the calls store it), Fit Observed Proportion and Log-Ratio Error (the fit's y: `2 · (clr(observed) − clr(true))`, which is the log-odds error for a two-strain mixture), Used In Fit, Exclusion Reason (the names above; both empty for peaks that carry no control), and Height Share of All Peaks. It refuses stale loci unless `allow_stale`, as the genotyping exports do.

### Call rows

`CallRow` (`get_locus_calls`, every call view, the return of each call mutation) carries what the review table shows and filters on, so the table needs no export. Alleles in size order with the size of their tallest reference-run peak, their share of the called signal and bias-corrected share (the export's numbers, summed over peaks in the bin) and probability, rounded to 2 / 4 decimals; `min_probability`; the reference run's `plate_label` and `well_label`; `run_count` (every run of the sample at the locus, whatever its sizing); `reviewed`; and `narrow_misses`. A *narrow miss* is a binned peak (`in_bin`, its bin not called, call not failed) that one rule rejected by a small margin: rejected as artifact only, with `height − artifact_contribution − hard_artifact_sd_limit · artifact_error` short of `absolute_peak_height_limit` by at most one artifact SD clamped to 10–20% of the limit; or unflagged, within the soft SD limit, with a probability in [0.5, `probability_threshold`). Relative-height, bleedthrough, crosstalk and spectral rejections are not counted (they judge another signal). Optional fields are omitted when empty, which keeps rows at about 500 bytes (`api/calls.rs`, `narrow_misses`).

A sample's MOI is the model's: it counts only alleles whose probability reaches `bootstrap_probability_threshold`, so a sample can show more called alleles at a locus than its MOI (75 of 276 demo samples). `get_project_sample_calls` therefore also returns `max_alleles` and `max_alleles_loci`, for "MOI 1 (model); up to 2 alleles called at PfY1".

### Review state

A reviewer marks a call reviewed (`set_call_reviewed`, or `set_calls_reviewed` for many samples at a locus). The mark stores a review key: a hash of the call's reference run, called bins and flags (failure, off-scale, manual curation). The call reads as reviewed while its current key equals the stored one, so, like staleness, nothing has to clear the mark:

- re-analysis or the probabilistic pass that leaves the alleles, flags and reference run unchanged keeps it (proportions and probabilities are not in the key); one that changes them shows the call unreviewed;
- `toggle_allele` changes the alleles and sets manual curation, so the call reads unreviewed until it is confirmed again; toggling back does not restore it unless the call was already curated by hand when confirmed;
- re-analysis discards manual curation, so a hand-curated reviewed call reads unreviewed afterwards even if the automatic alleles match;
- an input set back (a parameter reverted) restores the same calls and with them the marks;
- comments do not affect it; duplicating a quantification-bias estimator copies the marks.

A row whose mark is stored but no longer matches carries `review_dropped: true` (absent otherwise), so a returning reviewer sees which calls changed since they were reviewed.

`get_genotyping_summary` counts `calls` (controls included) and `reviewed` per locus; the long export has a Reviewed column.

### Staleness

Every stored result records a fingerprint (stable FNV-1a hash, `fingerprint.rs`) of each input it read, computed from the same snapshot as the data. Reading a status recomputes the current fingerprints and compares (`projects/inputs.rs`):

| component | hashed | kinds | changed by |
|---|---|---|---|
| `params` | effective locus parameters | all | parameter updates and resets, and changed defaults (not `set_artifact_error_estimator` for every class, which moves the stored fingerprint along) |
| `locus` | size range, repeat length, dye | all | `update_locus` |
| `runs` | each run used: run, sample, channel ids, the well's ladder fit, usable/unusable state, base-size precision | all | imports (all-samples estimators), plate maps, `clear_plate_map`, `delete_plate`, `size_plate`, `set_well_ladder_peaks`, ladder limit changes |
| `plate_quality` | each referenced plate's report presence/version, measured pull-up targeting the locus's dye, and unseparated status of referenced wells (omitted when `measured_pullup` is false) | all | `size_plate`, `set_well_ladder_peaks`, `compute_plate_quality` |
| `samples` | sample ids | quant-bias, genotyping | adding or removing samples |
| `bins` | linked bin estimator id + its bins at the locus | artifact, quant-bias, genotyping | bin edits, re-estimating bins, relinking |
| `artifact` | linked artifact estimator id + its classes | quant-bias, genotyping | breakpoints, methods, refits, deletions, re-analysis, relinking |
| `beta` | linked quant-bias estimator id + β at the locus | genotyping | re-estimating β, relinking |
| `controls` | control mixtures + the controls' bins at the locus | quant-bias | mixtures, control alleles |

Equal maps mean current; otherwise each differing component becomes a human reason ("Bins changed …"). Nothing has to remember to set a flag, results become current again when an input is set back (an identical plate map, a parameter reverted), and a result computed while an input changed is recorded against what it actually read. Edits to an estimator's own results (bins, artifact classes) are not inputs of that estimator, so it stays current while its dependents go stale. The probabilistic pass records a hash of every locus's `analysis_rev`, the sample set with designations, and its options (MOI offset); re-analyzing any locus makes it stale. Every view that shows results carries the status, and exports refuse stale or unanalyzed loci unless `allow_stale` is set. `get_project` also lists `upstream_warnings` when a linked estimator is itself not current at one of the project's loci.

Measured cost: statuses of a 6-locus project over 2,016 runs per locus take 12 ms (`get_project`); runs are hashed once per locus per request and shared by all projects in `list_projects`.

### In use

Refused with `in_use` and a message naming the dependents: `delete_project` while another project links to it; `delete_locus_set` used by a project; `delete_sample` listed in a project; `delete_control` used in a mixture; changing a quant-bias estimator's bin estimator while it has mixtures; `delete_plate` while any call uses one of its runs as reference run (reviewed calls would silently lose their evidence). Other uses of a plate (estimator inputs, non-reference runs) are allowed and show up as stale results. Clearing or re-applying a plate map is allowed: affected calls lose their reference run (`SET NULL`) and show as stale.

### Performance and the scan cache

Scanning costs ~200 µs per 9,000-point trace; everything after it is cheap. `scan_cache.rs` keeps scanned candidates in memory keyed by content (the well's FSA hash, the dye, and the scanning parameters), so it never returns a stale scan and needs no invalidation; it holds ~7 KB per channel, bounded at 128 MB (oldest out first), and is not persisted. Release build, 21 synthetic plates (2,016 runs per locus), 14 cores (4 threads in parentheses):

| step | 14 cores | 4 threads |
|---|---|---|
| one locus, 2,016 runs, cold (every run scanned) | 98 ms | 190 ms |
| same, warm (after a filter or calling parameter change) | 58 ms | 100 ms |
| same, cache disabled | 88 ms | 184 ms |
| filter change + re-analyze all 6 loci (warm) | 310 ms | 491 ms |
| genotyping one locus, 2,016 samples (warm) | 89 ms | 140 ms |
| genotyping all 6 loci / probabilistic pass | 601 / 237 ms | 843 / 242 ms |
| `get_project` (6 locus statuses) / `get_locus_calls` (2,016 rows) / `get_sample_locus_call` | 13 / 14 / 3 ms | same |
| `get_locus_calls`, 1,920 / 3,840 rows (`perf -- 20` / `-- 40`) | 16 ms, 964 KB / 23 ms, 1.9 MB | |
| `set_calls_reviewed` (3,840 calls) / `toggle_allele` | 44 / 0.7 ms | |
| `get_bin_estimator_peaks` (8,753 points, 293 KB JSON) | 2 ms | same |

A warm locus spends most of its time loading and decoding traces (the run, its three other dyes, its neighbors; ~55 ms of the 58). The cache roughly halves a re-analysis on a 4-core laptop, which is what makes a filter change feel immediate; it holds 41 MB for these 5,793 channels.

### Peak heights

A peak's height is its raw apex minus the baseline under it (`microspat_core::signal::baseline`): the midpoint of the shortest interval holding a third of the 15-point moving averages within 300 points, detrended when that gathers them closer. Raw 3730 traces need this: their baselines sit between about −140 and +110 RFU (most within ±60), so raw apex values would move a 300 RFU minor peak by up to ~140 RFU, and a tall peak in one dye leaves a dip of up to ~5% of its height at the same data point in other dyes (on some instruments at every ladder peak, in yellow and blue). The earlier estimator anchored on the lowest stretch on each side, so it sat in those dips; on real traces it gave up to ~110 spurious peaks over 100 RFU per yellow trace, against ~0.01 now, and the corrected signal in quiet stretches now centers within 2 RFU of zero, also next to dips and tall peaks. Ratios (bleedthrough, crosstalk), area and ladder candidates use the same baseline. `raw_height` keeps the raw apex; off-scale is judged on it.

### Ladder sizing

Candidates are the ladder-channel peaks after `min_time` that stand more than `min_peak_height` above the baseline, have a raw value below `max_peak_height`, and reach `min_relative_height` (default 0.25) of the well's ladder height. The ladder height is the median of the well's tallest peaks, as many as the ladder has sizes. There is no height-outlier removal. `index_overlap` (default 5) only merges two maxima of one peak, so pull-up beside a ladder peak stays a candidate and is rejected by its spacing.

Importing or re-sizing a plate fits every well alone, then builds the plate's consensus from its usable, unambiguous wells. A well that is ambiguous, or whose plate error exceeds the flag limit, is fitted again against the plate. The plate error is the worst miss of a matched peak against the position predicted from its two neighbors in the plate's coordinate. The refit is kept when it is no worse and changes at most one peak, or when the fit alone was off by more than half the smallest ladder step. Otherwise the fit alone is kept and its quality is raised to its plate error. `set_well_ladder_peaks` in automatic mode does the same against the other wells.

A well is flagged above 1 bp and unusable above 2 bp. On 4,608 real wells from four 3730 instruments, checked against a reference built independently of the fit, 3 fits were wrong but reported usable and 2 correct ladders were refused. A stored ladder keeps its own `index_overlap` and limits until it is edited.

### Accuracy (synthetic ground truth)

`tests/accuracy.rs` genotypes a six-plate polyclonal study end to end and scores calls against the planted truth; run it with `--nocapture` for the full table (`ACC_CROSSTALK_GRID=1 cargo test --release …` adds a grid of crosstalk limits, `ACC_DEBUG=1` prints the artifact classes). `measured_pullup_handles_clean_high_leak_and_unmeasured_plates` separately verifies recovering minor alleles under tall clean-plate peaks (above the fixed 5x limit), rejecting 25% plate pull-up below fixed 5, exposing `plate_pull_up` in review, and falling back with warnings when a plate is unchecked or a dye pair is unmeasured. The study plates come from `SynthSpec::study`, set to what 3730 data shows: 1–4 clones with minor clones down to 5% of the major; per-locus stutter (`synth::LocusProfile`: −1 repeat at 3.5–20% of the parent, growing with allele length, −2 at 1–7%, +1 at 1–5%, −3 where −1 is heavy), varying 20% between runs; per-locus amplification bias β of 0.05 to 0.19 per bp (limited so a locus's longest allele keeps a quarter of its shortest's signal); alleles at ladder fragment sizes at three loci; two pairs of loci in different dyes sharing a size range; raw-trace baselines, noise and signed spectral pull-up and dips, with blue pulling up into green at 14%; crosstalk of 1.1%, 0.7% and 0.4% from capillaries 1, 2 and 3 away (2.8% next to a saturated peak); and two capillaries whose dyes are not separated (every blue peak also shows in green and as a dip in yellow). Calls from those two capillaries are scored only on whether they carry the spectral flag. Controls are twelve two-strain and five three-strain mixtures.

With default parameters, after the probabilistic pass: callable (planted ≥ 300 RFU) major alleles 97.8%, callable minor alleles 90.0%, callable minor alleles on a stutter position 96.8% (30 of 31), precision 99.6% (25 false calls of 5,608); β within 1% of the planted value at five loci and 33% off at PfG1, whose control alleles sit under a ladder fragment and another dye's allele; bias-corrected proportions MAE 0.0072 (uncorrected 0.0925); MOI equals the MOI observable in the data for 94.1% of samples (planted clone count 61.7%, MAE 0.42); 28 of the 72 calls in the faulty capillaries carry the spectral flag (the others are at loci the blue signal does not reach) and no call elsewhere does. Most misses of callable major alleles are failed runs (69) and peaks within the artifact expectation (30).

Recall of callable alleles and precision, per-locus calls → after the probabilistic pass, all from one run; each default is scored against the value it replaced:

| configuration | major | minor | minor on stutter | precision |
|---|---|---|---|---|
| defaults | 98.0 → 97.8% | 90.4 → 90.0% | 96.8 → 96.8% | 98.2 → 99.6% |
| fixed bleedthrough 5 (previous) | 97.7 → 97.6% | 89.2 → 88.8% | 96.8 → 96.8% | 98.2 → 99.6% |
| MAD class error (previous) | 98.0 → 97.8% | 90.4 → 90.0% | 96.8 → 96.8% | 98.5 → 99.6% |
| MAD error, run fraction 0.2 (previous) | 98.0 → 97.8% | 90.4 → 90.0% | 96.8 → 96.8% | 98.7 → 99.8% |
| bleedthrough flag 10 (previous) | 98.0 → 97.8% | 90.4 → 90.0% | 96.8 → 96.8% | 97.8 → 99.3% |
| crosstalk flag 50 (previous) | 98.0 → 97.8% | 90.4 → 90.0% | 96.8 → 96.8% | 98.2 → 99.5% |
| height limit 300, probability 0.9 (previous) | 96.6 → 96.4% | 83.8 → 83.8% | 87.1 → 87.1% | 98.8 → 99.7% |
| previous defaults together | 96.6 → 96.4% | 82.9 → 82.9% | 80.6 → 80.6% | 98.9 → 99.7% |
| bleedthrough off | 98.0 → 97.8% | 90.0 → 89.6% | 96.8 → 96.8% | 97.8 → 99.3% |
| artifact estimator crosstalk filter 100 | 94.6 → 90.9% | 2.9 → 1.2% | 0.0 → 0.0% | 100.0 → 100.0% |
| artifact estimator floor 0 RFU | 98.5 → 98.5% | 88.8 → 84.6% | 93.5 → 90.3% | 99.3 → 99.9% |
| no artifact model | 98.6 → 98.6% | 99.2 → 99.2% | 100.0 → 100.0% | 78.6 → 78.6% |

With plate-measured pull-up, defaults recover 16 more callable alleles (+13 major, +3 minor) than fixed bleedthrough 5 with the same 25 false calls, while fixed bleedthrough 10 lets 14 more false calls through (39 total). The synthetic study cannot tell every default from the value it replaced. Its stutter classes carry few minor alleles at stutter positions, so the densest-half fit and MAD give the same calls, and the majority rule costs no recall against a 0.2 run fraction there; both were chosen on real mixtures, where they matter (next section). The artifact estimator keeps a 10× crosstalk filter (see Parameters): at 100× its mono-allelic runs bring their neighbors' alleles into the model and callable minor-allele recall falls to 1.2%.

**Model changes measured** (on real mixtures, runs 1 and 2 without the faulty capillaries, at the final defaults; see next section):

| change | 10–30% band | 3–10% band | false calls | decision |
|---|---|---|---|---|
| artifact annotation from net parent heights | +5 | +12 | +8 (rate 2.9% → 3.1%) | not adopted: takes the rate over 3% |
| artifact errors in quadrature | +8 | +5 | +15 | not adopted (under 2 alleles per false call) |
| final pass weighs other peaks at their converged probabilities; prior conditioned on the tallest peak being real (synthetic study) | | | | adopted |

### Validation on real mixtures

The defaults were checked on a designed mixture-control experiment of *P. falciparum* lab strains, typed at 27 trinucleotide loci: seven single strains, two-, three-, four- and seven-strain mixtures at graded proportions, and no-template controls, run three times on 36 plates over four 3730 instruments (runs 1 and 2 on one instrument, run 3 mostly on the other three). Each strain's alleles come from its single-strain samples; each mixture's expected alleles and shares from its members. Defaults were chosen on runs 1 and 2 and checked on run 3. Recall is over typed sample × loci, by the allele's expected share of the sample:

| | ≥30% | 10–30% | 3–10% | 1–3% | false-call rate |
|---|---|---|---|---|---|
| runs 1 and 2, healthy capillaries | 98.3% | 71.6% | 28.0% | 3.6% | 3.0% |
| run 3 (other instruments) | 99.8% | 85.9% | 37.1% | 7.7% | 2.3% |
| all plates | 94.8% | 74.9% | 29.6% | 4.3% | 6.3% |
| all plates, previous defaults | 94.5% | 52.3% | 13.5% | 0.9% | 9.3% |

The all-plate figures include sixteen capillaries of the first instrument whose dyes were not separated in runs 1 and 2: every peak of one dye also showed in a neighboring dye, often taller, with the other dyes far below baseline, at any height. Their calls (32% false) carry the spectral flag; telling the true dye from its copy needs a new spectral calibration, not a calling rule, so their peaks are rejected only on request (`reject_spectral_breakdown`). Of the remaining false calls, about half sit at a stutter position of a true allele, and two thirds of those coincide with an allele of a strain that is not a member of the mixture but shows in it at a low level; most of the rest are crosstalk and pull-up below the flag limits. Most misses in the 10–30% band are peaks under the height limit (longer alleles amplify much less: β of 0.05–0.19 per bp) or within the stutter expected at their position.

Measurements behind the defaults: pull-up rates vary across instruments and dye pairs (about −6% to +4% on clean calibrations, up to ~14% blue-into-green on one calibration) while remaining tight peak-to-peak on healthy capillaries (robust SD ~0.2–1.6% of the source window sum). Calling uses each plate's measured pull-up (`measured_pullup` true, `pullup_sd_limit` 4.0) and keeps fixed `bleedthrough_filter_limit` 5 as fallback for unmeasured dye pairs, unchecked plates, unseparated capillaries, and off-scale windows (`32,767` or instrument `OfSc` indices, where raw saturation precedes deconvolution), plus `max_bleedthrough` 10 to drop nonlinear dip-shoulder spikes and dye blobs (fixed flag 10 raises runs 1 and 2 healthy false calls from 3.0% / 19 pull-up to 10.2% / 355 pull-up, while measured pull-up matches fixed 5 within one allele and zero false calls across runs and instruments and improves synthetic recovery under overlapping dyes). Capillary crosstalk remains fixed (`crosstalk_filter_limit` 30, neighbors within 2; ~1.1%, 0.7% and 0.4% of the source 1, 2 and 3 capillaries away and 2.5–3% next to a saturated peak) because individual capillary-pair rates vary roughly 4× within a plate and plate-wide residuals are right-skewed by shared alleles in neighboring wells. Under a clipped peak other dyes read up to half the clip level (off-scale pull-up needs a ratio of at least 2; off-scale crosstalk at least 10); normal spectral dips are at most about 6% of the source (spectral breakdown at 25%); noise SD is 5–14 RFU (a breakdown needs a dip of at least 150 RFU). The −1 repeat stutter is 3.5–20% of its parent (median by locus), +1 1–5%, −2 1–7%; fit on all samples, the stutter classes now match those measured on the single strains to a median of 0.4 percentage points (0.5 before the densest-half fit), and the +1 classes, which minor clones one repeat above inflate most, by much more (at one locus 4.9% ± 6.2% before, 1.2% ± 1.1% now, 0.8% ± 0.5% measured).

### Plate quality

Every plate carries a quality report: what the instrument did, per capillary and for the plate, and the issues a lab should hear about at import (core `quality`, engine `quality.rs`). Measurements work on raw traces above the baseline (Peak heights), inside each well's sized range (after the ladder's `min_time` when the fit failed). The thresholds were set on the mixture-control experiment of the validation (36 plates, and 12 older plates of a second study, over four 3730 instruments) with margins; the constants' doc comments say what each rests on.

**Per capillary.**
- Ladder: median height of the matched ladder peaks; fade (the last third's median over the first third's); sizing quality; plate error (the ladder's worst disagreement with the plate's other wells, as Ladder sizing defines it).
- Signal: per dye, noise SD (from the median absolute first difference), baseline level, off-scale scans (those the file marks where this dye is the largest), strongest signal; and the strongest sample-dye signal.
- Spectral separation: the capillary's tall sample-dye peaks (600 RFU and up, no off-scale point within 3), counted once where several dyes peak at one point; how many sit at a spectral breakdown (the calling rule: another dye dips by more than a quarter of the largest signal there and by at least 150 RFU) and how many have a copy of 0.5 to 2 times their height in another dye. Also the ladder dye's own pull-up into each other dye (median over the capillary's ladder peaks) and its largest difference from the plate's typical capillary.

A capillary has **unseparated dyes** when 2 or more of its tall peaks sit at a breakdown, or its ladder pull-up differs from the plate's by more than 3% of the ladder signal. On 4,150 healthy capillary runs no capillary had more than one breakdown, and the ladder pull-up stayed within 2.7% of its plate's; capillaries with unseparated dyes had 2 to 9 breakdowns on most plates and differed by 2 to 15% on every plate (copies alone are not counted: two loci of different dyes at one size make them in healthy capillaries).

**Per plate.**
- Pull-up for every ordered pair of dyes: from tall unsaturated source peaks (2,000 RFU and up, no other dye above half their signal) of capillaries that show no sign of unseparated dyes (no breakdown, ladder pull-up within 2% of the plate's), the target's signed signal over the source's at the same points; the leak is the center of the densest half of these ratios, so most sources having no real peak under them is what makes it work, and dips come out negative. Reported with the ratios' spread and the number of sources; fewer than 20 sources and the pair is not measured.
- Crosstalk at 1, 2 and 3 capillaries: the same, for the same dye at the source's data points, from sample-dye peaks of 3,000 RFU and up, separately for sources with an off-scale point. Ladder peaks are not sources (every capillary has its own at nearly the same point).
- Negative controls, once a plate map applies: in each well whose sample is a negative control, the tallest peak above the calling height limit (200 RFU) inside each locus range, and whether calling would flag it as crosstalk (a capillary within 2 at least 30 times taller there) or pull-up (using the plate's measured pull-up on healthy capillaries, or 5× fallback when unmeasured, unseparated, or off-scale).

**Issues**, each with a severity, the wells, the numbers and what to do:

| issue | severity | when |
|---|---|---|
| Dyes not separated | problem | any capillary with unseparated dyes |
| Pull-up | warning above 8%, problem above 20% | a dye pair's leak; calling uses the plate's measured pull-up on healthy capillaries, while high pull-up above the 5× fallback limit warrants checking spectral calibration and lowers sensitivity under tall peaks in another dye |
| Crosstalk | warning above 2.75%, problem above 1/30 (within 2 capillaries) | plates of four instruments measured 0.7 to 2.5% at the next capillary; the default crosstalk limit (30) flags leaks up to 1/30. Next to off-scale sources: 5% and 10% (the off-scale rule's ratio) |
| Weak or failed injection | problem when 10% or more of the wells, otherwise a note | wells whose ladder is under a quarter of the plate's median and whose strongest sample signal is under 500 RFU |
| Ladder disagrees with the plate | warning | plate error above the ladder's flag limit |
| Ladder fades | note | last third under a fifth of the first |
| Noisy capillaries | note | a dye's noise SD above 2.5 times the plate's median for that dye (within a plate the ratio stayed under 1.8) |
| Off-scale signal | note | 25% or more of the wells off-scale in a sample dye |
| Signal in negative controls | problem | a negative-control peak that neither crosstalk nor pull-up explains |

Negative-control peaks that calling flags as crosstalk or pull-up stay in the report's `controls` with their explanation but raise no issue: there is nothing to do about them, and on the validation plates nearly every plate map had some.

A plate with nothing to say reports no issue, with every measurement available. **When it is computed**: `import_plates` and `size_plate` measure every well in the same parallel pass that fits the ladders, from the traces in memory, and store the report in the plate's write transaction (import goes from about 66 to about 80 ms per 96-well plate). `set_well_ladder_peaks` measures the plate again after its commit. `apply_plate_map`, `clear_plate_map`, designation changes and locus-range changes check the negative controls of the plates they touch again (from those wells and their neighbors) and derive the issues again. Opening a workspace computes nothing: plates imported before reports existed show as not checked, and `compute_plate_quality` fills them in one task (a background pass at open would race the user's own edits for the writer). The instrument name and run date are stored with every plate, so a history across plates of one instrument can be built later.

On the validation data, calls from capillaries the report names as having unseparated dyes were false at 33% (250 of 760), against 2.8% elsewhere; negative controls it reports as carrying unexplained signal held 154 calls in 79 of 167 wells, and those with only leaked signal 10 calls in 8 of 154 wells.

### Demo

`load_demo_data` builds the whole chain on its three plates: "Demo bins", "Demo artifacts", controls 3D7 / HB3 / DD2, "Demo bias" from twelve two-strain mixtures (plate 3, A01–C04; 70/30, 50/50, 30/70 used for β, 90/10 shown), and "Demo genotyping" (every other sample; NTCs as negative controls) with probabilities computed. Plate 1 wells D01–D04 (`D1-SHOW-1…4`) are two-clone samples (minor clone 10–15%) whose minor allele sits one or two repeats below the major allele at every locus; all 24 minor alleles are called (the workflow test checks each). The demo plates use `SynthSpec::demo` (per-locus stutter and bias as in the study, no ladder or cross-dye overlaps). Plate 2's well F06 (`DEMO_FAULT_WELL`) runs in a capillary whose dyes are not separated, so its quality report shows a problem; its blue alleles copy into green outside every green locus, so no call changes but that sample's spectral flag. DEMO-1 reports no issue, and DEMO-2 and DEMO-3 a note about their failed wells.

## Running

```sh
# Tests (the workflow test drives everything through dispatch)
cargo test -p microspat-engine -p microspat-server

# Server for UI development: API on :7878, UI served from ui/dist
cd ui && pnpm build && cd ..
cargo run -p microspat-server -- --workspace /tmp/dev.microspat --demo --ui-dir ui/dist
# …or keep Vite's hot reload: run the server without --ui-dir and `pnpm dev` in ui/ (proxies /api to :7878)

# Release binary with the UI embedded
cargo build --release -p microspat-server --features embed-ui

# Synthetic FSA files (folder, zip, plate map, loci CSV) for trying imports by hand
cargo run -p microspat-engine --example synth_plate -- /tmp/synth 7

# Performance numbers (import, storage, locus loading, project analysis)
cargo run --release -p microspat-engine --example perf -- 20

# Accuracy table against synthetic truth
cargo test -p microspat-engine --test accuracy -- --nocapture
```

Server flags: `--workspace <file>` (created if missing; untitled if omitted), `--port` (7878), `--host` (127.0.0.1), `--ui-dir`, `--open`, `--demo` (only if the workspace has no plates), `--allow-host-paths`. The server has no authentication, so keep it on localhost unless the network is trusted. Over HTTP, `path` and `paths` parameters must point at uploaded files unless `--allow-host-paths` is given, uploads need the `X-MicroSPAT-Request` header, and a server bound to a loopback address refuses requests whose `Host` is not a loopback name.
