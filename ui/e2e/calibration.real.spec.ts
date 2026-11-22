/**
 * Bin and artifact estimators against a real engine. Skipped unless
 * MICROSPAT_E2E_URL points at the UI served with the HTTP server behind it,
 * e.g. the server with `--demo` on :7904 and
 * `MICROSPAT_API=http://127.0.0.1:7904 pnpm dev --port 5184`:
 *
 *   MICROSPAT_E2E_URL=http://localhost:5184 pnpm exec playwright test e2e/calibration.real.spec.ts
 *
 * Needs the demo workspace ("Demo bins", "Demo artifacts"). The demo
 * projects are only read: edits happen on duplicates made at the start
 * (with a small genotyping project linked to the duplicated bins, to see it
 * go stale), and every project the spec creates is deleted at the end, so it
 * can run again on the same workspace.
 */
import { readFileSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'

const BASE = process.env.MICROSPAT_E2E_URL

test.skip(!BASE, 'MICROSPAT_E2E_URL is not set')
test.describe.configure({ mode: 'serial' })
test.use({ baseURL: BASE, viewport: { width: 1280, height: 800 }, acceptDownloads: true })
test.setTimeout(120_000)

interface Ids {
  demoBins: number
  demoArtifacts: number
  bins: number
  artifacts: number
  geno: number
  pfb1: number
  locusSet: number
}
let ids: Ids
const stamp = Date.now()
const created: number[] = []

async function rpc<T>(page: Page, method: string, params: unknown): Promise<T> {
  const res = await page.request.post(`/api/rpc/${method}`, { data: params })
  expect(res.ok(), `${method} failed: ${await res.text()}`).toBeTruthy()
  return (await res.json()) as T
}

interface Detail {
  project: { id: number; locus_set_id: number }
  loci: { locus_id: number; label: string; status: { state: string; reasons: string[] } }[]
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ baseURL: BASE })
  const list = await rpc<{ id: number; title: string }[]>(page, 'list_projects', {})
  const demoBins = list.find((p) => p.title === 'Demo bins')!.id
  const demoArtifacts = list.find((p) => p.title === 'Demo artifacts')!.id
  const genoDemo = list.find((p) => p.title === 'Demo genotyping')!.id
  const bins = await rpc<Detail>(page, 'duplicate_project', { id: demoBins, title: `E2E bins ${stamp}` })
  created.push(bins.project.id)
  const artifacts = await rpc<Detail>(page, 'duplicate_project', { id: demoArtifacts, title: `E2E artifacts ${stamp}` })
  created.push(artifacts.project.id)
  const pfb1 = bins.loci.find((l) => l.label === 'PfB1')!.locus_id
  // A small genotyping project on the duplicated bins, analyzed at PfB1.
  const geno = await rpc<Detail>(page, 'create_project', {
    kind: 'genotyping',
    title: `E2E geno ${stamp}`,
    locus_set_id: bins.project.locus_set_id,
    bin_estimator_id: bins.project.id,
  })
  created.push(geno.project.id)
  const samples = await rpc<{ sample_id: number }[]>(page, 'list_project_samples', { id: genoDemo })
  await rpc(page, 'add_project_samples', { id: geno.project.id, sample_ids: samples.slice(0, 3).map((s) => s.sample_id) })
  await rpc(page, 'analyze_project', { id: geno.project.id, locus_ids: [pfb1] })
  ids = {
    demoBins,
    demoArtifacts,
    bins: bins.project.id,
    artifacts: artifacts.project.id,
    geno: geno.project.id,
    pfb1,
    locusSet: bins.project.locus_set_id,
  }
  await page.close()
})

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage({ baseURL: BASE })
  // Dependents first (genotyping, artifact estimators), then bins.
  const all = await rpc<{ id: number; title: string; kind: string }[]>(page, 'list_projects', {})
  const mine = all.filter((p) => created.includes(p.id) || p.title.endsWith(String(stamp)))
  const order = ['genotyping', 'artifact_estimator', 'bin_estimator']
  for (const k of order)
    for (const p of mine.filter((x) => x.kind === k)) await page.request.post('/api/rpc/delete_project', { data: { id: p.id } })
  await page.close()
})

/** Pixel x of a size in a plot that reports its view in data-x-domain. */
async function plotX(plot: Locator, bp: number, margins: { left: number; right: number }): Promise<number> {
  const box = (await plot.boundingBox())!
  const [d0, d1] = (await plot.getAttribute('data-x-domain'))!.split(',').map(Number) as [number, number]
  return box.x + margins.left + ((bp - d0) / (d1 - d0)) * (box.width - margins.left - margins.right)
}

const BIN_MARGINS = { left: 44, right: 12 }
const ART_MARGINS = { left: 48, right: 12 }

async function drag(page: Page, x0: number, y: number, x1: number) {
  await page.mouse.move(x0, y)
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) await page.mouse.move(x0 + ((x1 - x0) * i) / 6, y)
  await page.mouse.up()
}

const row = (page: Page, label: string) => page.getByTestId('bins-table').locator(`tr[data-bin-label="${label}"]`)
const center = async (page: Page, label: string) => Number(await row(page, label).getByLabel(`Center of bin ${label}`).inputValue())
const buffer = async (page: Page, label: string) => Number(await row(page, label).getByLabel(`Buffer of bin ${label}`).inputValue())

test('opens the demo bin estimator from the list', async ({ page }) => {
  await page.goto('/bin-estimators')
  await page.getByRole('grid', { name: 'Bin estimators' }).getByText('Demo bins', { exact: true }).dblclick()
  await expect(page).toHaveURL(new RegExp(`/bin-estimators/${ids.demoBins}`))
  await expect(page.getByTestId('project-title')).toHaveText('Demo bins')
  await expect(page.getByTestId('locus-strip').getByRole('tab')).toHaveCount(6)
  await expect(page.getByTestId('bin-plot')).toHaveAttribute('data-x-domain', /.+/)
  await expect(page.getByTestId('bins-table').locator('tbody tr').first()).toBeVisible()
  await expect(page.getByTestId('bin-edit-status')).toContainText('peaks')
})

test('moves, resizes, adds and deletes bins, undoes, saves; the edits persist and dependents go stale', async ({ page }) => {
  await page.goto(`/bin-estimators/${ids.bins}?tab=bins&locus=${ids.pfb1}`)
  const plot = page.getByTestId('bin-plot')
  await expect(plot).toHaveAttribute('data-x-domain', /.+/)
  await expect(row(page, '84')).toBeVisible()
  const box = (await plot.boundingBox())!
  const y = box.y + box.height * 0.5
  const c84 = await center(page, '84')
  const c90 = await center(page, '90')
  const b90 = await buffer(page, '90')

  // Move bin 84 by +0.6 bp: its automatic label follows the center.
  await drag(page, await plotX(plot, c84, BIN_MARGINS), y, await plotX(plot, c84 + 0.6, BIN_MARGINS))
  await expect(page.getByTestId('bin-edit-status')).toContainText('1 changed')
  await expect(row(page, '85')).toBeVisible()
  const moved = await center(page, '85')
  expect(moved).toBeGreaterThan(c84 + 0.4)
  expect(moved).toBeLessThan(c84 + 0.8)

  // Resize bin 90 by dragging its right edge out by 1 bp (the left edge stays).
  const edge = await plotX(plot, c90 + b90, BIN_MARGINS)
  await drag(page, edge, y, await plotX(plot, c90 + b90 + 1, BIN_MARGINS))
  await expect(page.getByTestId('bin-edit-status')).toContainText('2 changed')
  const resizedLabel = String(Math.round(c90 + 0.5))
  expect(await buffer(page, resizedLabel)).toBeGreaterThan(b90 + 0.3)

  // Add a bin by double-clicking empty space at 133 bp.
  await page.mouse.dblclick(await plotX(plot, 133, BIN_MARGINS), y)
  await expect(page.getByTestId('bin-edit-status')).toContainText('1 new')
  await expect(row(page, '133')).toBeVisible()

  // Delete bin 72 from the table, then undo that.
  await row(page, '72').click()
  await row(page, '72').getByRole('button', { name: 'Delete bin 72' }).click()
  await expect(row(page, '72')).toHaveCount(0)
  await expect(page.getByTestId('bin-edit-status')).toContainText('1 deleted')
  await page.getByTestId('bins-undo').click()
  await expect(row(page, '72')).toBeVisible()
  await expect(page.getByTestId('bin-edit-status')).toHaveText(/1 new, 2 changed$/)
  await expect(page.getByTestId('locus-strip').locator('[data-locus=PfB1] [data-testid=locus-unsaved]')).toBeVisible()

  // Save: the dialog names the genotyping project that becomes stale.
  await page.getByTestId('bins-save').click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm.getByTestId('save-dependents')).toContainText(`E2E geno ${stamp}`)
  await confirm.getByRole('button', { name: 'Save bins' }).click()
  await expect(page.getByTestId('bin-workspace')).not.toHaveAttribute('data-dirty', 'true')
  await expect(page.getByTestId('bins-save')).toHaveCount(0)

  // After a reload the saved bins are there.
  await page.reload()
  await expect(row(page, '133')).toBeVisible()
  await expect(row(page, '72')).toBeVisible()
  expect(Math.abs((await center(page, '85')) - moved)).toBeLessThan(0.002)
  expect(await buffer(page, resizedLabel)).toBeGreaterThan(b90 + 0.3)

  // The genotyping project on these bins is stale at PfB1, because of the bins.
  await page.goto(`/projects/${ids.geno}?tab=review&locus=${ids.pfb1}`)
  await expect(page.getByTestId('locus-strip').locator('[data-locus=PfB1]')).toHaveAttribute('data-state', 'stale')
  await expect(page.getByTestId('stale-notice')).toContainText(/bins/i)
})

test('flags overlapping bins, and discards edits', async ({ page }) => {
  await page.goto(`/bin-estimators/${ids.bins}?tab=bins&locus=${ids.pfb1}`)
  await expect(row(page, '75')).toBeVisible()
  // Widen bin 75 until it overlaps 72 and 78.
  await row(page, '75').getByLabel('Buffer of bin 75').fill('2.5')
  await row(page, '75').getByLabel('Buffer of bin 75').press('Enter')
  await expect(page.getByTestId('overlap-count')).toContainText('3 overlapping')
  await expect(row(page, '75').locator('[data-flags]')).toHaveAttribute('data-flags', /overlap/)
  await page.getByTestId('bins-discard').click()
  await expect(page.getByTestId('overlap-count')).toHaveCount(0)
})

test('creates a bin estimator, analyzes it and exports its bins', async ({ page }) => {
  const title = `E2E new bins ${stamp}`
  await page.goto('/bin-estimators')
  await page.getByTestId('new-project').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Title').fill(title)
  await dialog.getByTestId('project-form-save').click()
  await expect(page.getByTestId('project-title')).toHaveText(title)
  await expect(page.getByTestId('analyze-locus')).toBeVisible()
  await page.getByTestId('analyze-main').click()
  await expect(page.getByTestId('project-status')).toContainText(/current/i, { timeout: 60_000 })
  await expect(page.getByTestId('bins-table').locator('tbody tr').first()).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByTestId('export-bins').click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/_bins\.csv$/)
  const text = readFileSync((await file.path())!, 'utf8')
  expect(text.split('\n')[0]).toBe('Locus,Label,Base Size,Bin Buffer,Peak Count')
  expect(text.split('\n').length).toBeGreaterThan(20)
})

test('opens the demo artifact estimator with every class of the locus', async ({ page }) => {
  await page.goto('/artifact-estimators')
  await page.getByRole('grid', { name: 'Artifact estimators' }).getByText('Demo artifacts', { exact: true }).dblclick()
  await expect(page.getByTestId('project-title')).toHaveText('Demo artifacts')
  await expect(page.getByTestId('class-list').getByRole('option').first()).toBeVisible()
  await expect(page.getByTestId('class-title')).toHaveText(/repeat/)
  await expect(page.getByTestId('segment-sentence').first()).toContainText(/RFU parent is expected to produce/)
  await page.getByRole('tab', { name: 'Overview' }).click()
  await expect(page.getByTestId('overview-tile').first()).toBeVisible()
})

test('adds and removes a breakpoint, changes a method and the error estimate, re-fits', async ({ page }) => {
  await page.goto(`/artifact-estimators/${ids.artifacts}?tab=classes&locus=${ids.pfb1}`)
  const panel = page.getByTestId('estimator-panel')
  await expect(panel).toHaveAttribute('data-class', /−1 repeat/)
  const plot = panel.getByTestId('artifact-plot')
  await expect(plot).toHaveAttribute('data-x-domain', /.+/)
  const box = (await plot.boundingBox())!

  // Add a breakpoint at 100 bp by double-click.
  await page.mouse.dblclick(await plotX(plot, 100, ART_MARGINS), box.y + box.height * 0.4)
  await expect(panel.getByTestId('breakpoint-chip')).toHaveCount(1)
  await expect(panel.getByTestId('segment-row')).toHaveCount(2)
  // Remove it.
  await panel.getByTestId('breakpoint-chip').getByRole('button').click()
  await expect(panel.getByTestId('breakpoint-chip')).toHaveCount(0)
  await expect(panel.getByTestId('segment-row')).toHaveCount(1)

  // Least squares for the segment.
  await panel.getByRole('combobox', { name: 'Method of segment 1' }).click()
  await page.getByRole('option', { name: 'Least squares' }).click()
  await expect(panel.getByRole('combobox', { name: 'Method of segment 1' })).toHaveText(/Least squares/)

  // Re-fit keeps the method.
  await panel.getByTestId('refit').click()
  await expect(panel.getByRole('combobox', { name: 'Method of segment 1' })).toHaveText(/Least squares/)

  // RMS errors instead of the default densest half (they apply to
  // Theil–Sen, RANSAC and no-slope fits): every distance class is re-fitted
  // in place, so a breakpoint and the method chosen here survive.
  await panel.getByRole('combobox', { name: 'Method of segment 1' }).click()
  await page.getByRole('option', { name: 'Theil–Sen' }).click()
  await page.mouse.dblclick(await plotX(plot, 100, ART_MARGINS), box.y + box.height * 0.4)
  await expect(panel.getByTestId('breakpoint-chip')).toHaveCount(1)
  await expect(page.getByTestId('error-toggle')).toHaveAttribute('data-value', 'densest_half')
  await panel.getByTestId('error-rms').click()
  await expect(page.getByTestId('error-toggle')).toHaveAttribute('data-value', 'rms', { timeout: 60_000 })
  await expect(page.getByTestId('segment-row').first()).toContainText('RMS')
  await expect(panel.getByTestId('breakpoint-chip')).toHaveCount(1)
  await expect(panel.getByRole('combobox', { name: 'Method of segment 1' })).toHaveText(/Theil–Sen/)
})

test('creates an artifact estimator on the demo bins, analyzes it, deletes a class, exports', async ({ page }) => {
  const title = `E2E new artifacts ${stamp}`
  await page.goto('/artifact-estimators')
  await page.getByTestId('new-project').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Title').fill(title)
  await dialog.getByRole('combobox', { name: 'Bin estimator' }).click()
  await page.getByRole('option', { name: /^Demo bins/ }).click()
  await dialog.getByTestId('project-form-save').click()
  await expect(page.getByTestId('project-title')).toHaveText(title)
  await page.getByTestId('analyze-main').click()
  await expect(page.getByTestId('project-status')).toContainText(/current/i, { timeout: 60_000 })
  const options = page.getByTestId('class-list').getByRole('option')
  await expect(options.first()).toBeVisible()
  const before = await options.count()
  const name = await page.getByTestId('class-title').innerText()
  await page.getByTestId('delete-class').click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm.getByTestId('delete-class-text')).toContainText('Genotyping will no longer expect')
  await confirm.getByRole('button', { name: 'Delete class' }).click()
  await expect(options).toHaveCount(before - 1)
  await expect(page.getByTestId('class-list').locator(`[data-class="${name}"]`)).toHaveCount(0)
  // With every class at a locus deleted there is no artifact model there: the
  // locus says so, and so does a genotyping project that links the estimator.
  await expect(page).toHaveURL(/locus=\d+/)
  const url = new URL(page.url())
  const pid = Number(url.pathname.split('/').pop())
  const lid = Number(url.searchParams.get('locus'))
  const left = await rpc<{ estimators: { id: number }[] }>(page, 'get_locus_artifact_estimators', { project_id: pid, locus_id: lid })
  for (const e of left.estimators) await rpc(page, 'delete_artifact_estimator', { id: e.id })
  await page.reload()
  await expect(page.getByTestId('locus-strip').getByTestId('locus-warning')).toHaveCount(1)
  const geno = await rpc<Detail>(page, 'create_project', {
    kind: 'genotyping',
    title: `E2E no model ${stamp}`,
    locus_set_id: ids.locusSet,
    bin_estimator_id: ids.demoBins,
    artifact_estimator_id: pid,
  })
  created.push(geno.project.id)
  await page.goto(`/projects/${geno.project.id}`)
  await expect(page.getByTestId('upstream-warnings')).toContainText('No artifact model')
  await page.goto(`/artifact-estimators/${pid}`)
  const download = page.waitForEvent('download')
  await page.getByTestId('export-equations').click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/_artifact_equations\.csv$/)
  const text = readFileSync((await file.path())!, 'utf8')
  expect(text.split('\n')[0]).toContain('Locus,Label,Artifact Distance')
})
