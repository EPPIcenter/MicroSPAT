# Project building blocks

Shared by the four project pages (bin estimators, artifact estimators, quantification-bias estimators, genotyping). Everything is generic over `ProjectKind`; what differs per kind lives in one table, `KINDS` in `kinds.ts` (names, route, upstream links, parameter section, whether the kind may use every sample). The genotyping page (`features/genotyping`) is the reference user.

## Pieces

| Block | Props | What it does |
|---|---|---|
| `ProjectList` | `kind`, `selectedId`, `onSelect(id \| null)`, `onOpen?(id)`, `onCreated?(detail)`, `onDeleted?(id)`, `extraColumns?`, `toolbar?` | Table of the kind's projects with New, Edit, Duplicate and Delete. Delete shows the engine's `in_use` message in the dialog instead of closing. Empty, it says what the kind is for and, when the workspace lacks what a new one needs (a locus set, samples with runs, a required estimator; `usePrerequisite(kind)`), says so and links there instead of offering New. |
| `ProjectFormDialog` | `kind`, `open`, `onOpenChange`, `project?` (edit), `onSaved?(detail)` | Title, description, locus set (create only), and one picker per upstream link of the kind. Pickers list only projects of the right kind; ones that do not cover the locus set are shown greyed with the missing loci, and stale ones carry a note. On create, a lone locus set and a required link with exactly one compatible estimator are preselected. |
| `ProjectHeader` | `detail`, `selectedLocusIds?`, `actions?`, `leading?`, `onDuplicated?(id)`, `onDeleted?()` | Title, overall status (tooltip sentence), links to upstream estimators and dependents (clickable, via `projectPath`), `AnalyzeButton`, and the edit / duplicate / delete menu. Below it, the engine's `upstream_warnings` as a banner (a linked estimator not current at some loci, or with no artifact model at some loci, so stutter is not accounted for there). |
| `AnalyzeButton` | `detail`, `selectedLocusIds?`, `size?` | Main action analyzes loci that need it (or all when everything is current): "Analyze …" while some locus was never analyzed, "Re-analyze …" otherwise; the menu offers only-stale, selected, or all. Shows the engine task's progress inline; the UI stays usable. `useAnalyze(projectId)` is the same mutation for your own buttons (e.g. "Re-analyze PfY1" in a stale banner). |
| `LocusStatusList` | `detail`, `selected`, `onSelect(id)`, `checked?`, `onCheckedChange?`, `variant: 'list' \| 'strip'`, `trailing?(locus)` | Every locus with current / stale / not analyzed and the engine's reasons (inline in `list`, on hover in `strip`), custom-parameter marker, and the locus's own warnings (`ProjectLocus.warnings`, e.g. an artifact estimator with no artifact model there; `data-testid=locus-warning`). Pass `checked`/`onCheckedChange` for multi-select (analyze or apply parameters to selected). |
| `ParamsPanel` | `detail`, `locusId`, `selectedLocusIds?`, `kindSchema?`, `defaultOpen?`, `onClose?`, `onDirtyChange?(dirty)` | The kind's group, peak filters and scanning for one locus, with help, dirty markers, Save, Save & re-analyze, apply to this locus / selected (only when `selectedLocusIds` is passed) / all loci, revert (Esc) and reset to the kind's defaults (engine-side). Sends only changed keys; with nothing changed and a wider scope it copies this locus's whole parameter set. Unsaved edits are registered with the app's leave guard (`lib/unsaved`), so leaving the page or opening another workspace asks first. The form is per locus and unmounts with the panel: a page that switches locus or closes the panel itself should watch `onDirtyChange` and ask before it does (the genotyping review does). |
| `SamplesTab` | `detail`, `extraColumns?`, `onOpenSample?(row)`, `readOnlyReason?` | The project's samples with Add (pick from the workspace, searchable multi-select; or a CSV of barcodes with a matched / unknown / duplicate / already-added preview) and Remove. With unknown barcodes it adds the matched ones by id; otherwise the engine reads the CSV. Pass `readOnlyReason` where samples come from elsewhere (quantification bias: control mixtures). Kinds with `KINDS[kind].mayUseAllSamples` (bin and artifact estimators) get both sample modes from the project detail's `all_samples`: in *every sample* mode it lists every sample with runs and offers **Use only** / **Leave out** for the selection (both switch to a list through `restrictToSamples`; the engine refuses plain removal in that mode), with no Remove; in *list* mode it is the usual table plus **Use every sample with runs**. A page needs no wrapper for this. Root `data-mode` is `all` or `list`. |
| `SetupSteps` | `current?` (a kind) | The way from an empty workspace to genotypes as a checklist read from the workspace (plates, loci, locus set, plate maps, each estimator, a genotyping project), each step linked; the project pages show it beside an empty list. |
| `AnalysisBadge`, `StaleNotice`, `StaleFrame`, `StatusIcon` | `status`, `what` | One look for status everywhere: shape-coded icon (check, triangle, dashed circle), a banner with the reasons above stale results, and a hatched amber-edged frame around them. Use all three wherever results are shown. |

`useExport(kind, projectId)` (`exportCsv.ts`) exports bins, artifact equations or peak data (genotyping projects and quantification-bias estimators; `run({ allowStale })`) and toasts the file name and row count; `toastExported(file)` is that toast for pages with their own export flow.

Logic you can use without the components: `statusView`, `projectOverall`, `lociNeedingAnalysis` (`status.ts`); `linkCandidates` (`compat.ts`); `paramGroupsFor`, `combinedSchema`, `flattenParams`, `partialParams` (`paramsModel.ts`); `previewSampleCsv` (`samplesCsv.ts`); `restrictToSamples(projectId, keep)` (switch an every-sample estimator to exactly that list, `SamplesTab.tsx`); query hooks and keys (`queries.ts`), including `useProjectTask(kind, title)` for inline task progress.

## Building an estimator page

```tsx
export default function BinEstimatorsPage() {
  const { id } = useParams()
  // `/bin-estimators` → list; `/bin-estimators/:id` → detail
  …
  <ProjectList kind="bin_estimator" selectedId={sel} onSelect={setSel} onOpen={(i) => navigate(`/bin-estimators/${i}`)} />
  …
  <ProjectHeader detail={detail} selectedLocusIds={checked} onDeleted={() => navigate('/bin-estimators')} />
  <ListDetailLayout id="bins"
    list={<LocusStatusList detail={detail} selected={locus} onSelect={setLocus} checked={checked} onCheckedChange={setChecked} />}
    detail={<StaleFrame status={locusStatus}><StaleNotice status={locusStatus} what={`${label} bins`} />…your plot…</StaleFrame>} />
  <ParamsPanel detail={detail} locusId={locus} selectedLocusIds={checked} />
}
```

Query keys start with `projects` and carry the project id second (`['projects', id, …]`), so the engine's `changed` events refresh them; upstream edits are announced without ids and refresh everything.

## Mock mode

`mock.ts` is a generic in-memory project backend (CRUD, samples, parameters with the engine's merge and per-kind defaults, staleness from parameters, samples and upstream analyses, `analyze_project` as a task). A kind adds what its analysis produces with `registerMockAnalyzer(kind, fn)` and seeds demo projects with `registerMockSeed(fn)`; see `features/genotyping/mock.ts`. A hand edit of an estimator's results (bins, artifact classes) calls `bumpRevision(project, locusId)` so projects linked to it go stale while the estimator stays current. Estimators with `all_samples` list every workspace sample with runs and refuse removals, and adding samples (picked or by CSV) switches them to a list, as the engine does.

## Before you use it for another kind

- `params/schemas.ts`: every kind's schema uses the engine's keys, `quantBiasParams` included (`min_peak_height`, `min_true_proportion`, `offscale_threshold`). `paramsModel.test.ts` and `features/artifact-estimators/model/params.test.ts` show how to check keys against an engine `LocusParams`; pass `kindSchema` to `ParamsPanel` only to show a different set of fields.
- The filter schema's `min_peak_height` default is 0 (genotyping); estimators default to 100 on the engine side. The panel's dirty and reset logic uses the engine's values, so this only affects the schema's own default.
