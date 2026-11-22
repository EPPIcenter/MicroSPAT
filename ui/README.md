# MicroSPAT UI

React frontend for MicroSPAT 3. It runs inside the Tauri shell, against the HTTP dev server (`crates/microspat-server`), or on its own with a mock transport.

## Run

```sh
pnpm install
pnpm dev:mock      # no engine: fake data, http://localhost:5173 (gallery at /dev/gallery, development builds only)
pnpm dev           # proxies /api to the engine server (MICROSPAT_API, default http://127.0.0.1:7878)
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm e2e           # Playwright: drives the gallery in mock mode and checks component callbacks
pnpm e2e:real      # Playwright against real engines: every e2e/*.real.spec.ts, one fresh demo workspace each
pnpm shots <dir>   # screenshots of the shell and gallery, light and dark (needs `pnpm dev:mock` running)
pnpm shots:guide <url>   # the user guide's screenshots (docs/images), from a throwaway server started with --demo; see scripts/guide-shots.mjs
```

In a development build you can also add `?mock` to any URL to switch a tab to the mock transport (`?mock=0` switches it back). The sidebar shows a **mock** badge while it is on. A production build ignores `?mock` and always talks to the engine, and it neither lists nor routes the component gallery.

The app uses browser-history routes (`/plates/12`). The HTTP server must answer non-`/api` paths with `index.html`.

### Real-backend end-to-end tests

`pnpm e2e:real` (`scripts/e2e-real.mjs`) runs every `e2e/*.real.spec.ts` against the real engine. It builds the UI, then for each spec file starts `microspat-server` on a free port with a fresh `--demo` workspace in a temp directory, serving the build (`--ui-dir`), runs the spec with `MICROSPAT_E2E_URL` pointing at it, and stops the server. Specs never share a workspace, so one feature's changes cannot break another's. At the end it prints a summary per spec and exits non-zero if any failed; the workspace of a failed spec is kept and its path printed.

```sh
cargo build --release -p microspat-server     # once (the runner's default binary)
pnpm e2e:real                                 # everything
pnpm e2e:real plates setup -j 2               # specs whose file name contains "plates" or "setup", two servers at a time
pnpm e2e:real --no-build -- --grep "ladder"   # reuse ui/dist; arguments after -- go to `playwright test`
```

| variable | default | |
|---|---|---|
| `MICROSPAT_SERVER` | `../target/release/microspat-server` | server binary |
| `MICROSPAT_E2E_UI_DIR` | `ui/dist`, built first | serve an existing build instead (skips the build) |
| `MICROSPAT_E2E_SYNTH_DIR` | unset | synthetic plates for import tests (`cargo run -p microspat-engine --example synth_plate -- <dir>`); tests that need them skip without it. `first-run` needs `SYNTH-11`, `SYNTH-12` and `SYNTH-13` (zip and plate map each, seeds 11–13) and `loci.csv` |
| `MICROSPAT_E2E_SHOTS` | unset | `first-run` saves a screenshot of each step there |
| `MICROSPAT_E2E_KEEP=1` | | keep every temp workspace |

To write one: name it `e2e/<feature>.real.spec.ts`, `test.skip(!process.env.MICROSPAT_E2E_URL)`, and `test.use({ baseURL: process.env.MICROSPAT_E2E_URL })`. Assume the demo workspace and nothing else (`first-run.real.spec.ts` leaves it at once: it creates a new workspace from the workspace menu and walks from empty to exported alleles); the runner picks the file up by its name (config: `playwright.real.config.ts`). You can still point a spec at a server you started yourself: `MICROSPAT_E2E_URL=http://localhost:5181 pnpm exec playwright test -c playwright.real.config.ts e2e/plates.real.spec.ts`. `pnpm e2e` (mock mode, `playwright.config.ts`) ignores real specs.

## Layout

```
src/
  api/           transport.ts (only place that knows Tauri vs browser), query.ts (QueryClient + events, apiQuery),
                 client.ts + bindings/ (GENERATED from the engine: typed `api.<method>()` and every engine type),
                 helpers.ts (COLORS, makePeak, ...), mock/ (mock backend; register fake handlers per method)
  app/           AppShell (sidebar, workspace menu and switching, task tray, theme, unsaved-changes prompt, window title),
                 nav.ts (sections), router.tsx, shortcuts.tsx (the `?` sheet and every section's shortcuts)
  features/      one directory per section: pages, queries, mock handlers, pure models under model/ with tests;
                 tour/ is the guided tour (see "Guided tour")
  layouts/       Page, PageHeader, Pane, ListDetailLayout, TabbedDetail, PlotWorkspace
  components/    TraceViewer, PlateGrid, BinPlot, ArtifactPlot, DataTable, form/, ui/ (primitives)
  lib/           cn, format (counts, RFU, shares, probabilities; always en-US), selection (shared click/shift/cmd rules),
                 unsaved (leave guard), keys (when page shortcuts may act)
  styles/        Tailwind theme tokens (light and dark)
  plot/          scales, zoom/pan math, decimation, hit testing, canvas sizing, plot theme
  params/        parameter schemas with defaults and help text from the old manual
  stores/        zustand: tasks, toasts, theme
  mock/data.ts   deterministic synthetic traces, plates, scatter data
  pages/         dev/Gallery (development builds only)
  test/          Vitest setup
e2e/             Playwright specs: *.spec.ts in mock mode, *.real.spec.ts against an engine
scripts/         shots.mjs (screenshots), e2e-real.mjs (real-backend runner)
```

## Adding a feature page

1. Create `src/features/<section>/` with the page component(s), queries and mock handlers.
2. Fetch with TanStack Query. Make keys start with the entity name the engine sends in `changed` events, for example `['plates']`, `['plates', id]` or `['plates', id, 'wells']`. A `changed` event for `plates` then refetches all of them; when the event names ids, keys of one item (`['plates', 3, …]`, numeric id second) refetch only if their id is listed, while lists always do. `apiQuery(key, method, params)` builds typed options (`rpcQuery` is the untyped fallback for mock-only methods):
   ```ts
   const plates = useQuery(apiQuery(['plates'], 'list_plates'))            // typed: PlateSummary[]
   const plate = useQuery(apiQuery(['plates', id], 'get_plate', { id }))   // typed: PlateDetail
   const del = useMutation({ mutationFn: (id: number) => api.delete_plate({ id }), meta: { errorTitle: 'Could not delete plate' } })
   ```
   `METHOD_CHANGES` in `api/client.ts` lists the entities each method announces, so you can see which keys a mutation refreshes. Query and mutation errors toast automatically. Pass `meta: { silent: true }` to handle an error yourself. Long work should be an engine task: the tray shows its progress, and a failure toasts.
3. Register mock handlers so the page works under `pnpm dev:mock`:
   ```ts
   // src/features/plates/mock.ts (import it from src/api/mock/handlers.ts)
   registerMocks({ list_plates: () => [...], recalc_ladder: async (p, ctx) => { await ctx.runTask('ladder', 'Recalculating', 2000); ctx.changed('plates') } })
   ```
4. Add the section to `NAV` (`app/nav.ts`) and its page to `FEATURE_PAGES` in `app/router.tsx` (one route, `/<section>/:id?`). Use the selected id from the URL (`useParams`) as the selection, and show `<NotFound what="plate" error={…} />` (`components/ui/EmptyState`) when the URL names an item that does not exist (deleted, or a link from another workspace).
5. With nothing to show yet, say what to do first and link to the prerequisite (see `usePrerequisite` in `features/projects-shared/ProjectList.tsx`); a disabled action says why in its title.
6. Compose your page from the layouts:
   ```tsx
   <Page header={<PageHeader title="Plates" actions={…} />}>
     <ListDetailLayout id="plates"
       list={<Pane title="Plates" fill><DataTable … selectionMode="single" /></Pane>}
       detail={<TabbedDetail title={plate.label} tabs={[{ value: 'ladder', label: 'Ladder', content: <PlotWorkspace plot={<TraceViewer className="h-full w-full" … />} /> }]} />} />
   </Page>
   ```

Conventions: compact controls (`Button size="sm"`), tokens rather than raw colors (`bg-surface`, `text-muted`, `border-line`, `var(--dye-blue)`), and keyboard access for every action. Never say "homozygous" or "heterozygous", and never cap alleles per locus: samples are mixtures.

The same action looks and reads the same everywhere: titles and labels in sentence case ("Locus sets"); Delete is `variant="danger-ghost"` with a trash icon and a confirmation that names the item; "Analyze" for results never computed and "Re-analyze" for redoing them; exports are "Export … CSV" with a download icon and toast "Exported <file>" with its row count (`useExport`, `toastExported` in `features/projects-shared/exportCsv.ts`); stale results use `StaleNotice` and `StaleFrame`.

Page shortcuts belong on `window` (through a ref to the latest handler, as `features/plates/PlateDetailView.tsx` does), not on a panel's `onKeyDown`: focus is often elsewhere (the body after a failed save, a grid, a plot). Skip them with `shortcutBlocked(e)` from `lib/keys` (typing in a field, or a dialog, menu or popup list open; a page's own list boxes do not count). List them in `SECTION_SHORTCUTS` (`app/shortcuts.tsx`): `?` anywhere shows the current section's shortcuts, and `openShortcuts()` opens the sheet from a hint bar.

Numbers go through `lib/format`: `fmtRfu` (whole RFU), `fmtShare` (allele shares and prevalence: one decimal below 10%), `fmtProbability` (three decimals), `fmtPercent`, `countOf` ("1,234 samples"). All use en-US separators, as the exports do.

### Unsaved changes (`lib/unsaved.tsx`)

A page that holds edits the engine has not stored registers them, and leaving then asks first, in one dialog for the whole app:

```ts
useUnsavedChanges(dirty, `changes to ladder ${ladder.label}`)   // what would be lost, as a noun phrase
bypassUnsaved(() => navigate(`/ladders/${created.id}`))          // after saving, cancelling or deleting
```

- Blocked: any navigation that changes the path (sidebar, another item of the same section, back/forward). Query-string changes (`?well=B02`) are not blocked, so a page keeps its edits across them.
- The prompt (`<UnsavedChangesPrompt />`, mounted once in `AppShell`) lists what every dirty source holds and offers "Keep editing" or "Discard and leave". Reloading or closing the tab gets the browser's own prompt.
- Register only real edits: an untouched "new item" form is not dirty. Navigations the page starts right after resolving its edits go through `bypassUnsaved`, since the store still holds them until the next render.
- `hasUnsavedChanges()` / `unsavedDescriptions()` are there for actions outside routing. Creating or opening a workspace (the workspace menu, ⌘O, and the desktop app's native menu) asks first with them. A switch takes the routed page off screen before the engine changes workspace (page-local drafts go with it), then resets the query cache, clears the import panel and opens Plates. Nothing of the previous workspace stays on screen, and no query asks the new workspace for the previous one's items; a page needs nothing for this. If the switch fails, the page comes back.

## Guided tour (`features/tour`)

A tour of the demo study for new users: a start dialog, then a card that moves from stop to stop while the page behind it is dimmed and locked. `<Tour />` is mounted once in `AppShell`; `openTour()` (`store.ts`) starts it from anywhere. It opens from the workspace menu, the desktop app's Help menu (`start_tour`), the empty Plates page, and by itself on the first launch that finds a workspace without plates (once per computer, `localStorage` key `microspat.tour.offered`).

- The tour runs only on the demo study (`findDemo` in `model.ts` looks for the project titled "Demo genotyping" and follows its links), so step text can name what is on screen. The start dialog loads the demo when the workspace lacks it.
- The stops are data, in `steps.ts`: a title, paragraphs, the page (`path`), the element to highlight (`target`, a CSS selector; the first visible match), and the preferred side for the card. To add or move a stop, edit that list. Point at an existing `data-testid` or `aria-label`, or give the element a `data-tour` attribute.
- While it runs, a layer over the window takes every pointer event, and a capturing `keydown` listener keeps keys from the page. The card is a `role="dialog"`, so `shortcutBlocked` holds page shortcuts off too. Nothing in the workspace can change during a tour.
- `openTour()` refuses to start over unsaved edits, because the tour navigates. A workspace switch ends a running tour.
- Card placement is pure (`placeCard` in `model.ts`) and unit-tested. `e2e/tour.real.spec.ts` walks every stop against the real engine and checks the lock and the first-launch offer; when you add a stop, add its id to `STOPS` there.

The user guide (`docs/user-guide.md`) describes the tour and shows a screenshot of it. Its screenshots come from `pnpm shots:guide`.

## Visualization components

All plots draw on canvas, follow the theme, handle resizes and device pixel ratio, and fill their box. Give them a size, for example `className="h-[320px]"` or `h-full w-full`. A plot reports its current x view in a `data-x-domain` attribute (and TraceViewer its unit in `data-x-mode`, `bp` or `index`), which the e2e tests use; both change when the plot redraws, on the next animation frame, so a test that changes the view waits for them before reading positions.

Pointer input never acts on a stale frame: a click is hit-tested after drawing any pending frame, against the plot's measured size (a panel that just opened or closed above a plot changes it a frame before the ResizeObserver reports it).

### TraceViewer (`components/TraceViewer`)

| prop | type | notes |
|---|---|---|
| `series` | `TraceSeries[]` | `{ id, color: Color \| css, data: ArrayLike<number>, baseSizes?, label?, overlay?, hidden? }`. Overlays are drawn faded (other wells). |
| `xMode` | `'bp' \| 'index'` | default: `bp` if any series has `baseSizes` |
| `peaks` | `TracePeak[]` | `{ id, seriesId?, index, size, height, state, label?, detail? }`. `state` is one of `called`, `manual-on`, `manual-off`, `artifact`, `flagged`, `below`, `candidate`. `toTracePeaks(peaks: Peak[])` and `peakStateOf()` map engine peaks. |
| `bins` | `TraceBin[]` | `{ id, label, center, halfWidth, highlighted? }` in bp |
| `locusRange` | `[bp, bp]` | the area outside is shaded; also the default view |
| `ladder` | `LadderMarker[]` | `{ index, size \| null, seriesId?, status?: 'ok' \| 'outlier' \| 'unassigned' }` |
| `threshold` | `number` | dashed horizontal line (RFU) |
| `xDomain` / `defaultXDomain` / `xBounds` / `onXDomainChange` | | the x view, which can be controlled |
| `yMax` / `onYMaxChange` | `number \| null` | lock the y top; null means auto-fit to the visible data |
| `onPeakClick(peak, click)` | | fires immediately |
| `onBackgroundClick(click)` | | fires about 300 ms after the click, so a double-click (reset) never triggers it; a second click elsewhere delivers the pending one at once, so quick clicks are never dropped. `click` = `{ x, index, snapIndex, bp, height, seriesId, shiftKey, altKey, metaKey }`. `snapIndex` is the local maximum within `snapRadius` points, which is where a manual ladder peak goes. |
| `clickSeriesId`, `snapRadius`, `resetKey`, `showControls`, `showLegend`, `xLabel`, `yLabel`, `ref` (`resetView`, `setXDomain`, `getXDomain`) | | |

`TracePeak` also takes `selected` (a ring), `tag` (a small label beside the marker), `expected` (an artifact-height error bar), and `stateLabel`, which replaces the state's name in the hover readout (ladder peaks are not alleles). A peak with a non-finite `size` shows its index instead of a size. Shift+drag is box zoom, so a Shift-click never arrives as a click; use Alt for click modifiers.

Interaction:

- Mouse: wheel zooms x at the cursor, a horizontal wheel or Shift+wheel pans, Alt+wheel scales y. Drag pans. Shift+drag box-zooms and locks y. Double-click resets.
- Keyboard: ←/→ pan, +/− zoom, ↑/↓ scale y, `a` returns y to auto, `0` resets.
- Hover shows size, index and the height of each dye, or the details of a peak.
- Zoomed out, each pixel column draws only its min and max, so 5 dyes × 10k points plus overlays stay smooth.

### PlateGrid (`components/PlateGrid`)

`format: 96 | 384` · `wells: Record<'A01', WellDatum>` · `mode: 'status' | 'signal'` · `selected: string[]` · `onSelectionChange(wells)` · `selectionMode?: 'single' | 'multi'` · `onWellActivate?(well)` · `signalScale?` · `showLegend?` · `highlighted?: string[]` (outlined wells, apart from the selection, e.g. those a quality issue names; `highlightLabel` is what screen readers hear after their name).

`WellDatum` is `{ status?: 'ok' | 'flagged' | 'failed' | 'empty', value?: number | null, dyes?: { color, value }[], disabled?, label?, detail?: string[], color?, glyph?, marker?: { color, label? } }`. `color` and `glyph` override the fill and the status glyph (for states the palette lacks), and `marker` draws a corner flag with a tooltip line. For a continuous custom fill that follows the theme, `rampColor(t, ['--scale-good', '--scale-low', '--scale-none'])` mixes evenly spaced theme variables (the Plates page colors wells by quality measures this way). A dye `value` of `undefined` means no data for that dye.

- Signal is in RFU, on a log scale from none (red) through low, good and strong to off-scale (violet). `null` means measured with no signal. `undefined` means no data.
- A well with several `dyes` is split into one stripe per dye.
- Mouse: click selects, Cmd/Ctrl-click toggles, Shift-click selects a rectangle, and row or column headers select a whole line.
- Keyboard: arrows move (Shift extends), Space toggles, Enter activates, Cmd/Ctrl+A selects all, Esc clears.

### BinPlot (`components/BinPlot`)

`points: { x: bp, y: relHeight }[]` · `bins: Bin[]` · `selectedId?` · `onSelect?(id | null)` · `onBinsChange?(bins, change)` · `color?` · `locusRange?` · `defaultBuffer?` (0.75) · `readOnly?` · `guides?: number[]` (faint dotted lines, e.g. the repeat grid) · `binStyle?(bin) → { tone?: 'warn' | 'danger', dashed? }` (flagged / unsaved bins) · `followSelection?` (pan to a bin selected from outside) · `density?: 'auto' | 'points' | 'density'`.

Above 2,500 points (`DENSITY_THRESHOLD`) the scatter is drawn as a cached density raster (opacity grows with the log of the count per cell), so tens of thousands of peaks pan, zoom and drag smoothly and piles stay readable.

`change` is `{ type: 'move' | 'resize' | 'add' | 'delete', bin }`. The plot holds no server state: pass the new `bins` back. New bins get negative ids (`id <= 0` means unsaved). Edits snap to 0.001 bp.

- Mouse: drag a bin's body to move it and an edge to resize it (within 5 px of an edge). Double-click or right-click to add. Wheel zooms, drag on empty space pans. A drag commits where the pointer was released even when the release arrives before React has drawn the last move (pointer moves render at a lower priority than the release).
- Keyboard: Del deletes the selected bin, ←/→ nudge it, [ and ] change its width, Tab selects the next bin.

### ArtifactPlot (`components/ArtifactPlot`)

`points: { x: parent size, y: artifact rel. height }[]` · `segments: { start, end, slope, intercept, sd }[]` · `breakpoints: number[]` · `onBreakpointsChange?(bps, { type: 'add' | 'remove', x })` · `title?` · `color?` · `yMax?` · `readOnly?` · `selectedSegment?` · `onSegmentClick?(index)` (a click, not a drag, over a segment) · `markers?: { x, y?, label? }[]`.

The plot draws ±1 and ±2 SD bands around each segment.

- Double-click empty space to add a breakpoint. Double-click a breakpoint to remove it, or select it and press Del. Right-click opens a menu.
- Hovering over a segment shows its equation.

### DataTable (`components/DataTable`)

`data` · `columns: DataColumn<T>[]` (`{ id, header, value(row), sortValue?(row), cell?(row), width?, minWidth?, align?, sortable?, searchable?, description? }`; `sortValue` sorts by something other than the filtered and copied `value`, such as a severity rank behind a text label) · `getRowId` · `selectionMode` · `selected` · `onSelectionChange(ids)` · `onRowActivate?(row)` · `filterable?` · `filterPlaceholder?` · `toolbar?` · `hideToolbar?` · `initialSort?` · `rowHeight?` (26) · `clickToggles?` (checklist behavior) · `emptyMessage?` · `ariaLabel?` · `scrollToId?`.

The table is built on TanStack Table v9 (sorting, global text filter, column resizing) and TanStack Virtual. Its selection rules match PlateGrid; a click selects among the rows the filter shows. Cmd/Ctrl+C copies the selected rows as CSV, or all rows if none are selected. `scrollToId` centers that row once it is in the data (for deep links such as `/samples/123`) and again only when the id changes. Counts print with thousands separators ("2,500 rows").

### Forms (`components/form`)

- Fields: `NumberField` (unit suffix, ↑/↓ steps with Shift ×10 and Alt ×0.1, keeps partial text such as `0.`, shows a new value from outside in the same render), `TextField`, `SelectField`, `CheckboxField` and `ToggleField`. Each takes `label`, `help` (tooltip), `error`, `hint` and `dirty`.
- `ParameterForm({ schema, values, onSave(values, changedKeys), disabled?, onDirtyChange? })` renders a `ParamSchema` (`{ id, sections: [{ title, fields: ParamField[] }] }`). A field can have bounds, `integer`, `nullable`, `visibleWhen` and a cross-field `validate`. The form shows dirty markers. Save is disabled while the form is invalid or unchanged. Revert (Esc) discards edits, and Defaults resets the fields to the schema defaults.
- `useParameterForm` exposes the same state for custom layouts.
- Ready-made schemas live in `params/schemas.ts`: scanning, filter, ladder, bin, artifact, quantification bias and genotyping. Their keys are the UI's guess at the engine's parameter names. Rename them there when the API lands.

### Primitives (`components/ui`)

`Button`, `IconButton`, `Badge`, `StatusChip`, `DyeChip`, `Tooltip`, `Dialog`, `ConfirmDialog` (`onConfirm` may return a promise), `DropdownMenu*`, `ContextMenu*`, `Tabs*`, `SplitView` (resizable, size persisted by `id`, keyboard-resizable), `EmptyState` (actions in a row), `NotFound` (an item the URL names that is gone or fails to load), `FileDropZone` (click → `pickFiles`; drop → upload in the browser or native paths in Tauri), `ProgressBar`, `Spinner`, `Kbd`, `Toaster` (`toast.error | success | info(title, description?)` from anywhere, including non-React code).

## Transport contract

`src/api/transport.ts`:

- `rpc<T>(method, params?)`
  - Tauri: `invoke('rpc', { method, params })`.
  - Browser: `POST /api/rpc/<method>` with JSON body `params` (or `null`). A 2xx body is the result. A non-2xx body is `{ "error": { "code", "message" } }`.
  - Both reject with `RpcError { code, message }`. Network failures use code `transport`.
- `subscribe(handler)`
  - Tauri: event `microspat://event`.
  - Browser: `EventSource('/api/events')`, one JSON `AppEvent` per message.
  - `AppEvent` is either `{ type: 'task', task: { id, kind, label, status: 'running' | 'done' | 'failed', progress: number | null, message: string | null } }` or `{ type: 'changed', entity, ids: number[] | null }`.
- `pickFiles({ multiple?, directory?, extensions? })` returns `{ path, name }[]`.
  - Tauri: dialog plugin paths.
  - Browser: the files are uploaded as multipart, field `files` (repeated), to `POST /api/upload` with the header `X-MicroSPAT-Request` (the server refuses uploads without it, so another site cannot post files). It returns `{ path, name }[]` of server-side temp files, and over HTTP those are the only paths the server accepts in RPC parameters. The upload is skipped in mock mode.
- `saveTextFile(name, content)`
  - Tauri: a save dialog, then `rpc('write_text_file', { path, content })`.
  - Browser: Blob download.
- `pickSavePath(name, exts)` and `pickOpenPath(exts)` return a path in Tauri and `null` in the browser. Use `hasNativePaths()` to hide workspace open and save-as.
- `onShellAction(handler)` delivers actions the desktop shell asks the UI to run, as a string: the native menu's `new_workspace`, `open_workspace`, `save_workspace_as`, `load_demo_data` and `start_tour`, and, when the OS hands over a `.microspat` file, `workspace_opening` before the shell opens it and `workspace_opened` or `workspace_open_failed` after (Tauri event `microspat://action`). It returns an unsubscribe function and does nothing outside Tauri. `AppShell` handles all of them; a page does not need to.
- Extras: `uploadFiles(File[])` uploads drag-and-drop files in the browser, `chooseBrowserFiles(opts)` opens the browser's file chooser and returns the `File`s without uploading (to read a CSV in place), `onNativeFileDrop` delivers Tauri webview drops, `downloadText(name, content)` is the browser half of `saveTextFile`, `isTauri()` and `transportKind()` report which transport is active, and `setBackendForTesting(backend)` swaps the transport in unit tests.

## Engine API (generated)

`src/api/client.ts` and `src/api/bindings/` are generated from the engine's method registry and Rust types, so method names and types cannot drift. Do not edit them. After changing engine methods or types, regenerate them from the repository root:

```sh
cargo run -p microspat-engine --bin gen-bindings
```

A Rust test (`cargo test -p microspat-engine`) fails while the checked-in files are stale.

- `api.<method>(params)` calls one method, for example `api.get_plate({ id })`. Methods without params take none: `api.list_plates()`.
- `Methods`, `MethodName`, and `call(method, params)` give typed access by name. `apiQuery(key, method, params?)` in `query.ts` builds typed query options.
- `METHOD_CHANGES` lists the entities each method may announce in `changed` events. `TASK_METHODS` lists the methods that run as background tasks; these resolve when the task finishes and report progress to the task tray meanwhile.
- Types: `import type { PlateDetail, Peak, Color } from '@/api/bindings'`. Ids are `number`.
- Errors reject with `RpcError`. Its `code` is one of `not_found`, `invalid`, `conflict`, `in_use`, `no_workspace`, `unknown_method`, `io`, `internal` (or `transport`). Its `message` is ready to show.

`crates/microspat-engine/README.md` has the method list, the entity names, and how to add methods. To run against the real engine, start `cargo run -p microspat-server -- --workspace /tmp/dev.microspat --demo` and run `pnpm dev`. To generate synthetic FSA files for trying imports, run `cargo run -p microspat-engine --example synth_plate -- /tmp/synth`.

The shell uses `get_workspace_info`, `new_workspace { path?: string | null }`, `open_workspace { path }`, `save_workspace_as { path }`, `load_demo_data`, and `write_text_file { path, content }` (Tauri only; the HTTP server refuses it).
