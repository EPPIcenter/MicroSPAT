//! Versioned schema. `PRAGMA user_version` holds the number of migrations
//! applied; [`MIGRATIONS`] is append-only. To change the schema, add a new
//! entry at the end (never edit a shipped one) and bump nothing else: opening
//! an older workspace applies the missing entries in one transaction.

/// Marks a SQLite file as a MicroSPAT workspace (`PRAGMA application_id`, "MSP3").
pub const APPLICATION_ID: i32 = 0x4D53_5033;

/// Migrations in order; index + 1 is the schema version they produce.
pub const MIGRATIONS: &[&str] = &[
    // 1: ladders, loci, locus sets, samples, plates, wells, channels, traces, runs.
    r#"
    CREATE TABLE meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    ) WITHOUT ROWID;

    -- A size standard and its fitting parameters. `spec` is the JSON of
    -- microspat_core::ladder::LadderSpec (base sizes, color, all tuning
    -- fields); it is read with serde defaults, so new core fields need no
    -- migration.
    CREATE TABLE ladder (
        id         INTEGER PRIMARY KEY,
        label      TEXT NOT NULL UNIQUE COLLATE NOCASE,
        spec       TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE locus (
        id                       INTEGER PRIMARY KEY,
        label                    TEXT NOT NULL UNIQUE COLLATE NOCASE,
        color                    TEXT NOT NULL,
        min_base_length          REAL NOT NULL,
        max_base_length          REAL NOT NULL,
        nucleotide_repeat_length REAL NOT NULL,
        created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        CHECK (min_base_length < max_base_length)
    );

    CREATE TABLE locus_set (
        id         INTEGER PRIMARY KEY,
        label      TEXT NOT NULL UNIQUE COLLATE NOCASE,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE locus_set_member (
        locus_set_id INTEGER NOT NULL REFERENCES locus_set(id) ON DELETE CASCADE,
        locus_id     INTEGER NOT NULL REFERENCES locus(id) ON DELETE RESTRICT,
        PRIMARY KEY (locus_set_id, locus_id)
    ) WITHOUT ROWID;
    CREATE INDEX locus_set_member_locus ON locus_set_member(locus_id);

    CREATE TABLE sample (
        id          INTEGER PRIMARY KEY,
        barcode     TEXT NOT NULL UNIQUE COLLATE NOCASE,
        designation TEXT NOT NULL DEFAULT 'sample'
                    CHECK (designation IN ('sample', 'negative_control', 'positive_control')),
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    -- One imported CE plate. Run-condition traces are codec blobs (see codec.rs).
    CREATE TABLE plate (
        id               INTEGER PRIMARY KEY,
        label            TEXT NOT NULL,
        content_hash     TEXT NOT NULL UNIQUE,
        run_date         TEXT,
        instrument       TEXT,
        instrument_model TEXT,
        plate_size       INTEGER NOT NULL CHECK (plate_size IN (96, 384)),
        ladder_id        INTEGER NOT NULL REFERENCES ladder(id) ON DELETE RESTRICT,
        source           TEXT,
        imported_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        voltage          BLOB,
        current          BLOB,
        power            BLOB,
        temperature      BLOB
    );
    CREATE INDEX plate_ladder ON plate(ladder_id);

    -- One FSA file. The ladder fit is stored as its matched peaks only; base
    -- sizes per data point are recomputed from them (see sizing.rs).
    -- sizing_quality is NULL exactly when the fit failed (sizing_error says why).
    CREATE TABLE well (
        id                  INTEGER PRIMARY KEY,
        plate_id            INTEGER NOT NULL REFERENCES plate(id) ON DELETE CASCADE,
        label               TEXT NOT NULL,
        sample_name         TEXT,
        fsa_hash            TEXT NOT NULL UNIQUE,
        trace_len           INTEGER NOT NULL,
        ladder_peak_indices TEXT NOT NULL DEFAULT '[]',
        ladder_peak_sizes   TEXT NOT NULL DEFAULT '[]',
        sizing_quality      REAL,
        sizing_error        TEXT,
        manual_ladder       INTEGER NOT NULL DEFAULT 0,
        offscale_indices    TEXT NOT NULL DEFAULT '[]',
        UNIQUE (plate_id, label)
    );

    -- One dye of one well. max_signal: highest raw value between the first
    -- and last matched ladder peak (NULL when the well could not be sized).
    CREATE TABLE channel (
        id          INTEGER PRIMARY KEY,
        well_id     INTEGER NOT NULL REFERENCES well(id) ON DELETE CASCADE,
        dye_number  INTEGER NOT NULL,
        color       TEXT NOT NULL,
        dye_name    TEXT,
        wavelength  INTEGER,
        max_signal  INTEGER,
        UNIQUE (well_id, color)
    );

    -- Raw traces live apart from channel rows so listing channels never
    -- touches trace pages.
    CREATE TABLE trace (
        channel_id INTEGER PRIMARY KEY REFERENCES channel(id) ON DELETE CASCADE,
        data       BLOB NOT NULL
    );

    -- A run: one locus read from one channel for one sample, created by a
    -- plate map. A channel can carry several loci of the same dye at
    -- different sizes (multiplexing). max_signal: highest raw value inside the
    -- locus size range (NULL when the well could not be sized).
    CREATE TABLE run (
        id         INTEGER PRIMARY KEY,
        channel_id INTEGER NOT NULL REFERENCES channel(id) ON DELETE CASCADE,
        locus_id   INTEGER NOT NULL REFERENCES locus(id) ON DELETE RESTRICT,
        sample_id  INTEGER NOT NULL REFERENCES sample(id) ON DELETE RESTRICT,
        max_signal INTEGER,
        UNIQUE (channel_id, locus_id)
    );
    CREATE INDEX run_locus ON run(locus_id);
    CREATE INDEX run_sample ON run(sample_id);
    "#,
    // 2: analysis projects (bin, artifact and quantification-bias estimators,
    // genotyping), controls, and their results. See README "Projects".
    r#"
    -- One project of any kind. Links to the estimators it depends on are
    -- RESTRICT: an estimator cannot be deleted while a project uses it.
    -- all_samples (bin/artifact estimators): use every sample with runs of
    -- the locus set instead of project_sample.
    -- prob_*: the project-wide probabilistic pass (genotyping): when it ran,
    -- the fingerprint of its inputs, its options and per-locus prevalence.
    CREATE TABLE project (
        id                      INTEGER PRIMARY KEY,
        kind                    TEXT NOT NULL CHECK (kind IN
                                ('bin_estimator', 'artifact_estimator', 'quant_bias_estimator', 'genotyping')),
        title                   TEXT NOT NULL COLLATE NOCASE,
        description             TEXT NOT NULL DEFAULT '',
        locus_set_id            INTEGER NOT NULL REFERENCES locus_set(id) ON DELETE RESTRICT,
        bin_estimator_id        INTEGER REFERENCES project(id) ON DELETE RESTRICT,
        artifact_estimator_id   INTEGER REFERENCES project(id) ON DELETE RESTRICT,
        quant_bias_estimator_id INTEGER REFERENCES project(id) ON DELETE RESTRICT,
        all_samples             INTEGER NOT NULL DEFAULT 0,
        prob_options            TEXT,
        prob_fingerprint        TEXT,
        prob_computed_at        TEXT,
        created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        UNIQUE (kind, title)
    );
    CREATE INDEX project_locus_set ON project(locus_set_id);
    CREATE INDEX project_bin_estimator ON project(bin_estimator_id);
    CREATE INDEX project_artifact_estimator ON project(artifact_estimator_id);
    CREATE INDEX project_quant_bias_estimator ON project(quant_bias_estimator_id);

    -- Per project and locus: parameters (JSON LocusParams, read with serde
    -- defaults; '{}' means all defaults), and the last analysis: when, a
    -- counter bumped by every analysis, the fingerprint of every input it
    -- used (JSON map component -> hash; see fingerprint.rs), a kind-specific
    -- result (JSON), and for bin estimators the scatter of peak sizes and
    -- relative heights (f32 pairs, little-endian).
    CREATE TABLE project_locus (
        project_id   INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
        locus_id     INTEGER NOT NULL REFERENCES locus(id) ON DELETE CASCADE,
        params       TEXT NOT NULL DEFAULT '{}',
        analyzed_at  TEXT,
        analysis_rev INTEGER NOT NULL DEFAULT 0,
        fingerprint  TEXT,
        result       TEXT,
        scatter      BLOB,
        PRIMARY KEY (project_id, locus_id)
    ) WITHOUT ROWID;

    -- Samples included in a project. moi: from the probabilistic pass.
    CREATE TABLE project_sample (
        project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
        sample_id  INTEGER NOT NULL REFERENCES sample(id) ON DELETE RESTRICT,
        moi        INTEGER,
        PRIMARY KEY (project_id, sample_id)
    ) WITHOUT ROWID;
    CREATE INDEX project_sample_sample ON project_sample(sample_id);

    -- Allele bins of a bin estimator.
    CREATE TABLE bin (
        id          INTEGER PRIMARY KEY,
        project_id  INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
        locus_id    INTEGER NOT NULL REFERENCES locus(id) ON DELETE CASCADE,
        label       TEXT NOT NULL,
        base_size   REAL NOT NULL,
        bin_buffer  REAL NOT NULL,
        peak_count  INTEGER NOT NULL DEFAULT 0,
        UNIQUE (project_id, locus_id, label)
    );

    -- One artifact class of an artifact estimator at a locus. points and
    -- equations are JSON of core's ArtifactPoint[] and ArtifactEquation[].
    CREATE TABLE artifact_estimator (
        id                       INTEGER PRIMARY KEY,
        project_id               INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
        locus_id                 INTEGER NOT NULL REFERENCES locus(id) ON DELETE CASCADE,
        label                    TEXT NOT NULL,
        artifact_distance        REAL,
        artifact_distance_buffer REAL,
        points                   TEXT NOT NULL,
        equations                TEXT NOT NULL
    );
    CREATE INDEX artifact_estimator_project ON artifact_estimator(project_id, locus_id);

    -- A known strain (e.g. a lab line) with its allele at each locus, in the
    -- bins of one bin estimator.
    CREATE TABLE control (
        id               INTEGER PRIMARY KEY,
        bin_estimator_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
        label            TEXT NOT NULL COLLATE NOCASE,
        created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        UNIQUE (bin_estimator_id, label)
    );
    CREATE TABLE control_allele (
        control_id INTEGER NOT NULL REFERENCES control(id) ON DELETE CASCADE,
        locus_id   INTEGER NOT NULL REFERENCES locus(id) ON DELETE CASCADE,
        bin_id     INTEGER REFERENCES bin(id) ON DELETE SET NULL,
        PRIMARY KEY (control_id, locus_id)
    ) WITHOUT ROWID;

    -- Known composition of a control-mixture sample in a quantification-bias
    -- estimator.
    CREATE TABLE control_mixture (
        project_id INTEGER NOT NULL,
        sample_id  INTEGER NOT NULL,
        control_id INTEGER NOT NULL REFERENCES control(id) ON DELETE RESTRICT,
        proportion REAL NOT NULL,
        PRIMARY KEY (project_id, sample_id, control_id),
        FOREIGN KEY (project_id, sample_id) REFERENCES project_sample(project_id, sample_id) ON DELETE CASCADE
    ) WITHOUT ROWID;
    CREATE INDEX control_mixture_control ON control_mixture(control_id);

    -- The call for one sample at one locus (genotyping and quantification-bias
    -- projects). peaks: the reference run's annotated peaks (peak_codec.rs).
    -- alleles: JSON array of called bin ids. comment survives re-analysis;
    -- manual calls do not.
    CREATE TABLE genotype (
        project_id       INTEGER NOT NULL,
        sample_id        INTEGER NOT NULL,
        locus_id         INTEGER NOT NULL REFERENCES locus(id) ON DELETE CASCADE,
        reference_run_id INTEGER REFERENCES run(id) ON DELETE SET NULL,
        peaks            BLOB NOT NULL,
        alleles          TEXT NOT NULL DEFAULT '[]',
        failure          INTEGER NOT NULL DEFAULT 0,
        offscale         INTEGER NOT NULL DEFAULT 0,
        manual_curation  INTEGER NOT NULL DEFAULT 0,
        comment          TEXT,
        PRIMARY KEY (project_id, locus_id, sample_id),
        FOREIGN KEY (project_id, sample_id) REFERENCES project_sample(project_id, sample_id) ON DELETE CASCADE
    ) WITHOUT ROWID;
    CREATE INDEX genotype_sample ON genotype(project_id, sample_id);
    CREATE INDEX genotype_run ON genotype(reference_run_id);
    "#,
    // 3: review state of a call. reviewed_key is the review key (hex) of the
    // call as the reviewer confirmed it (api/calls.rs `review_key`): the call
    // reads as reviewed while its current key equals it. NULL = not reviewed.
    r#"
    ALTER TABLE genotype ADD COLUMN reviewed_key TEXT;
    "#,
    // 4: a control's allele whose bin was deleted. The foreign key sets
    // bin_id to NULL; the trigger first keeps the bin's label and size, so
    // "the allele's bin was deleted" stays distinguishable from "never set".
    // Setting the allele again (api/controls.rs) clears them.
    r#"
    ALTER TABLE control_allele ADD COLUMN deleted_bin_label TEXT;
    ALTER TABLE control_allele ADD COLUMN deleted_bin_size REAL;
    CREATE TRIGGER control_allele_bin_deleted BEFORE DELETE ON bin
    BEGIN
        UPDATE control_allele SET deleted_bin_label = OLD.label, deleted_bin_size = OLD.base_size
        WHERE bin_id = OLD.id;
    END;
    "#,
    // 5: plate quality report. report is the JSON of core's
    // quality::PlateQuality (per-well measures, pull-up and crosstalk,
    // negative-control peaks, issues); the severity counts are kept in
    // columns so the plate list reads them without parsing the report.
    // A plate imported before this has no row until it is computed.
    r#"
    CREATE TABLE plate_quality (
        plate_id    INTEGER PRIMARY KEY REFERENCES plate(id) ON DELETE CASCADE,
        version     INTEGER NOT NULL,
        computed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        problems    INTEGER NOT NULL,
        warnings    INTEGER NOT NULL,
        infos       INTEGER NOT NULL,
        report      TEXT NOT NULL
    );
    "#,
];

/// Schema version this build writes.
pub const SCHEMA_VERSION: i64 = MIGRATIONS.len() as i64;
