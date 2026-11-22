/**
 * Controls and quantification-bias estimators against a real engine. Skipped
 * unless MICROSPAT_E2E_URL points at the UI served with the HTTP server
 * behind it, e.g. the server with `--demo` on :7905 and
 * `MICROSPAT_API=http://127.0.0.1:7905 pnpm dev --port 5185`:
 *
 *   MICROSPAT_E2E_URL=http://localhost:5185 pnpm exec playwright test e2e/quant-bias.real.spec.ts
 *
 * Needs the demo workspace (controls 3D7 / HB3 / DD2 on "Demo bins", "Demo
 * bias" from two-strain mixtures). Re-runnable: leftovers named E2E… are
 * deleted first, edited mixtures and parameters are put back, and every
 * stale locus of "Demo bias" is re-analyzed at the end.
 */
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const BASE = process.env.MICROSPAT_E2E_URL

test.skip(!BASE, 'MICROSPAT_E2E_URL is not set')
test.describe.configure({ mode: 'serial' })
test.use({ baseURL: BASE, viewport: { width: 1280, height: 800 }, actionTimeout: 15_000 })
test.setTimeout(90_000)

interface Control {
  id: number
  label: string
  bin_estimator_title: string
  alleles: { locus_id: number; locus_label: string; bin_id: number | null; bin_label: string | null }[]
}
interface Ids {
  project: number
  loci: { locus_id: number; label: string }[]
  controls: Control[]
}
let ids: Ids

async function rpc<T>(page: Page, method: string, params: unknown): Promise<T> {
  const res = await page.request.post(`/api/rpc/${method}`, { data: params })
  expect(res.ok(), `${method} failed: ${await res.text()}`).toBeTruthy()
  return (await res.json()) as T
}

async function cleanup(page: Page) {
  for (const p of await rpc<{ id: number; title: string }[]>(page, 'list_projects', { kind: 'quant_bias_estimator' }))
    if (p.title.startsWith('E2E')) await rpc(page, 'delete_project', { id: p.id })
  for (const c of await rpc<Control[]>(page, 'list_controls', {})) if (c.label.startsWith('E2E')) await rpc(page, 'delete_control', { id: c.id })
}

/** Put the demo estimator back: default parameters and every locus current. */
async function restoreDemo(page: Page) {
  await rpc(page, 'reset_project_locus_params', { project_id: ids.project })
  await rpc(page, 'analyze_project', { id: ids.project, only_stale: true })
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ baseURL: BASE })
  await cleanup(page)
  const list = await rpc<{ id: number; title: string }[]>(page, 'list_projects', { kind: 'quant_bias_estimator' })
  const project = list.find((p) => p.title === 'Demo bias')!.id
  const detail = await rpc<{ loci: { locus_id: number; label: string }[] }>(page, 'get_project', { id: project })
  ids = { project, loci: detail.loci, controls: await rpc<Control[]>(page, 'list_controls', {}) }
  await page.close()
})

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage({ baseURL: BASE })
  await cleanup(page)
  await restoreDemo(page)
  await page.close()
})

const controlsGrid = (page: Page) => page.getByRole('grid', { name: 'Controls' })

test('lists the demo controls with their bin estimator, alleles and use', async ({ page }) => {
  await page.goto('/controls')
  const listed = await rpc<{ label: string; mixture_count: number }[]>(page, 'list_controls', {})
  for (const label of ['3D7', 'HB3', 'DD2']) {
    const row = controlsGrid(page).getByRole('row').filter({ hasText: label })
    await expect(row).toContainText('Demo bins')
    await expect(row).toContainText('6/6')
    const n = listed.find((c) => c.label === label)!.mixture_count
    expect(n).toBeGreaterThan(0)
    await expect(row.getByRole('gridcell').last()).toHaveText(String(n))
  }
})

test('creates, edits and deletes a control; refuses a duplicate name and a control in use', async ({ page }) => {
  const d3d7 = ids.controls.find((c) => c.label === '3D7')!
  const hb3 = ids.controls.find((c) => c.label === 'HB3')!
  const label = `E2E strain ${Date.now() % 100000}`
  await page.goto('/controls')
  await page.getByTestId('new-control').click()
  const editor = page.getByTestId('control-editor')
  await editor.getByLabel('Name (barcode)').fill(label)
  // One bin estimator in the demo: it is preselected and its loci are listed.
  await expect(editor.getByTestId('allele-grid').locator('[data-locus]')).toHaveCount(6)
  // Fill the panel from the keyboard: type each allele, Enter moves on.
  await editor.getByLabel(`${d3d7.alleles[0]!.locus_label} allele`).click()
  for (const a of d3d7.alleles) {
    await page.keyboard.type(a.bin_label!)
    await page.keyboard.press('Enter')
  }
  await expect(editor.getByTestId('control-save')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/controls\/\d+$/)
  await expect(editor).toHaveAttribute('data-control', label)
  const created = (await rpc<Control[]>(page, 'list_controls', {})).find((c) => c.label === label)!
  expect(created.alleles.map((a) => a.bin_label)).toEqual(d3d7.alleles.map((a) => a.bin_label))

  // Edit one allele: PfY1 becomes HB3's.
  const pfy1 = hb3.alleles.find((a) => a.locus_label === 'PfY1')!
  const picker = editor.getByLabel('PfY1 allele')
  await picker.click()
  await page.keyboard.type(pfy1.bin_label!)
  await expect(page.getByRole('listbox', { name: 'PfY1 allele alleles' }).getByRole('option').first()).toContainText(pfy1.bin_label!)
  await page.keyboard.press('Enter')
  await expect(picker).toHaveAttribute('data-value', String(pfy1.bin_id))
  await page.keyboard.press('ControlOrMeta+s')
  await expect(editor.getByText('unsaved', { exact: true })).toHaveCount(0)
  await expect.poll(async () => (await rpc<Control[]>(page, 'list_controls', {})).find((c) => c.label === label)?.alleles.find((a) => a.locus_label === 'PfY1')?.bin_id).toBe(pfy1.bin_id)

  // A name another control of the bin estimator has is refused.
  await editor.getByLabel('Name (barcode)').fill('3D7')
  await editor.getByTestId('control-save').click()
  await expect(editor.getByRole('alert')).toContainText('already has a control named "3D7"')
  await editor.getByRole('button', { name: 'Revert' }).click()
  await expect(editor.getByLabel('Name (barcode)')).toHaveValue(label)

  // Delete it.
  await editor.getByTestId('control-delete').click()
  await page.getByTestId('confirm-delete-control').click()
  await expect(page).toHaveURL(/\/controls$/)
  await expect(controlsGrid(page).getByText(label)).toHaveCount(0)

  // 3D7 is in Demo bias mixtures: the engine refuses and the dialog says why.
  await controlsGrid(page).getByText('3D7', { exact: true }).click()
  await editor.getByTestId('control-delete').click()
  await page.getByTestId('confirm-delete-control').click()
  await expect(page.getByTestId('delete-control-error')).toContainText('Demo bias')
  await expect(page.getByTestId('delete-control-error')).toContainText('Remove those samples first')
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).first().click()
  await expect(controlsGrid(page).getByText('3D7', { exact: true })).toBeVisible()
})

test('opens Demo bias: β negative and of realistic size at every locus, with the regression drawn', async ({ page }) => {
  await page.goto('/quant-bias')
  await page.getByRole('grid', { name: /Quantification-bias estimators/ }).getByText('Demo bias', { exact: true }).dblclick()
  await expect(page).toHaveURL(new RegExp(`/quant-bias/${ids.project}`))
  await expect(page.getByTestId('project-title')).toHaveText('Demo bias')
  const strip = page.getByTestId('locus-strip')
  await expect(strip.getByRole('tab')).toHaveCount(6)
  for (const l of ids.loci) {
    await strip.locator(`[data-locus="${l.label}"]`).click()
    const panel = page.locator(`[data-testid=locus-bias][data-locus="${l.label}"]`)
    await expect(panel).toBeVisible()
    const beta = Number(await panel.getAttribute('data-beta'))
    // The demo plants a per-locus bias of 0.05 to 0.19 per bp (shorter alleles amplify more).
    expect(beta, `β at ${l.label}`).toBeGreaterThan(-0.25)
    expect(beta, `β at ${l.label}`).toBeLessThan(-0.02)
    await expect(page.getByTestId('beta-sentence')).toContainText('10 bp shorter')
    expect(Number(await page.getByTestId('bias-plot').getAttribute('data-points'))).toBeGreaterThan(10)
  }
  // Excluded peaks say why (the 90/10 mixtures are outside the share range).
  await expect(page.getByTestId('points-table')).toContainText('below range')
  // Hover readout: step onto the first point from the keyboard.
  await page.getByTestId('bias-plot').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('plot-tooltip')).toContainText('D3-MIX')
  await expect(page.getByTestId('plot-tooltip')).toContainText('allele')
  // The overview lists every locus.
  await page.getByRole('tab', { name: 'Overview' }).click()
  await expect(page.getByRole('grid', { name: 'β per locus' }).locator('[role=row][data-row-id]')).toHaveCount(6)
  await expect(page.getByTestId('overview-alert')).toHaveCount(0)
})

test('previews a mixtures CSV through the dry run, reports its errors, then applies a valid one', async ({ page }) => {
  await page.goto(`/quant-bias/${ids.project}?tab=mixtures`)
  await page.getByTestId('import-mixtures').click()
  const dialog = page.getByRole('dialog', { name: /from CSV/ })
  await dialog.getByLabel('Mixtures CSV').fill('Barcode,C1,C2\nD3-MIX-3D7-DD2-50,3D7;0.5,DD2;0.5\nE2E-NO-SUCH-SAMPLE,3D7;0.5,DD2;0.5\nD3-MIX-3D7-DD2-70,3D7;0.7,DD2;0.2\n')
  const preview = dialog.getByTestId('csv-preview')
  await expect(preview).toHaveAttribute('data-bad', '2')
  await expect(preview.locator('tr[data-barcode="E2E-NO-SUCH-SAMPLE"]')).toContainText('unknown barcode')
  await expect(preview.locator('tr[data-barcode="D3-MIX-3D7-DD2-70"]')).toContainText('sum to 0.9')
  await expect(preview.locator('tr[data-barcode="D3-MIX-3D7-DD2-50"]')).toContainText('replaces current')
  await expect(dialog.getByTestId('csv-apply')).toBeDisabled()
  await dialog.getByLabel('Mixtures CSV').fill('Barcode,C1,C2\nD3-MIX-3D7-DD2-50,3D7;0.5,DD2;0.5\nD3-MIX-3D7-DD2-70,3D7;0.7,DD2;0.3\n')
  await expect(preview).toHaveAttribute('data-bad', '0')
  await expect(dialog.getByTestId('csv-apply')).toBeEnabled()
  await dialog.getByTestId('csv-apply').click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('Assigned 2 mixtures', { exact: true })).toBeVisible()
})

test('edits a mixture directly with a running sum; the loci go stale and come back', async ({ page }) => {
  await page.goto(`/quant-bias/${ids.project}?tab=mixtures`)
  const grid = page.getByRole('grid', { name: 'Control mixtures' })
  await grid.getByText('D3-MIX-3D7-DD2-90', { exact: true }).dblclick()
  const editor = page.getByTestId('mixture-editor')
  await expect(editor.getByLabel('Share of control 1')).toHaveValue('90')
  await editor.getByLabel('Share of control 1').fill('80')
  await expect(editor.getByTestId('mixture-sum')).toContainText('90%')
  await expect(editor.getByTestId('mixture-sum')).toContainText('10% left')
  await expect(page.getByTestId('mixture-save')).toBeDisabled()
  await editor.getByLabel('Share of control 2').fill('20')
  await expect(editor.getByTestId('mixture-sum')).toHaveAttribute('data-sum', '100')
  await page.getByTestId('mixture-save').click()
  const row = grid.locator('[role=row]').filter({ hasText: 'D3-MIX-3D7-DD2-90' })
  await expect(row).toContainText('3D7 80%')
  await expect(row).toContainText('DD2 20%')
  // Changing a mixture changes an input of every locus.
  await page.getByRole('tab', { name: 'Per locus' }).click()
  await expect(page.locator('[data-testid=locus-strip] [data-locus=PfY1]')).toHaveAttribute('data-state', 'stale')
  // Put it back.
  await page.getByRole('tab', { name: /Control mixtures/ }).click()
  await grid.getByText('D3-MIX-3D7-DD2-90', { exact: true }).dblclick()
  await editor.getByLabel('Share of control 1').fill('90')
  await editor.getByLabel('Share of control 2').fill('10')
  await page.getByTestId('mixture-save').click()
  await expect(row).toContainText('3D7 90%')
  await rpc(page, 'analyze_project', { id: ids.project, only_stale: true })
})

test('a parameter change makes the locus stale; re-analysis makes it current', async ({ page }) => {
  const pfy1 = ids.loci.find((l) => l.label === 'PfY1')!
  await page.goto(`/quant-bias/${ids.project}?tab=locus&locus=${pfy1.locus_id}`)
  await expect(page.locator('[data-testid=locus-strip] [data-locus=PfY1]')).toHaveAttribute('data-state', 'current')
  await page.getByTestId('toggle-params').click()
  const panel = page.getByTestId('params-panel')
  await expect(panel).toHaveAttribute('data-locus', 'PfY1')
  await panel.getByLabel('Min true proportion', { exact: true }).fill('0.35')
  await panel.getByRole('button', { name: 'Save', exact: true }).click()
  const notice = page.getByTestId('stale-notice')
  await expect(notice).toContainText('Parameters changed')
  await expect(page.locator('[data-testid=locus-strip] [data-locus=PfY1]')).toHaveAttribute('data-state', 'stale')
  await page.getByTestId('reanalyze-locus').click()
  await expect(notice).toHaveCount(0, { timeout: 30_000 })
  await expect(page.locator('[data-testid=locus-strip] [data-locus=PfY1]')).toHaveAttribute('data-state', 'current')
  // With 0.35 the 30/70 mixtures are left out too, so fewer peaks are used.
  await expect(page.getByTestId('points-table')).toContainText('share 30% below range')
  await restoreDemo(page)
  await expect(page.locator('[data-testid=locus-strip] [data-locus=PfY1]')).toHaveAttribute('data-state', 'current')
})

test('creates an estimator, assigns mixtures, analyzes it, and deletes it', async ({ page }) => {
  const title = `E2E bias ${Date.now()}`
  await page.goto('/quant-bias')
  await page.getByTestId('new-project').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Title').fill(title)
  await dialog.getByRole('combobox', { name: 'Bin estimator' }).click()
  await page.getByRole('option', { name: /Demo bins/ }).click()
  await dialog.getByTestId('project-form-save').click()
  await expect(page.getByTestId('project-title')).toHaveText(title)
  await expect(page).toHaveURL(/tab=mixtures/)
  await expect(page.getByTestId('mixtures-tab')).toContainText('No control mixtures yet')
  // Assign four mixtures directly: pick the samples, then the composition.
  await page.getByTestId('mixtures-tab').getByRole('button', { name: /Assign mixtures/ }).first().click()
  const editor = page.getByTestId('mixture-editor')
  await editor.getByPlaceholder('Search barcodes…').fill('D3-MIX-3D7-HB3-50')
  await editor.getByRole('grid').getByText('D3-MIX-3D7-HB3-50', { exact: true }).click()
  await editor.getByLabel('Share of control 1').fill('50')
  await editor.getByLabel('Share of control 2').fill('50')
  // Control 2 defaults to the second control by name (DD2); choose HB3.
  await editor.getByRole('combobox', { name: 'Control 2' }).click()
  await page.getByRole('option', { name: 'HB3', exact: true }).click()
  await page.getByTestId('mixture-save').click()
  await expect(page.getByRole('grid', { name: 'Control mixtures' }).locator('[role=row][data-row-id]')).toHaveCount(1)
  // …and three more from a CSV.
  await page.getByTestId('import-mixtures').click()
  const csv = page.getByRole('dialog', { name: /from CSV/ })
  await csv.getByLabel('Mixtures CSV').fill('Barcode,A,B\nD3-MIX-3D7-HB3-30,3D7;0.3,HB3;0.7\nD3-MIX-3D7-HB3-70,3D7;0.7,HB3;0.3\nD3-MIX-3D7-DD2-50,3D7;0.5,DD2;0.5\n')
  await expect(csv.getByTestId('csv-preview')).toHaveAttribute('data-bad', '0')
  await csv.getByTestId('csv-apply').click()
  await expect(page.getByRole('grid', { name: 'Control mixtures' }).locator('[role=row][data-row-id]')).toHaveCount(4)
  // Analyze every locus.
  await page.getByTestId('analyze-main').click()
  await expect(page.getByTestId('project-status')).toHaveText('Current', { timeout: 60_000 })
  await page.getByRole('tab', { name: 'Per locus' }).click()
  const panel = page.getByTestId('locus-bias')
  await expect(panel).toHaveAttribute('data-beta', /^-0\.[0-2]/)
  // Delete it.
  await page.getByRole('button', { name: 'Project actions' }).click()
  await page.getByRole('menuitem', { name: /Delete/ }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page).toHaveURL(/\/quant-bias$/)
  await expect(page.getByRole('grid', { name: /Quantification-bias estimators/ }).getByText(title)).toHaveCount(0)
})

test('exports the control peak data of an estimator', async ({ page }) => {
  await rpc(page, 'analyze_project', { id: ids.project, only_stale: true })
  await page.goto(`/quant-bias/${ids.project}`)
  const download = page.waitForEvent('download')
  await page.getByTestId('export-peaks').click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/_control_peak_data\.csv$/)
  const lines = readFileSync((await file.path())!, 'utf8').trim().split('\n')
  expect(lines[0]).toMatch(/^Sample,Locus,Plate,Well,Peak Size,Peak Height,/)
  expect(lines[0]).toContain('Used In Fit,Exclusion Reason')
  expect(lines.length).toBeGreaterThan(20)
})

test('a control whose allele bin was deleted says so, apart from alleles never set', async ({ page }) => {
  const all = await rpc<{ id: number; title: string }[]>(page, 'list_projects', { kind: 'bin_estimator' })
  const demoBins = all.find((p) => p.title === 'Demo bins')!.id
  const dup = await rpc<{ project: { id: number }; loci: { locus_id: number; label: string }[] }>(page, 'duplicate_project', { id: demoBins, title: `E2E deleted bin ${Date.now()}` })
  const pfy1 = dup.loci.find((l) => l.label === 'PfY1')!.locus_id
  const bins = await rpc<{ bins: { id: number; label: string }[] }>(page, 'get_locus_bins', { project_id: dup.project.id, locus_id: pfy1 })
  const bin = bins.bins[0]!
  const control = await rpc<{ id: number }>(page, 'create_control', { bin_estimator_id: dup.project.id, label: 'E2E-DEL', alleles: [{ locus_id: pfy1, bin_id: bin.id }] })
  await rpc(page, 'update_locus_bins', { project_id: dup.project.id, locus_id: pfy1, bins: [], delete_ids: [bin.id] })
  await page.goto(`/controls/${control.id}`)
  const notice = page.getByTestId('bins-notice')
  await expect(notice).toContainText("1 allele's bin was deleted from the bin estimator")
  await expect(notice).toContainText('5 loci have no allele set')
  await expect(page.getByTestId('allele-grid').locator('[data-locus=PfY1] [aria-label*="was deleted"]')).toHaveAttribute('aria-label', new RegExp(`bin ${bin.label} \\(`))
  await rpc(page, 'delete_control', { id: control.id })
  await rpc(page, 'delete_project', { id: dup.project.id })
})
