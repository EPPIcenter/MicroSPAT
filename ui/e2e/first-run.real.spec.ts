/**
 * First run: a new user, from an empty workspace to exported alleles, by the
 * screens alone. Every step finds its way from what the previous screen
 * offers (empty states, links to the prerequisite), not from URLs.
 *
 * It starts by creating a new workspace from the workspace menu while a page
 * holds an unsaved edit (the switch asks first, then shows nothing of the
 * previous workspace), so under `pnpm e2e:real` it leaves the demo behind.
 * Needs MICROSPAT_E2E_SYNTH_DIR with synthetic plates SYNTH-11…13 (zips,
 * plate maps) and loci.csv from the synth_plate example; skipped without.
 * MICROSPAT_E2E_SHOTS=<dir> also saves a screenshot of each step.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const BASE = process.env.MICROSPAT_E2E_URL
const SYNTH = process.env.MICROSPAT_E2E_SYNTH_DIR
const SHOTS = process.env.MICROSPAT_E2E_SHOTS
const PLATES = ['SYNTH-11', 'SYNTH-12', 'SYNTH-13']

test.skip(!BASE, 'MICROSPAT_E2E_URL is not set')
test.skip(!SYNTH || !PLATES.every((p) => existsSync(join(SYNTH, `${p}.zip`))) || !existsSync(join(SYNTH ?? '', 'loci.csv')), 'MICROSPAT_E2E_SYNTH_DIR with SYNTH-11…13 and loci.csv is not set')
test.use({ baseURL: BASE, viewport: { width: 1280, height: 800 }, acceptDownloads: true, actionTimeout: 15_000 })
test.setTimeout(300_000)

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`) })
}

const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true })

test('from an empty workspace to exported alleles', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))

  await test.step('a new workspace, after keeping and then discarding an unsaved edit', async () => {
    await page.goto('/ladders')
    const minHeight = page.getByLabel('Min peak height')
    await minHeight.fill('345')
    const menu = page.getByRole('navigation', { name: 'Main' }).getByRole('button').first()
    await menu.click()
    await page.getByRole('menuitem', { name: /New workspace/ }).click()
    const prompt = page.getByRole('alertdialog')
    await expect(prompt.getByTestId('workspace-unsaved-prompt')).toContainText('unsaved changes to')
    await prompt.getByRole('button', { name: 'Keep editing' }).click()
    await expect(minHeight).toHaveValue('345')
    await menu.click()
    await page.getByRole('menuitem', { name: /New workspace/ }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Discard and continue' }).click()
    await expect(page).toHaveURL(/\/plates$/)
    await expect(page.getByText('No plates yet')).toBeVisible()
    await menu.click()
    await expect(page.getByRole('menu')).toContainText('0 plates')
    await page.keyboard.press('Escape')
    await shot(page, '01-empty-plates')
  })

  await test.step('import three plates', async () => {
    await page.getByRole('button', { name: 'Import plates' }).last().click()
    const dialog = page.getByRole('dialog', { name: 'Import plates' })
    await shot(page, '02-import-dialog')
    const chooser = page.waitForEvent('filechooser')
    await dialog.getByRole('button', { name: /Choose or drop files/ }).click()
    await (await chooser).setFiles(PLATES.map((p) => join(SYNTH!, `${p}.zip`)))
    await shot(page, '03-import-files')
    await dialog.getByRole('combobox', { name: 'Ladder' }).click()
    await page.getByRole('option', { name: /HD ROX 400/ }).click()
    await dialog.getByTestId('start-import').click()
    await expect(dialog.getByTestId('import-outcomes')).toContainText('3 plates imported', { timeout: 60_000 })
    await shot(page, '04-import-done')
    await dialog.getByTestId('import-outcomes').getByRole('button', { name: 'Open' }).first().click()
    await expect(page.getByTestId('plate-detail')).toBeVisible()
    await shot(page, '05-plate')
  })

  await test.step('the plate map needs loci first: import them from CSV', async () => {
    await page.getByRole('button', { name: 'Apply plate map' }).click()
    const dialog = page.getByRole('dialog', { name: /Apply plate map/ })
    await expect(dialog.getByTestId('map-needs-loci')).toBeVisible()
    await shot(page, '06-map-needs-loci')
    await dialog.getByRole('link', { name: 'Loci page' }).click()
    await expect(page).toHaveURL(/\/loci$/)
    await expect(page.getByText('Next: add loci')).toBeVisible()
    await page.getByRole('button', { name: 'Import CSV' }).first().click()
    const imp = page.getByRole('dialog', { name: 'Import loci from CSV' })
    await imp.getByTestId('csv-file-input').setInputFiles(join(SYNTH!, 'loci.csv'))
    await expect(imp.getByTestId('loci-import-preview')).toContainText('6 to create')
    await imp.getByRole('button', { name: 'Import 6 loci' }).click()
    await expect(page.getByRole('grid', { name: 'Loci' }).getByRole('row')).toHaveCount(7)
    await shot(page, '07-loci')
  })

  await test.step('a locus set of the imported loci (they are selected after the import)', async () => {
    await page.getByTestId('locus-set-from-selection').click()
    const form = page.getByRole('form', { name: 'New locus set' })
    await form.getByLabel('Name of the new locus set').fill('Panel')
    await expect(form.getByTestId('locus-layout')).toContainText('PfY2')
    await shot(page, '08-locus-set-form')
    await form.getByRole('button', { name: 'Create locus set' }).click()
    await expect(page).toHaveURL(/\/locus-sets\/\d+$/)
    await shot(page, '09-locus-set')
  })

  await test.step('a plate map on every plate, creating the samples', async () => {
    await nav(page, 'Plates').click()
    for (const plate of PLATES) {
      await page.getByRole('grid', { name: 'Plates' }).getByText(plate, { exact: true }).click()
      await expect(page.getByTestId('plate-detail')).toHaveAttribute('data-plate', plate)
      await page.getByRole('button', { name: 'Apply plate map' }).click()
      const dialog = page.getByRole('dialog', { name: /Apply plate map/ })
      const chooser = page.waitForEvent('filechooser')
      await dialog.getByTestId('choose-map').click()
      await (await chooser).setFiles(join(SYNTH!, `${plate}_plate_map.csv`))
      const preview = dialog.getByTestId('map-preview')
      await expect(preview).toHaveAttribute('data-status', /samples|ready/)
      if (plate === PLATES[0]) await shot(page, '10-plate-map')
      if ((await preview.getAttribute('data-status')) === 'samples') await dialog.getByRole('checkbox', { name: /Create missing samples/ }).click()
      await expect(preview).toHaveAttribute('data-status', 'ready')
      await dialog.getByTestId('apply-map').click()
      await expect(dialog).toHaveCount(0)
      await expect(page.getByTestId('plate-facts')).toContainText('576 runs')
    }
    await shot(page, '11-plate-mapped')
  })

  await test.step('a bin estimator on every sample with runs', async () => {
    await nav(page, 'Bin estimators').click()
    await expect(page.getByTestId('prerequisite')).toHaveCount(0)
    // Beside the empty list, the way through: four steps done, this one next.
    await expect(page.getByTestId('setup-steps').locator('li[data-done]')).toHaveCount(4)
    await expect(page.getByTestId('setup-steps')).toContainText('Create and analyze a bin estimator · here')
    await shot(page, '12-bins-empty')
    await page.getByTestId('new-project').click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Title').fill('Bins')
    await shot(page, '13-bins-form')
    await dialog.getByTestId('project-form-save').click()
    await expect(page.getByTestId('project-title')).toHaveText('Bins')
    await shot(page, '14-bins-new')
    await page.getByTestId('analyze-main').click()
    await expect(page.getByTestId('project-status')).toContainText(/current/i, { timeout: 120_000 })
    await expect(page.getByTestId('bins-table').locator('tbody tr').first()).toBeVisible()
    await shot(page, '15-bins')
  })

  await test.step('an artifact estimator on those bins', async () => {
    await nav(page, 'Artifact estimators').click()
    await page.getByTestId('new-project').click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Title').fill('Artifacts')
    await expect(dialog.getByRole('combobox', { name: 'Bin estimator' })).toContainText('Bins')
    await dialog.getByTestId('project-form-save').click()
    await expect(page.getByTestId('project-title')).toHaveText('Artifacts')
    await page.getByTestId('analyze-main').click()
    await expect(page.getByTestId('project-status')).toContainText(/current/i, { timeout: 120_000 })
    await shot(page, '16-artifacts')
  })

  await test.step('a genotyping project with every sample, analyzed', async () => {
    await nav(page, 'Projects').click()
    await page.getByTestId('new-project').click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Title').fill('Study')
    await expect(dialog.getByRole('combobox', { name: 'Bin estimator' })).toContainText('Bins')
    await dialog.getByRole('combobox', { name: 'Artifact estimator' }).click()
    await page.getByRole('option', { name: /Artifacts/ }).click()
    await shot(page, '17-project-form')
    await dialog.getByTestId('project-form-save').click()
    await expect(page.getByTestId('project-title')).toHaveText('Study')
    await expect(page).toHaveURL(/tab=samples/)
    await shot(page, '18-project-samples-empty')
    await page.getByTestId('samples-tab').getByRole('button', { name: /Add samples/ }).first().click()
    const add = page.getByRole('dialog', { name: /Add samples/ })
    await add.getByRole('grid', { name: 'Workspace samples' }).locator('[role=row][data-row-id]').first().click()
    await page.keyboard.press('ControlOrMeta+A')
    await expect(add.getByTestId('add-samples-confirm')).toHaveText(/Add 288 samples/)
    await add.getByTestId('add-samples-confirm').click()
    await expect(page.getByRole('grid', { name: 'Project samples' })).toBeVisible()
    await page.getByTestId('analyze-main').click()
    await expect(page.getByTestId('project-status')).toContainText('Probabilities not calculated', { timeout: 120_000 })
    await shot(page, '19-project-analyzed')
  })

  await test.step('peak probabilities', async () => {
    await page.getByRole('tab', { name: 'Probabilities' }).click()
    await shot(page, '20-probabilities')
    await page.getByTestId('run-probabilities').click()
    await expect(page.getByTestId('probability-result')).toContainText('annotated', { timeout: 120_000 })
    await expect(page.getByTestId('project-status')).toContainText(/current/i)
    await shot(page, '21-probabilities-done')
  })

  await test.step('review: mark a call reviewed', async () => {
    await page.getByRole('tab', { name: 'Review' }).click()
    const row = page.locator('[data-testid=calls-table] [role=row][data-sample="D12-S001"]')
    await expect(row).toBeVisible()
    await row.click()
    await expect(row).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('call-panel')).toHaveAttribute('data-sample', 'D12-S001')
    await page.keyboard.press('m')
    await expect(row.getByTestId('reviewed-mark')).toBeVisible()
    await shot(page, '22-review')
  })

  await test.step('export the alleles', async () => {
    await page.getByRole('tab', { name: 'Export' }).click()
    await shot(page, '23-export')
    const download = page.waitForEvent('download')
    await page.getByTestId('export-long').click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/\.csv$/)
    const lines = readFileSync((await file.path())!, 'utf8').trim().split('\n')
    expect(lines[0]).toBe('Sample,Locus,Allele,Size,Height,Proportion,Corrected Proportion,Probability,MOI,Reviewed')
    expect(lines.length).toBeGreaterThan(500)
    expect(lines.filter((l) => l.startsWith('D12-S001,PfB1,') && l.endsWith(',True')).length).toBeGreaterThan(0)
  })

  expect(errors).toEqual([])
})
