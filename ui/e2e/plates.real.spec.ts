/**
 * Plates screen against a real engine. Run with `pnpm e2e:real plates`
 * (a fresh demo workspace of its own; see ui/README.md). Set
 * MICROSPAT_E2E_SYNTH_DIR to the output of the synth_plate example (seed 11)
 * to include the import tests.
 *
 * The workspace needs the demo plates (DEMO-1..3). The spec leaves it as it
 * found it (ladder edits reverted, plate-map preview cancelled, the imported
 * plate deleted), so it can also run against a shared server.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'

const BASE = process.env.MICROSPAT_E2E_URL
const SYNTH = process.env.MICROSPAT_E2E_SYNTH_DIR
const SYNTH_NAME = process.env.MICROSPAT_E2E_SYNTH_NAME ?? 'SYNTH-11'

test.skip(!BASE, 'MICROSPAT_E2E_URL is not set')
test.describe.configure({ mode: 'serial' })
test.use({ baseURL: BASE, viewport: { width: 1280, height: 800 } })

async function rpc<T>(page: Page, method: string, params: unknown): Promise<T> {
  const res = await page.request.post(`/api/rpc/${method}`, { data: params })
  expect(res.ok(), `${method} failed: ${await res.text()}`).toBeTruthy()
  return (await res.json()) as T
}

async function openPlate(page: Page, label: string) {
  await page.getByRole('grid', { name: 'Plates' }).getByText(label, { exact: true }).click()
  await expect(page.getByTestId('plate-detail')).toHaveAttribute('data-plate', label)
}

function well(page: Page, label: string): Locator {
  return page.locator(`[data-testid=plate-grid] [data-well=${label}]`)
}

/** Page x of data index `v` on a TraceViewer (margins: left 52, right 12). */
async function xOf(plot: Locator, v: number): Promise<number> {
  const box = (await plot.boundingBox())!
  const [d0, d1] = ((await plot.getAttribute('data-x-domain')) ?? '0,1').split(',').map(Number) as [number, number]
  return box.x + 52 + ((v - d0) / (d1 - d0)) * (box.width - 64)
}

test('lists the demo plates and opens one', async ({ page }) => {
  await page.goto('/plates')
  const list = page.getByRole('grid', { name: 'Plates' })
  for (const p of ['DEMO-1', 'DEMO-2', 'DEMO-3']) await expect(list.getByText(p, { exact: true })).toBeVisible()
  await openPlate(page, 'DEMO-2')
  await expect(page.getByTestId('plate-facts')).toContainText('HD ROX 400')
  await expect(page.locator('[data-testid=plate-grid] [role=gridcell]')).toHaveCount(96)
})

test('switches between Ladder and Signal views', async ({ page }) => {
  await page.goto('/plates')
  await openPlate(page, 'DEMO-2')
  const grid = page.getByRole('grid', { name: /Plate DEMO-2/ })
  await expect(grid).toHaveAttribute('aria-label', /ladder view/)
  await page.getByRole('radio', { name: 'Signal' }).click()
  await expect(grid).toHaveAttribute('aria-label', /signal view/)
  // Per-dye stripes in every mapped, sized well.
  await expect(well(page, 'B02').locator('div.flex-1')).toHaveCount(3)
  await page.keyboard.press('l')
  await expect(grid).toHaveAttribute('aria-label', /ladder view/)
})

test('selects wells by mouse and keyboard, keeping the zoom', async ({ page }) => {
  await page.goto('/plates')
  await openPlate(page, 'DEMO-2')
  await well(page, 'B02').click()
  await expect(page.getByTestId('well-label')).toHaveText('B02')
  await expect(page).toHaveURL(/well=B02/)
  const plot = page.getByTestId('trace-viewer')
  await expect(plot).toHaveAttribute('data-x-domain', /.+/)
  // Zoom in, then move: the x view must survive the well change.
  const initial = await plot.getAttribute('data-x-domain')
  await plot.focus()
  // Each press redraws on the next frame: wait for one before the next, and
  // read the view only once both have landed.
  await page.keyboard.press('+')
  await expect(plot).not.toHaveAttribute('data-x-domain', initial!)
  const once = await plot.getAttribute('data-x-domain')
  await page.keyboard.press('+')
  await expect(plot).not.toHaveAttribute('data-x-domain', once!)
  const zoomed = await plot.getAttribute('data-x-domain')
  await page.getByRole('grid', { name: /Plate DEMO-2/ }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('well-label')).toHaveText('B03')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('well-label')).toHaveText('C03')
  await page.keyboard.press(']')
  await expect(page.getByTestId('well-label')).toHaveText('C04')
  await expect(page.getByTestId('trace-viewer')).toHaveAttribute('data-x-domain', zoomed!)
  // `n` jumps to the next well that needs a look (C09 failed on DEMO-2).
  await page.keyboard.press('n')
  await expect(page.getByTestId('well-label')).toHaveText('C09')
  await expect(page.getByTestId('well-sizing')).toContainText('Failed')
})

interface WellJson {
  id: number
  label: string
  sizing: string
  ladder_peaks: { index: number; size: number }[]
  ladder_candidates: { index: number; height: number }[]
}

async function plateWell(page: Page, plateLabel: string, wellLabel: string): Promise<WellJson> {
  const plates = await rpc<{ id: number; label: string }[]>(page, 'list_plates', null)
  const plate = await rpc<{ wells: { id: number; label: string }[] }>(page, 'get_plate', { id: plates.find((p) => p.label === plateLabel)!.id })
  return rpc<WellJson>(page, 'get_well', { id: plate.wells.find((w) => w.label === wellLabel)!.id })
}

/** Click the ladder trace at data index `v` (below the peak tops, so it is a background click). */
async function clickAt(page: Page, v: number, modifiers: 'Alt'[] = []) {
  const plot = page.getByTestId('trace-viewer')
  const box = (await plot.boundingBox())!
  // mouse.click() takes no modifiers: hold them on the keyboard.
  for (const m of modifiers) await page.keyboard.down(m)
  await page.mouse.click(await xOf(plot, v), box.y + box.height * 0.75)
  for (const m of modifiers) await page.keyboard.up(m)
  // Background clicks land after the double-click window.
  await page.waitForTimeout(350)
}

/** Start editing the ladder; wait until the plot shows data points, so positions read from it are in that unit. */
async function editLadder(page: Page) {
  await page.getByRole('button', { name: 'Edit ladder' }).click()
  await expect(page.getByTestId('trace-viewer')).toHaveAttribute('data-x-mode', 'index')
}

/** Wait until the live preview is of the current draft and says `state`. */
async function previewSettles(page: Page, state: string) {
  const preview = page.getByTestId('ladder-preview')
  await expect(preview).toHaveAttribute('data-pending', 'false')
  await expect(preview).toHaveAttribute('data-after', state)
}

async function chooseSize(page: Page, label: RegExp) {
  await page.getByRole('combobox', { name: 'Ladder size of the selected peak' }).click()
  await page.getByRole('option', { name: label }).click()
  await expect(page.getByRole('listbox')).toHaveCount(0)
  // The select's outside-click guard swallows a click that follows at once.
  await page.waitForTimeout(150)
}

test('edits a failed ladder from the candidates, with a live preview, and reverts', async ({ page }) => {
  await page.goto('/plates')
  await openPlate(page, 'DEMO-2')
  await well(page, 'A09').click()
  await expect(page.getByTestId('well-label')).toHaveText('A09')
  await expect(page.getByTestId('well-sizing')).toContainText('Failed')
  // Why, in the inspector and in the grid's hover.
  await expect(page.getByTestId('sizing-reason')).toContainText('only 7 usable ladder peaks, need 16')
  await well(page, 'A09').hover()
  await expect(page.getByTestId('plate-grid')).toContainText('only 7 usable ladder peaks')

  // The failed well has no ladder peaks, but the fitter's candidates are shown to click.
  const w = await plateWell(page, 'DEMO-2', 'A09')
  expect(w.ladder_peaks).toHaveLength(0)
  expect(w.ladder_candidates.length).toBeGreaterThanOrEqual(7)
  await editLadder(page)
  const editor = page.getByTestId('ladder-editor')
  await expect(editor).toBeVisible()

  // Three peaks cannot be fitted: the preview says so and Apply stays off.
  for (const c of w.ladder_candidates.slice(0, 3)) await clickAt(page, c.index)
  await expect(page.getByTestId('ladder-count')).toContainText('3 of 21')
  await previewSettles(page, 'failed')
  await expect(page.getByTestId('ladder-reason')).toContainText('need 4')
  await expect(editor.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()

  // All seven: fitted, but a handful of the ladder's 21 peaks is not usable, and the preview says why.
  for (const c of w.ladder_candidates.slice(3)) await clickAt(page, c.index)
  await expect(page.getByTestId('ladder-count')).toContainText(`${w.ladder_candidates.length} of 21`)
  await previewSettles(page, 'unusable')
  await expect(page.getByTestId('ladder-reason')).toContainText(`Only ${w.ladder_candidates.length} of the ladder's 21 peaks are assigned`)
  await expect(page.getByTestId('ladder-unsaved')).toContainText(`+${w.ladder_candidates.length} new`)

  // Alt-click removes a peak; clicking its candidate brings it back.
  await clickAt(page, w.ladder_candidates[0]!.index, ['Alt'])
  await expect(page.getByTestId('ladder-count')).toContainText(`${w.ladder_candidates.length - 1} of 21`)
  await clickAt(page, w.ladder_candidates[0]!.index)
  await expect(page.getByTestId('ladder-count')).toContainText(`${w.ladder_candidates.length} of 21`)

  // Esc discards with focus anywhere on the page (here: the plate grid).
  await page.getByRole('grid', { name: /Plate DEMO-2/ }).focus()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('ladder-unsaved')).toHaveCount(0)
  for (const c of w.ladder_candidates) await clickAt(page, c.index)
  await expect(page.getByTestId('ladder-count')).toContainText(`${w.ladder_candidates.length} of 21`)
  await previewSettles(page, 'unusable')

  // ⌘↵ applies from the grid too; the well is now unusable with the reason everywhere.
  await page.getByRole('grid', { name: /Plate DEMO-2/ }).focus()
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.getByTestId('well-sizing')).toContainText('Unusable')
  await expect(page.getByTestId('quality-change')).toHaveAttribute('data-after', 'unusable')
  await expect(page.getByTestId('ladder-reason')).toContainText("Only 7 of the ladder's 21 peaks are assigned")
  await expect(page.getByTestId('well-inspector').getByText('edited by hand')).toBeVisible()
  await expect(well(page, 'A09').locator('[data-marker]')).toHaveCount(1)
  await expect(page.getByTestId('plate-detail').getByTestId('sizing-counts').locator('[data-state=unusable]')).toHaveAttribute('title', /A09: Only 7 of the ladder's 21 peaks/)

  await page.getByRole('button', { name: 'Automatic fit' }).click()
  await expect(page.getByTestId('well-sizing')).toContainText('Failed')
  await expect(page.getByTestId('well-inspector').getByText('edited by hand')).toHaveCount(0)
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByTestId('ladder-editor')).toHaveCount(0)
})

test('corrects ladder sizes explicitly and previews the result', async ({ page }) => {
  const w = await plateWell(page, 'DEMO-2', 'A08')
  expect(w.sizing).toBe('good')
  const at = (size: number) => w.ladder_peaks.find((p) => p.size === size)!.index
  await page.goto('/plates')
  await openPlate(page, 'DEMO-2')
  await well(page, 'A08').click()
  await editLadder(page)
  const reason = page.getByTestId('ladder-reason')

  // Without the 400 bp peak, PfY2 (380–450 bp) lies past the sized range: flagged, with the locus named.
  await clickAt(page, at(400), ['Alt'])
  await previewSettles(page, 'flagged')
  await expect(reason).toContainText('PfY2')
  await expect(reason).toContainText('outside the sized range')
  // Clicking the removed peak brings it back: nothing left to save.
  await clickAt(page, at(400))
  await expect(page.getByTestId('ladder-unsaved')).toHaveCount(0)

  // Say the 90 bp peak is 100 bp: two peaks would have one size, and the preview refuses it.
  await clickAt(page, at(90))
  await expect(page.getByTestId('peak-controls')).toContainText(`#${at(90)}`)
  await chooseSize(page, /^100 bp/)
  await expect(page.getByTestId('ladder-unsaved')).toContainText('1 size set by hand')
  await previewSettles(page, 'failed')
  await expect(reason).toContainText('Sizes must increase with the peak index')
  await chooseSize(page, /^Fitter’s choice/)
  await expect(page.getByTestId('ladder-unsaved')).toHaveCount(0)

  // Assign every peak one ladder step up: explicit pairs, fitted, and judged unusable.
  await clickAt(page, at(400), ['Alt'])
  await previewSettles(page, 'flagged')
  await clickAt(page, at(50))
  await chooseSize(page, /^60 bp/)
  await page.getByRole('button', { name: 'Shift the rest too' }).click()
  await expect(page.getByTestId('ladder-unsaved')).toContainText('20 sizes set by hand')
  await previewSettles(page, 'unusable')
  await expect(reason).toContainText('leave-one-out sizing error')
  await page.getByTestId('ladder-editor').getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByTestId('well-sizing')).toContainText('Unusable')
  const stored = await plateWell(page, 'DEMO-2', 'A08')
  expect(stored.ladder_peaks.find((p) => p.index === at(50))!.size).toBe(60)

  await page.getByRole('button', { name: 'Automatic fit' }).click()
  await expect(page.getByTestId('well-sizing')).toContainText('Good')
})

test('asks before leaving unsaved ladder edits', async ({ page }) => {
  const w = await plateWell(page, 'DEMO-2', 'A09')
  await page.goto('/plates')
  await openPlate(page, 'DEMO-2')
  await well(page, 'A09').click()
  await editLadder(page)
  await clickAt(page, w.ladder_candidates[0]!.index)
  await expect(page.getByTestId('ladder-unsaved')).toBeVisible()
  // Moving to another well keeps the draft without asking.
  await well(page, 'A10').click()
  await expect(page.getByTestId('well-label')).toHaveText('A10')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Ladders' }).click()
  const prompt = page.getByRole('alertdialog')
  await expect(prompt).toContainText('ladder edits on well A09 of DEMO-2')
  await prompt.getByRole('button', { name: 'Keep editing' }).click()
  await expect(page).toHaveURL(/\/plates\//)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Ladders' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Discard and leave' }).click()
  await expect(page).toHaveURL(/\/ladders/)
})

test('previews a corrected plate map from the engine’s assignments', async ({ page }) => {
  await page.goto('/plates')
  await openPlate(page, 'DEMO-1')
  const plates = await rpc<{ id: number; label: string }[]>(page, 'list_plates', null)
  const map = await rpc<{ content: string }>(page, 'export_plate_map', { id: plates.find((p) => p.label === 'DEMO-1')!.id })
  // One cell changes to a new barcode.
  const csv = map.content.replace(/^A01,D1-S001,/m, 'A01,D1-E2E-NEW,')
  await page.getByRole('button', { name: 'Plate map' }).click()
  const dialog = page.getByRole('dialog', { name: /Apply plate map/ })
  const chooser = page.waitForEvent('filechooser')
  await dialog.getByTestId('choose-map').click()
  await (await chooser).setFiles({ name: 'DEMO-1-fixed.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  const preview = dialog.getByTestId('map-preview')
  await expect(preview).toHaveAttribute('data-status', 'samples')
  const rows = dialog.getByTestId('map-assignments').locator('tbody tr')
  // Only the changed well is listed at first; its cell shows the old barcode struck out.
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toHaveAttribute('data-well', 'A01')
  await expect(rows.first().locator('[data-change=unknown]')).toContainText('D1-S001D1-E2E-NEW')
  await expect(dialog).toContainText('1 of 96 wells change')
  await dialog.getByRole('checkbox', { name: 'Only wells that change' }).uncheck()
  await expect(rows).toHaveCount(96)
  await dialog.getByRole('checkbox', { name: /Create missing samples/ }).click()
  await expect(preview).toHaveAttribute('data-status', 'ready')
  await expect(dialog.getByTestId('map-assignments').locator('[data-change=create]')).toContainText('D1-E2E-NEW')
  await expect(preview).toContainText('Ready to assign 576 runs in 96 wells, creating 1 sample.')
  // Nothing is applied: cancel.
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
})

test.describe('plate quality', () => {
  function plateRow(page: Page, label: string): Locator {
    return page.getByRole('grid', { name: 'Plates' }).getByRole('row').filter({ has: page.getByText(label, { exact: true }) })
  }

  test('shows each plate’s quality in the list and sorts by it', async ({ page }) => {
    await page.goto('/plates')
    const indicator = (label: string) => plateRow(page, label).getByTestId('quality-indicator')
    await expect(indicator('DEMO-1')).toHaveAttribute('data-worst', 'none')
    await expect(indicator('DEMO-1')).toHaveText('No issues')
    await expect(indicator('DEMO-2')).toHaveAttribute('data-worst', 'problem')
    await expect(indicator('DEMO-2')).toContainText('1 problem, 1 note')
    await expect(indicator('DEMO-3')).toHaveAttribute('data-worst', 'info')
    await expect(indicator('DEMO-3')).toContainText('1 note')
    // Every demo plate is checked: nothing to offer.
    await expect(page.getByTestId('check-quality')).toHaveCount(0)
    // Sorting by quality: clean first, the plate with a problem last; again for worst first.
    const header = page.getByRole('grid', { name: 'Plates' }).getByRole('columnheader', { name: 'Quality' })
    const order = () => page.getByRole('grid', { name: 'Plates' }).getByRole('row').locator('[role=gridcell]:first-child').allInnerTexts()
    await header.click()
    await expect.poll(order).toEqual(['DEMO-1', 'DEMO-3', 'DEMO-2'])
    await header.click()
    await expect.poll(order).toEqual(['DEMO-2', 'DEMO-3', 'DEMO-1'])
    // The text filter finds plates by their quality in words.
    await page.getByPlaceholder('Filter plates…').fill('problem')
    await expect.poll(order).toEqual(['DEMO-2'])
  })

  test('DEMO-2 lists its problem first and outlines the well it names', async ({ page }) => {
    await page.goto('/plates')
    await openPlate(page, 'DEMO-2')
    await expect(page.getByTestId('header-quality')).toContainText('1 problem, 1 note')
    await page.getByTestId('header-quality').click()
    await expect(page).toHaveURL(/tab=quality/)
    const panel = page.getByTestId('quality-panel')
    await expect(panel).toHaveAttribute('data-state', 'issues')
    const issues = panel.getByTestId('quality-issue')
    await expect(issues).toHaveCount(2)
    const first = issues.first()
    await expect(first).toHaveAttribute('data-severity', 'problem')
    await expect(first.getByTestId('issue-title')).toHaveText('Dyes not separated')
    await expect(first).toContainText('Problem')
    await expect(first).toContainText('capillary 38 (well F06)')
    await expect(first).toContainText('Peaks at a spectral breakdown')
    await expect(issues.nth(1)).toHaveAttribute('data-severity', 'info')
    await expect(issues.nth(1).getByTestId('issue-title')).toHaveText('Weak wells')

    // Selecting the issue (mouse, then keyboard) outlines F06, and only F06, on the grid.
    const highlighted = page.locator('[data-testid=plate-grid] [data-highlighted]')
    await expect(highlighted).toHaveCount(0)
    const toggle = first.getByRole('button', { name: /Dyes not separated/ })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(highlighted).toHaveCount(1)
    await expect(well(page, 'F06')).toHaveAttribute('data-highlighted', 'true')
    await expect(well(page, 'F06')).toHaveAttribute('aria-label', /F06.*named by the selected quality issue/)
    await expect(page.getByTestId('highlight-note')).toContainText('F06 (Dyes not separated)')
    await toggle.focus()
    await page.keyboard.press('Space')
    await expect(highlighted).toHaveCount(0)
    await page.keyboard.press('Enter')
    await expect(well(page, 'F06')).toHaveAttribute('data-highlighted', 'true')
    // The other issue's wells replace them.
    await issues.nth(1).getByRole('button', { name: /Weak wells/ }).click()
    await expect(highlighted).toHaveCount(3)
    await first.getByRole('button', { name: /Dyes not separated/ }).click()

    // A well of the issue opens it, with its own measures and the issue naming it.
    await first.getByRole('button', { name: 'F06', exact: true }).click()
    await expect(page.getByTestId('well-label')).toHaveText('F06')
    const wq = page.getByTestId('well-quality')
    await expect(wq).toContainText('capillary38')
    await expect(wq).toContainText('breakdowns6 of')
    await expect(wq.getByTestId('well-issue')).toHaveText(/Dyes not separated/)
    // The well's issue leads back to the report, still outlined.
    await wq.getByTestId('well-issue').click()
    await expect(page.getByTestId('quality-panel')).toBeVisible()
    await expect(well(page, 'F06')).toHaveAttribute('data-highlighted', 'true')
  })

  test('DEMO-1 shows no issues, with its measurements', async ({ page }) => {
    await page.goto('/plates')
    await openPlate(page, 'DEMO-1')
    await page.getByTestId('quality-tab').click()
    const panel = page.getByTestId('quality-panel')
    await expect(panel).toHaveAttribute('data-state', 'clean')
    await expect(panel.getByTestId('quality-clean')).toContainText('No issues found')
    await expect(panel.getByTestId('quality-issue')).toHaveCount(0)
    // Blue into green is about 4%, within the default limits; the matrix has a row and a column per dye.
    const blueGreen = panel.locator('[data-testid=pull-up-matrix] td[data-source=blue][data-target=green]')
    await expect(blueGreen).toHaveAttribute('data-level', 'ok')
    const pct = Number((await blueGreen.innerText()).replace('%', ''))
    expect(pct).toBeGreaterThan(2)
    expect(pct).toBeLessThan(6)
    await expect(blueGreen).toHaveAttribute('title', /from \d+ peaks/)
    await expect(panel.locator('[data-testid=pull-up-matrix] td[data-level=warning], [data-testid=pull-up-matrix] td[data-level=problem]')).toHaveCount(0)
    const next = panel.locator('[data-testid=crosstalk-table] td[data-distance="1"][data-saturated=false]')
    await expect(next).toHaveAttribute('data-level', 'ok')
    await expect(panel.getByTestId('limits-legend')).toContainText('Calling accounts for each plate’s measured pull-up automatically; pull-up above 8% is unusual for a 3730 and above 20% points to a stale spectral calibration. Crosstalk uses the fixed limit up to 3.3%')
    // The negative controls were checked against the plate map: no unexplained peaks.
    const controls = panel.getByTestId('quality-controls')
    await expect(controls).not.toContainText('not checked')
    await expect(controls).not.toContainText('once a plate map')
    await expect(controls).not.toContainText('Not explained')
    // Checking again recomputes the report (an engine task) and it stays clean.
    await panel.getByRole('button', { name: 'Check again' }).click()
    await expect(page.getByText('Quality checked', { exact: true })).toBeVisible()
    await expect(panel).toHaveAttribute('data-state', 'clean')
    await expect(panel.getByTestId('quality-clean')).toContainText('No issues found')
  })

  test('colors the grid by a quality measure with a legend', async ({ page }) => {
    await page.goto('/plates')
    await openPlate(page, 'DEMO-2')
    const grid = page.getByRole('grid', { name: /Plate DEMO-2/ })
    await page.getByRole('radio', { name: 'Quality' }).click()
    await expect(grid).toHaveAttribute('aria-label', /quality view/)
    const legend = page.getByTestId('quality-legend')
    await expect(legend).toHaveAttribute('data-measure', 'ladder_height')
    await expect(legend).toContainText('Ladder height (RFU)')
    await expect(legend).toContainText('Plate median')
    // H01 had a weak injection: flagged.
    await expect(well(page, 'H01')).toContainText('!')
    await page.getByRole('combobox', { name: 'Quality measure' }).click()
    await page.getByRole('option', { name: 'Spectral separation' }).click()
    await expect(legend).toHaveAttribute('data-measure', 'separation')
    await expect(legend).toContainText('not separated')
    await expect(well(page, 'F06')).toContainText('!')
    await expect(well(page, 'A01')).not.toContainText('!')
    await well(page, 'F06').hover()
    await expect(page.getByTestId('plate-grid').getByRole('tooltip')).toContainText('Dyes not separated')
    // The view and measure are kept; L goes back to the sizing colors. (Focus off the
    // measure select first: typing a letter there picks a measure.)
    await grid.focus()
    await page.keyboard.press('l')
    await expect(grid).toHaveAttribute('aria-label', /ladder view/)
    await page.keyboard.press('q')
    await expect(legend).toHaveAttribute('data-measure', 'separation')
    await page.keyboard.press('l')
  })

  test('exports the quality report', async ({ page }) => {
    await page.goto('/plates')
    await openPlate(page, 'DEMO-2')
    await page.getByTestId('quality-tab').click()
    const download = page.waitForEvent('download')
    await page.getByTestId('export-quality').click()
    const d = await download
    expect(d.suggestedFilename()).toBe('DEMO-2_quality.csv')
    const text = await (await import('node:fs/promises')).readFile((await d.path())!, 'utf8')
    expect(text.split('\n').filter(Boolean).length).toBeGreaterThan(96)
    expect(text).toContain('F06')
    await expect(page.getByText('Exported DEMO-2_quality.csv', { exact: true })).toBeVisible()
  })
})

test.describe('import, plate map, delete', () => {
  test.skip(!SYNTH || !existsSync(join(SYNTH ?? '', `${SYNTH_NAME}.zip`)), 'MICROSPAT_E2E_SYNTH_DIR with a synthetic plate is not set')

  test('imports a plate from a zip', async ({ page }) => {
    await page.goto('/plates')
    await page.getByTestId('open-import').click()
    const dialog = page.getByRole('dialog', { name: 'Import plates' })
    const chooser = page.waitForEvent('filechooser')
    await dialog.getByRole('button', { name: /Choose or drop files/ }).click()
    await (await chooser).setFiles(join(SYNTH!, `${SYNTH_NAME}.zip`))
    await expect(dialog.getByRole('list', { name: 'Files to import' })).toContainText(`${SYNTH_NAME}.zip`)
    await dialog.getByRole('combobox', { name: 'Ladder' }).click()
    await page.getByRole('option', { name: /HD ROX 400/ }).click()
    await dialog.getByTestId('start-import').click()
    const outcomes = dialog.getByTestId('import-outcomes')
    await expect(outcomes).toContainText('1 plate imported', { timeout: 20_000 })
    await expect(outcomes).toContainText(SYNTH_NAME)
    // Imported plates are checked on import: the outcome says how it went.
    await expect(outcomes.getByTestId('quality-indicator')).toHaveAttribute('data-worst', /none|info|warning|problem/)
    await outcomes.getByRole('button', { name: 'Open' }).click()
    await expect(page.getByTestId('plate-detail')).toHaveAttribute('data-plate', SYNTH_NAME)
  })

  test('applies a plate map after a dry run', async ({ page }) => {
    await page.goto('/plates')
    await openPlate(page, SYNTH_NAME)
    await expect(page.getByTestId('plate-facts')).toContainText('Plate mapnone')
    await page.getByRole('button', { name: 'Apply plate map' }).click()
    const dialog = page.getByRole('dialog', { name: /Apply plate map/ })
    await expect(dialog).toContainText('One row per well')
    const chooser = page.waitForEvent('filechooser')
    await dialog.getByTestId('choose-map').click()
    await (await chooser).setFiles(join(SYNTH!, `${SYNTH_NAME}_plate_map.csv`))
    const preview = dialog.getByTestId('map-preview')
    await expect(preview).toBeVisible()
    // Every well of a first map is new.
    await expect(dialog.getByTestId('map-assignments').locator('tbody tr')).toHaveCount(96)
    await expect(dialog.getByTestId('map-assignments').locator('tr[data-well=A01] [data-change=unchanged]')).toHaveCount(0)
    if ((await preview.getAttribute('data-status')) === 'samples') {
      await expect(dialog.getByTestId('apply-map')).toBeDisabled()
      await dialog.getByRole('checkbox', { name: /Create missing samples/ }).click()
    }
    await expect(preview).toHaveAttribute('data-status', 'ready')
    await expect(preview).toContainText('Ready to assign 576 runs in 96 wells')
    await dialog.getByTestId('apply-map').click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('plate-facts')).toContainText('576 runs, 6 loci')
    await page.getByRole('radio', { name: 'Signal' }).click()
    await expect(page.getByRole('combobox', { name: 'Locus', exact: true })).toBeVisible()
  })

  test('deletes the imported plate', async ({ page }) => {
    await page.goto('/plates')
    const list = page.getByRole('grid', { name: 'Plates' })
    await list.getByText(SYNTH_NAME, { exact: true }).click()
    await page.getByRole('button', { name: 'Delete selected plate' }).click()
    const confirm = page.getByRole('alertdialog')
    await expect(confirm).toContainText(`Delete plate ${SYNTH_NAME}?`)
    await confirm.getByRole('button', { name: 'Delete' }).click()
    await expect(list.getByText(SYNTH_NAME, { exact: true })).toHaveCount(0)
    await expect(list.getByText('DEMO-1', { exact: true })).toBeVisible()
  })
})
