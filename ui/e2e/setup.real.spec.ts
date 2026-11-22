/**
 * Setup pages (ladders, loci, locus sets, samples) against a real engine.
 * Run with `pnpm e2e:real setup` (a fresh demo workspace of its own; see
 * ui/README.md). Needs the demo data: three plates, six loci PfB1…PfY2 on
 * blue/green/yellow, the "Demo panel" locus set, 288 samples. Skipped unless
 * MICROSPAT_E2E_URL is set.
 *
 * Every test creates its own uniquely named items and deletes them again, and
 * restores what it changes on demo items.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'

const BASE = process.env.MICROSPAT_E2E_URL

test.skip(!BASE, 'Set MICROSPAT_E2E_URL to a UI served against a real engine')
test.use({ baseURL: BASE })

const tag = `${Date.now().toString(36)}`

function grid(page: Page, name: string): Locator {
  return page.getByRole('grid', { name })
}

/** The row of a grid with a cell whose text is exactly `text`. */
function row(page: Page, gridName: string, text: string, column = 1): Locator {
  const exact = new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
  // Match one column only: other columns can mention the same label.
  return grid(page, gridName).getByRole('row').filter({ has: page.locator(`[role=gridcell]:nth-child(${column})`, { hasText: exact }) })
}

async function confirmDelete(page: Page) {
  await page.getByTestId('confirm-delete').click()
}

test('ladder: create, edit, duplicate label error, delete', async ({ page }) => {
  const label = `E2E ladder ${tag}`
  await page.goto('/ladders/new')
  await page.getByLabel('Label', { exact: true }).fill(label)
  // Replace the starting sizes with a pasted list.
  await page.getByRole('button', { name: 'Edit as text' }).click()
  await page.getByLabel('Base sizes as text').fill('50 75 100, 150\n200;250 300')
  await page.getByRole('button', { name: 'Apply list' }).click()
  await expect(page.getByTestId('base-sizes')).toContainText('7 sizes · 50–300 bp')
  // An out-of-order size is flagged and blocks saving until sorted.
  await page.getByLabel('Size 2', { exact: true }).fill('500')
  await expect(page.getByTestId('base-sizes')).toContainText('increasing order')
  await expect(page.getByRole('button', { name: 'Create ladder' })).toBeDisabled()
  await page.getByLabel('Size 2', { exact: true }).fill('75')
  await page.getByRole('button', { name: 'Create ladder' }).click()
  await expect(page).toHaveURL(/\/ladders\/\d+$/)
  await expect(row(page, 'Ladders', label)).toBeVisible()

  // Edit a fitting parameter and save.
  await page.getByLabel('Min peak height').fill('350')
  await expect(page.getByText('1 unsaved change')).toBeVisible()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Default parameters').or(page.getByText('1 parameter changed from default'))).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Min peak height')).toHaveValue('350')
  await expect(page.getByLabel('Min relative height')).toHaveValue('0.25')

  // Renaming to an existing label shows the engine's message at the field.
  await page.getByLabel('Label', { exact: true }).fill('hd rox 400')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'already exists' })).toBeVisible()
  // Esc reverts even with focus outside the form (after the failed save it was on the body).
  await page.getByRole('grid', { name: 'Ladders' }).focus()
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('Label', { exact: true })).toHaveValue(label)

  // Leaving with unsaved edits asks first.
  await page.getByLabel('Min peak height').fill('360')
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Loci' }).click()
  const prompt = page.getByRole('alertdialog')
  await expect(prompt).toContainText(`changes to ladder ${label}`)
  await prompt.getByRole('button', { name: 'Keep editing' }).click()
  await expect(prompt).toHaveCount(0)
  await expect(page.getByLabel('Min peak height')).toHaveValue('360')
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('Min peak height')).toHaveValue('350')

  // Delete.
  await page.getByRole('button', { name: 'Delete' }).click()
  await confirmDelete(page)
  await expect(row(page, 'Ladders', label)).toHaveCount(0)
})

test('ladder used by plates warns about re-sizing and refuses deletion', async ({ page }) => {
  await page.goto('/ladders')
  await row(page, 'Ladders', 'HD ROX 400').click()
  await expect(page.getByText(/Used by 3 plates/)).toBeVisible()
  await expect(page.getByText(/re-sized on the Plates page/)).toBeVisible()
  await page.getByRole('button', { name: 'Delete' }).click()
  await confirmDelete(page)
  await expect(page.getByTestId('delete-failures')).toContainText('is used by 3 plate(s)')
  await page.getByRole('button', { name: 'Close' }).first().click()
})

test('locus: create, edit, duplicate label, in-use refusal, delete', async ({ page }) => {
  const label = `E2E-L-${tag}`
  await page.goto('/loci/new')
  const panel = page.getByRole('form', { name: 'New locus' })
  await panel.getByLabel('Label').fill(label)
  await panel.getByLabel('Min size').fill('480')
  await panel.getByLabel('Max size').fill('520')
  await panel.getByLabel('Repeat length').fill('4')
  await panel.getByRole('button', { name: 'Create locus' }).click()
  await expect(row(page, 'Loci', label)).toBeVisible()

  // Edit in the side panel.
  const edit = page.getByRole('form', { name: `Locus ${label}` })
  await edit.getByLabel('Max size').fill('530')
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(row(page, 'Loci', label)).toContainText('530')

  // Duplicate label (case-insensitive) is reported at the Label field.
  await page.getByRole('button', { name: 'New locus' }).click()
  const fresh = page.getByRole('form', { name: 'New locus' })
  await fresh.getByLabel('Label').fill('pfb1')
  await fresh.getByLabel('Min size').fill('10')
  await fresh.getByLabel('Max size').fill('20')
  await fresh.getByLabel('Repeat length').fill('2')
  await fresh.getByRole('button', { name: 'Create locus' }).click()
  // The engine names the existing locus (PfB1); older engines echoed the typed label.
  await expect(fresh.getByRole('alert')).toContainText(/A locus named "pfb1" already exists\./i)
  await fresh.getByRole('button', { name: 'Cancel' }).click()

  // A locus with runs cannot be deleted; the engine says why.
  await row(page, 'Loci', 'PfB1').click()
  await page.getByRole('form', { name: 'Locus PfB1' }).getByRole('button', { name: 'Delete' }).click()
  await confirmDelete(page)
  await expect(page.getByTestId('delete-failures')).toContainText('has 288 runs on plate(s)')
  await page.getByRole('button', { name: 'Close' }).first().click()

  // Delete ours.
  await row(page, 'Loci', label).click()
  await page.getByRole('form', { name: `Locus ${label}` }).getByRole('button', { name: 'Delete' }).click()
  await confirmDelete(page)
  await expect(row(page, 'Loci', label)).toHaveCount(0)
})

test('loci: CSV import with preview, then a locus set from them', async ({ page }) => {
  const a = `E2E-A-${tag}`
  const b = `E2E-B-${tag}`
  const set = `E2E set ${tag}`
  await page.goto('/loci')
  await page.getByRole('button', { name: 'Import CSV' }).click()
  await expect(page.getByTestId('loci-csv-header')).toHaveText('Label,Min. Base Length,Max. Base Length,Nucleotide Repeat Length,Color')
  await page
    .getByLabel('CSV text')
    .fill(`Label,Min. Base Length,Max. Base Length,Nucleotide Repeat Length,Color\n${a},460,500,3,red\n${b},480,520,3,red\nPfB1,70,135,3,blue\n`)
  const preview = page.getByTestId('loci-import-preview')
  await expect(preview).toContainText('2 to create')
  await expect(preview).toContainText('1 rejected')
  await expect(preview).toContainText('A locus named "PfB1" already exists')
  await page.getByRole('button', { name: 'Import 2 valid loci' }).click()
  await expect(row(page, 'Loci', a)).toBeVisible()
  await expect(row(page, 'Loci', b)).toBeVisible()
  // Same dye, overlapping ranges: flagged.
  await expect(page.getByTestId('overlap-warning')).toContainText('overlapping pair')
  await expect(row(page, 'Loci', a)).toContainText(b)

  // Locus set: pick the two from the table.
  await page.goto('/locus-sets/new')
  const form = page.getByRole('form', { name: 'New locus set' })
  await form.getByLabel('Name of the new locus set').fill(set)
  await form.getByPlaceholder('Search loci…').fill(`E2E-`)
  await row(page, 'Loci to include', a, 2).click()
  await row(page, 'Loci to include', b, 2).click()
  await expect(form.getByTestId('locus-layout')).toContainText(a)
  await form.getByRole('button', { name: 'Create locus set' }).click()
  await expect(page).toHaveURL(/\/locus-sets\/\d+$/)
  await expect(row(page, 'Locus sets', set)).toBeVisible()

  // Duplicate name error, then rename.
  const editor = page.getByRole('form', { name: `Locus set ${set}` })
  await editor.getByLabel('Name').fill('demo PANEL')
  await editor.getByRole('button', { name: 'Save' }).click()
  await expect(editor.getByRole('alert')).toContainText('already exists')
  await editor.getByLabel('Name').fill(`${set} renamed`)
  await editor.getByRole('button', { name: 'Save' }).click()
  await expect(row(page, 'Locus sets', `${set} renamed`)).toBeVisible()

  // Loci in a set cannot be deleted.
  await page.goto('/loci')
  await row(page, 'Loci', a).click()
  await page.getByRole('form', { name: `Locus ${a}` }).getByRole('button', { name: 'Delete' }).click()
  await confirmDelete(page)
  await expect(page.getByTestId('delete-failures')).toContainText('is in locus set(s)')
  await page.getByRole('button', { name: 'Close' }).first().click()

  // Clean up: the set, then both loci at once.
  await page.goto('/locus-sets')
  await row(page, 'Locus sets', `${set} renamed`).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await confirmDelete(page)
  await expect(row(page, 'Locus sets', `${set} renamed`)).toHaveCount(0)
  await page.goto('/loci')
  await page.getByLabel('Filter rows').fill('E2E-')
  await row(page, 'Loci', a).click()
  await row(page, 'Loci', b).click({ modifiers: ['ControlOrMeta'] })
  await page.getByRole('button', { name: 'Delete 2 loci' }).click()
  await confirmDelete(page)
  await expect(row(page, 'Loci', a)).toHaveCount(0)
  await expect(row(page, 'Loci', b)).toHaveCount(0)
})

test('samples: filter, change designation, open a run trace, in-use refusal', async ({ page }) => {
  await page.goto('/samples')
  const table = grid(page, 'Samples')
  // Loci covered and plates.
  await expect(row(page, 'Samples', 'D1-S001')).toContainText('DEMO-1')
  await expect(row(page, 'Samples', 'D1-S001').locator('[role=gridcell]').nth(2)).toHaveText('6')
  // The filter matches plate labels too.
  await page.getByLabel('Filter rows').fill('DEMO-3')
  await expect(table.getByRole('row').filter({ hasText: 'D3-S005' })).toBeVisible()
  await expect(table.getByRole('row').filter({ hasText: 'D1-S001' })).toHaveCount(0)
  await page.getByLabel('Filter rows').fill('NTC')
  await expect(table.getByRole('row').filter({ hasText: 'D1-NTC-H12' })).toBeVisible()
  await expect(table.getByRole('row').filter({ hasText: 'D1-S001' })).toHaveCount(0)
  await page.getByLabel('Filter rows').fill('')

  // Designation filter.
  await page.getByLabel('Designation filter').click()
  await page.getByRole('option', { name: 'Negative controls' }).click()
  await expect(table.getByRole('row').filter({ hasText: 'D2-NTC' })).toBeVisible()
  await expect(table.getByRole('row').filter({ hasText: 'D1-S001' })).toHaveCount(0)
  await page.getByLabel('Designation filter').click()
  await page.getByRole('option', { name: 'All designations' }).click()

  // Change the designation of a selection (one engine call), then back.
  await page.getByLabel('Filter rows').fill('D1-S00')
  await row(page, 'Samples', 'D1-S001').click()
  await row(page, 'Samples', 'D1-S009').click({ modifiers: ['Shift'] })
  await expect(page.getByText('9 selected')).toBeVisible()
  const calls: string[] = []
  page.on('request', (r) => r.url().includes('/api/rpc/') && calls.push(r.url().split('/api/rpc/')[1]!))
  await page.getByRole('button', { name: 'Set designation' }).click()
  await page.getByRole('menuitem', { name: 'Positive control' }).click()
  await expect(page.getByText('9 samples set to positive control')).toBeVisible()
  for (const b of ['D1-S001', 'D1-S005', 'D1-S009']) await expect(row(page, 'Samples', b)).toContainText('Pos. control')
  expect(calls.filter((c) => c === 'set_samples_designation')).toHaveLength(1)
  expect(calls.filter((c) => c === 'update_sample')).toHaveLength(0)
  await page.getByRole('button', { name: 'Set designation' }).click()
  await page.getByRole('menuitem', { name: 'Sample', exact: true }).click()
  await expect(row(page, 'Samples', 'D1-S001')).not.toContainText('Pos. control')
  await expect(row(page, 'Samples', 'D1-S009')).not.toContainText('Pos. control')

  // Open one sample: runs by locus and the trace of a run, zoomed to its locus.
  await row(page, 'Samples', 'D1-S003').click()
  await expect(page.getByTestId('sample-title')).toHaveText('D1-S003')
  const runs = page.getByRole('listbox', { name: 'Runs' })
  await expect(runs.getByRole('group')).toHaveCount(6)
  await runs.getByRole('group', { name: 'PfG2' }).getByRole('option').first().click()
  const trace = page.getByTestId('trace-viewer')
  await expect(trace).toHaveAttribute('data-x-domain', /.+/)
  const [x0, x1] = ((await trace.getAttribute('data-x-domain')) ?? '0,0').split(',').map(Number)
  expect(x0).toBeGreaterThan(280)
  expect(x0).toBeLessThan(300)
  expect(x1).toBeGreaterThan(380)
  expect(x1).toBeLessThan(400)

  // A sample with runs cannot be deleted.
  await page.getByRole('button', { name: 'Delete' }).last().click()
  await confirmDelete(page)
  await expect(page.getByTestId('delete-failures')).toContainText('has 6 runs on plate(s)')
  await page.getByRole('button', { name: 'Close' }).first().click()
})

test('samples: create, duplicate barcode, import, delete', async ({ page }) => {
  const bc = `E2E-S-${tag}`
  await page.goto('/samples')
  await page.getByRole('button', { name: 'New sample' }).click()
  await page.getByLabel('Barcode').fill('d1-s001')
  await page.getByRole('button', { name: 'Create sample' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('already exists')
  await page.getByLabel('Barcode').fill(bc)
  await page.getByRole('button', { name: 'Create sample' }).click()
  await expect(page.getByTestId('sample-title')).toHaveText(bc)

  await page.getByRole('button', { name: 'Import CSV' }).click()
  await page.getByLabel('CSV text').fill(`Barcode,Designation\n${bc}-2,neg\n${bc},\nD1-S001,\n${bc}-3,bogus\n`)
  const preview = page.getByTestId('samples-import-preview')
  await expect(preview).toContainText('1 to create')
  await expect(preview).toContainText('2 already exist')
  await expect(preview).toContainText('1 rejected')
  await page.getByRole('button', { name: 'Import 1 sample' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByLabel('Filter rows').fill(bc)
  await expect(row(page, 'Samples', `${bc}-2`)).toContainText('Neg. control')

  // Bulk delete in one call: the two new samples go, D1-S001 (it has runs) is refused with the reason.
  // "-S" matches every sample; selection only spans the rows the filter shows.
  await page.getByLabel('Filter rows').fill('-S')
  await row(page, 'Samples', 'D1-S001').click()
  await grid(page, 'Samples').evaluate((el) => el.scrollTo(0, el.scrollHeight))
  await row(page, 'Samples', bc).click({ modifiers: ['ControlOrMeta'] })
  await row(page, 'Samples', `${bc}-2`).click({ modifiers: ['ControlOrMeta'] })
  await expect(page.getByText('3 selected')).toBeVisible()
  await page.getByRole('button', { name: 'Delete' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('on a plate map')
  await dialog.getByRole('button', { name: 'Delete 3 samples' }).click()
  await expect(dialog).toContainText('1 sample not deleted')
  await expect(dialog).toContainText('2 samples deleted.')
  await expect(page.getByTestId('delete-failures')).toContainText('D1-S001: Sample D1-S001 has 6 runs on plate(s) DEMO-1')
  await dialog.getByRole('button', { name: 'Close' }).last().click()
  await page.getByLabel('Filter rows').fill(bc)
  await expect(grid(page, 'Samples').getByRole('row').filter({ hasText: bc })).toHaveCount(0)
})

test('samples: a deep link scrolls the table to the sample', async ({ page }) => {
  const samples = await (await page.request.post('/api/rpc/list_samples', { data: null })).json()
  const last = (samples as { id: number; barcode: string }[]).find((s) => s.barcode === 'D3-S090')!
  await page.goto(`/samples/${last.id}`)
  await expect(page.getByTestId('sample-title')).toHaveText('D3-S090')
  await expect(row(page, 'Samples', 'D3-S090')).toBeInViewport()
  await expect(row(page, 'Samples', 'D3-S090')).toHaveAttribute('aria-selected', 'true')
})
