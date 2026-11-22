/**
 * Genotyping projects against a real engine. Skipped unless
 * MICROSPAT_E2E_URL points at the UI served with the HTTP server behind it,
 * e.g. the server with `--demo` on :7903 and
 * `MICROSPAT_API=http://127.0.0.1:7903 pnpm dev --port 5183`:
 *
 *   MICROSPAT_E2E_URL=http://localhost:5183 pnpm exec playwright test e2e/genotyping.real.spec.ts
 *
 * Needs the demo workspace ("Demo genotyping", D1-SHOW-1 at PfY1). The spec
 * restores what it changes where later tests depend on it: the toggled allele
 * is toggled back, the filter parameter is reset and the locus re-analyzed,
 * the new project deleted. Review marks it sets are left in place.
 */
import { readFileSync } from 'node:fs'
import { expect, test, type Page, type Response } from '@playwright/test'

const BASE = process.env.MICROSPAT_E2E_URL

test.skip(!BASE, 'MICROSPAT_E2E_URL is not set')
test.describe.configure({ mode: 'serial' })
test.use({ baseURL: BASE, viewport: { width: 1280, height: 800 }, acceptDownloads: true })
test.setTimeout(90_000)

interface Ids {
  project: number
  pfy1: number
  show1: number
}
let ids: Ids

async function rpc<T>(page: Page, method: string, params: unknown): Promise<T> {
  const res = await page.request.post(`/api/rpc/${method}`, { data: params })
  expect(res.ok(), `${method} failed: ${await res.text()}`).toBeTruthy()
  return (await res.json()) as T
}

async function lookup(page: Page): Promise<Ids> {
  const list = await rpc<{ id: number; title: string }[]>(page, 'list_projects', { kind: 'genotyping' })
  const project = list.find((p) => p.title === 'Demo genotyping')!.id
  const detail = await rpc<{ loci: { locus_id: number; label: string }[] }>(page, 'get_project', { id: project })
  const pfy1 = detail.loci.find((l) => l.label === 'PfY1')!.locus_id
  const samples = await rpc<{ sample_id: number; barcode: string }[]>(page, 'list_project_samples', { id: project })
  return { project, pfy1, show1: samples.find((s) => s.barcode === 'D1-SHOW-1')!.sample_id }
}

const callPanel = (page: Page) => page.getByTestId('call-panel')
const tableRow = (page: Page, barcode: string) => page.locator(`[data-testid=calls-table] [role=row][data-sample="${barcode}"]`)

interface NarrowMiss {
  bin_id: number
  label: string
  reason: 'artifact' | 'probability'
  value: number
  limit: number
}
interface CallRow {
  sample_id: number
  barcode: string
  alleles: { label: string }[]
  reviewed?: boolean
  narrow_misses?: NarrowMiss[]
}

async function locusRows(page: Page, locusId: number): Promise<CallRow[]> {
  return (await rpc<{ rows: CallRow[] }>(page, 'get_locus_calls', { project_id: ids.project, locus_id: locusId })).rows
}

async function openShowcase(page: Page) {
  await page.goto(`/projects/${ids.project}?tab=review&locus=${ids.pfy1}&sample=${ids.show1}`)
  await expect(callPanel(page)).toHaveAttribute('data-sample', 'D1-SHOW-1')
  await expect(callPanel(page)).toHaveAttribute('data-locus', 'PfY1')
}

/** Number key of the peak in bin `label` (from the peak table). */
async function peakKey(page: Page, label: string): Promise<string> {
  const row = page
    .getByTestId('peak-table')
    .locator('tbody tr')
    .filter({ has: page.locator('td', { hasText: new RegExp(`^${label}$`) }) })
    .first()
  return (await row.locator('td').first().innerText()).trim()
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ baseURL: BASE })
  ids = await lookup(page)
  await page.close()
})

test('opens the demo genotyping project from the list', async ({ page }) => {
  await page.goto('/projects')
  const list = page.getByRole('grid', { name: 'Genotyping projects' })
  await list.getByText('Demo genotyping', { exact: true }).dblclick()
  await expect(page).toHaveURL(new RegExp(`/projects/${ids.project}`))
  await expect(page.getByTestId('project-title')).toHaveText('Demo genotyping')
  await expect(page.getByTestId('locus-strip').getByRole('tab')).toHaveCount(6)
  await expect(page.getByTestId('calls-table').locator('[role=row]').first()).toBeVisible()
})

test('walks samples and loci by keyboard, keeping the locus zoom', async ({ page }) => {
  await openShowcase(page)
  const plot = callPanel(page).getByTestId('trace-viewer')
  await expect(plot).toHaveAttribute('data-x-domain', /.+/)
  const zoom = await plot.getAttribute('data-x-domain')
  const first = await callPanel(page).getAttribute('data-sample')
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('j')
  await expect(callPanel(page)).not.toHaveAttribute('data-sample', first!)
  const second = await callPanel(page).getAttribute('data-sample')
  await expect(page).toHaveURL(/sample=\d+/)
  // Same zoom (the locus range) for the next sample.
  await expect(plot).toHaveAttribute('data-x-domain', zoom!)
  await page.keyboard.press('k')
  await expect(callPanel(page)).toHaveAttribute('data-sample', first!)
  expect(second).not.toBe(first)
  // Next locus keeps the sample.
  await page.keyboard.press('l')
  await expect(callPanel(page)).toHaveAttribute('data-locus', 'PfY2')
  await expect(callPanel(page)).toHaveAttribute('data-sample', 'D1-SHOW-1')
  await page.keyboard.press('h')
  await expect(callPanel(page)).toHaveAttribute('data-locus', 'PfY1')
  // Next call needing attention.
  await page.keyboard.press('n')
  await expect(page.locator('[data-testid=calls-table] [role=row][aria-selected=true] [aria-label^="Needs attention"]')).toBeVisible()
  // Shortcut sheet.
  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: 'Projects: keyboard shortcuts' })).toBeVisible()
  await page.keyboard.press('Escape')
})

test('shows both alleles of D1-SHOW-1 at PfY1 and the peak evidence', async ({ page }) => {
  await openShowcase(page)
  await expect(page.getByTestId('call-alleles')).toHaveAttribute('data-alleles', '203;206')
  await expect(page.locator('[data-testid=calls-table] [role=row][data-sample="D1-SHOW-1"]')).toHaveAttribute('data-alleles', '203;206')
  // The minor allele sits on the 206 allele's stutter position, with its expected artifact height.
  const row203 = page
    .getByTestId('peak-table')
    .locator('tbody tr')
    .filter({ has: page.locator('td', { hasText: /^203$/ }) })
  await expect(row203).toHaveAttribute('data-state', /called/)
  await row203.click()
  await expect(page.getByTestId('peak-readout')).toContainText('expected artifact')
})

test('toggles an allele off and on, marks the call curated, and persists', async ({ page }) => {
  await openShowcase(page)
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  const key = await peakKey(page, '203')
  await page.keyboard.press(key)
  await expect(page.getByTestId('call-alleles')).toHaveAttribute('data-alleles', '206')
  await expect(page.getByTestId('curated-marker')).toBeVisible()
  await expect(
    page
      .getByTestId('peak-table')
      .locator('tbody tr')
      .filter({ has: page.locator('td', { hasText: /^203$/ }) }),
  ).toHaveAttribute('data-state', 'manual-off')
  await page.reload()
  await expect(page.getByTestId('call-alleles')).toHaveAttribute('data-alleles', '206')
  await expect(page.getByTestId('curated-marker')).toBeVisible()
  // Undo puts it back (a toggle again), still curated.
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press(await peakKey(page, '203'))
  await expect(page.getByTestId('call-alleles')).toHaveAttribute('data-alleles', '203;206')
  await page.reload()
  await expect(page.getByTestId('call-alleles')).toHaveAttribute('data-alleles', '203;206')
  await expect(page.getByTestId('curated-marker')).toBeVisible()
  await expect(page.locator('[data-testid=calls-table] [role=row][data-sample="D1-SHOW-1"]')).toHaveAttribute('data-curated', 'true')
})

test('opening a locus makes one small request and downloads no export', async ({ page }) => {
  await openShowcase(page)
  await expect(page.locator('[data-testid=calls-table] [role=row]').first()).toBeVisible()
  await page.waitForLoadState('networkidle')
  // Recorded as they arrive (synchronously: reading a body is async and could land after the checks).
  const seen: { method: string; response: Response }[] = []
  page.on('response', (r) => {
    const m = /\/api\/rpc\/([a-z_]+)/.exec(r.url())
    if (m) seen.push({ method: m[1]!, response: r })
  })
  const locusCalls = page.waitForResponse((r) => r.url().endsWith('/api/rpc/get_locus_calls'))
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('l')
  await expect(callPanel(page)).toHaveAttribute('data-locus', 'PfY2')
  const body = await (await locusCalls).body()
  await page.waitForLoadState('networkidle')
  expect(seen.filter((x) => x.method === 'get_locus_calls')).toHaveLength(1)
  // 276 rows of about 500 bytes each, not megabytes of exports.
  expect(body.length).toBeLessThan(400_000)
  expect(seen.filter((x) => x.method.startsWith('export_')).map((x) => x.method)).toEqual([])
})

test('review marks persist across reload and a re-analysis that leaves the call unchanged; a toggle drops them', async ({ page }) => {
  // Start from the automatic call (re-analysis discards the hand curation of the test above), not reviewed.
  await rpc(page, 'analyze_project', { id: ids.project, locus_ids: [ids.pfy1] })
  await rpc(page, 'set_call_reviewed', { project_id: ids.project, sample_id: ids.show1, locus_id: ids.pfy1, reviewed: false })
  await openShowcase(page)
  const state = page.getByTestId('review-state')
  await expect(state).toHaveAttribute('data-reviewed', 'false')
  const before = Number(
    await page
      .locator('[data-testid=locus-strip] [data-locus=PfY1] [data-testid=locus-review-progress]')
      .getAttribute('data-reviewed')
      .catch(() => '0'),
  )
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('m')
  await expect(state).toHaveAttribute('data-reviewed', 'true')
  await expect(tableRow(page, 'D1-SHOW-1')).toHaveAttribute('data-reviewed', 'true')
  await expect(page.locator('[data-testid=locus-strip] [data-locus=PfY1] [data-testid=locus-review-progress]')).toHaveAttribute(
    'data-reviewed',
    String(before + 1),
  )
  await page.reload()
  await expect(state).toHaveAttribute('data-reviewed', 'true')
  // Re-analysis with the same inputs gives the same call: the mark stays.
  await rpc(page, 'analyze_project', { id: ids.project, locus_ids: [ids.pfy1] })
  await page.reload()
  await expect(page.getByTestId('call-alleles')).toHaveAttribute('data-alleles', '203;206')
  await expect(state).toHaveAttribute('data-reviewed', 'true')
  // A toggle changes the call: the mark is dropped, and the panel says why.
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  const key = await peakKey(page, '203')
  await page.keyboard.press(key)
  await expect(page.getByTestId('call-alleles')).toHaveAttribute('data-alleles', '206')
  await expect(state).toHaveAttribute('data-reviewed', 'false')
  await expect(page.getByTestId('review-dropped')).toBeVisible()
  await expect(tableRow(page, 'D1-SHOW-1').getByTestId('dropped-mark')).toBeVisible()
  // The engine keeps the dropped mark (`review_dropped`): it is still shown after a reload.
  await page.reload()
  await expect(page.getByTestId('review-dropped')).toBeVisible()
  await expect(tableRow(page, 'D1-SHOW-1').getByTestId('dropped-mark')).toBeVisible()
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  // Toggling back does not restore it (the call is now curated by hand); Enter confirms and moves on.
  await page.keyboard.press(key)
  await expect(page.getByTestId('call-alleles')).toHaveAttribute('data-alleles', '203;206')
  await expect(state).toHaveAttribute('data-reviewed', 'false')
  await page.keyboard.press('Enter')
  await expect(callPanel(page)).not.toHaveAttribute('data-sample', 'D1-SHOW-1')
  await expect(tableRow(page, 'D1-SHOW-1')).toHaveAttribute('data-reviewed', 'true')
  const row = (await locusRows(page, ids.pfy1)).find((r) => r.sample_id === ids.show1)!
  expect(row.reviewed).toBe(true)
  // Restore the automatic call (re-analysis discards hand curation) for the tests below.
  await rpc(page, 'analyze_project', { id: ids.project, locus_ids: [ids.pfy1] })
  await rpc(page, 'calculate_peak_probabilities', { id: ids.project })
})

test('bulk review marks every shown call after a confirmation, and N skips reviewed calls', async ({ page }) => {
  await openShowcase(page)
  await page.locator('[data-filter=narrow]').click()
  const rows = page.locator('[data-testid=calls-table] [role=row][data-sample]')
  await expect(rows.first()).toBeVisible()
  const shown = await rows.count()
  const unreviewed = await page.locator('[data-testid=calls-table] [role=row][data-sample]:not([data-reviewed])').count() // few rows: all rendered
  expect(unreviewed).toBeGreaterThan(0)
  await page.getByTestId('bulk-review').click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText(`Mark ${unreviewed} call`)
  await expect(dialog).toContainText('narrow misses')
  await dialog.getByRole('button', { name: `Mark ${unreviewed} reviewed` }).click()
  await expect(page.locator('[data-testid=calls-table] [role=row][data-sample][data-reviewed=true]')).toHaveCount(shown)
  await expect(page.getByTestId('bulk-review')).toBeDisabled()
  await page.reload()
  await page.locator('[data-filter=narrow]').click()
  await expect(page.locator('[data-testid=calls-table] [role=row][data-sample][data-reviewed=true]')).toHaveCount(shown)
  // Every call with a narrow miss is reviewed now, so none of them needs attention.
  const fromApi = (await locusRows(page, ids.pfy1)).filter((r) => r.narrow_misses?.length)
  expect(fromApi.every((r) => r.reviewed)).toBe(true)
  await page.locator('[data-filter=attention]').click()
  await expect(page.getByTestId('calls-count')).toContainText(/^0 of /)
})

test('marks narrow misses in the trace, the peak table and the call table, with the margin in words', async ({ page }) => {
  const rows = await locusRows(page, ids.pfy1)
  const target = rows.find((r) => r.narrow_misses?.some((m) => m.reason === 'artifact')) ?? rows.find((r) => r.narrow_misses?.length)!
  const miss = target.narrow_misses![0]!
  await page.goto(`/projects/${ids.project}?tab=review&locus=${ids.pfy1}&sample=${target.sample_id}`)
  await expect(callPanel(page)).toHaveAttribute('data-sample', target.barcode)
  await expect(page.getByTestId('narrow-misses')).toHaveAttribute('data-narrow', new RegExp(miss.label))
  await expect(tableRow(page, target.barcode)).toHaveAttribute('data-narrow', new RegExp(miss.label))
  const peakRow = page.locator('[data-testid=peak-table] tbody tr[data-narrow]').first()
  await expect(peakRow).toHaveAttribute('data-narrow', miss.reason)
  await peakRow.click()
  const words =
    miss.reason === 'artifact'
      ? `${Math.round(miss.limit - miss.value)} RFU below the calling limit after expected stutter`
      : `probability ${miss.value.toFixed(2)}, threshold ${miss.limit.toFixed(2)}`
  await expect(page.getByTestId('peak-readout')).toContainText(`Narrow miss: ${words}`)
  // The filter shows the rows that have one.
  await page.locator('[data-filter=narrow]').click()
  const n = rows.filter((r) => r.narrow_misses?.length).length
  await expect(page.getByTestId('calls-count')).toContainText(`${n} of ${rows.length}`)
})

test('shows the model MOI with the most alleles called and where, for a sample where they differ', async ({ page }) => {
  // Any sample that has more alleles called at some locus than its model MOI.
  const samples = await rpc<{ sample_id: number; moi: number | null; max_alleles?: number }[]>(page, 'list_project_samples', {
    id: ids.project,
  })
  const pick = samples.find((r) => r.moi != null && (r.max_alleles ?? 0) > r.moi)
  expect(pick, 'the demo has a sample with more alleles called at a locus than its model MOI').toBeTruthy()
  const sc = await rpc<{ moi: number; max_alleles: number; max_alleles_loci: { locus_id: number; locus_label: string }[] }>(
    page,
    'get_project_sample_calls',
    { project_id: ids.project, sample_id: pick!.sample_id },
  )
  expect(sc.max_alleles).toBeGreaterThan(sc.moi)
  const where = sc.max_alleles_loci.map((l) => l.locus_label)
  const line = `MOI ${sc.moi} (model) · up to ${sc.max_alleles} alleles called at ${where.join(', ')}`
  await page.goto(`/projects/${ids.project}?tab=sample&sample=${pick!.sample_id}`)
  await expect(page.getByTestId('sample-view').getByTestId('moi-line')).toHaveText(line)
  await page.goto(`/projects/${ids.project}?tab=review&locus=${sc.max_alleles_loci[0]!.locus_id}&sample=${pick!.sample_id}`)
  await expect(callPanel(page).getByTestId('moi-line')).toHaveText(line)
  await page.goto(`/projects/${ids.project}?tab=summary`)
  await expect(page.getByTestId('moi-chart')).toBeVisible()
  await expect(page.getByTestId('max-alleles-chart')).toBeVisible()
})

test('asks before dropping unsaved parameter edits', async ({ page }) => {
  await openShowcase(page)
  await page.getByTestId('toggle-params').click()
  const panel = page.getByTestId('params-panel')
  await panel.getByLabel('Min peak height', { exact: true }).fill('77')
  // Closing the panel would lose the edit.
  await page.getByTestId('toggle-params').click()
  const discard = page.getByRole('alertdialog')
  await expect(discard).toContainText('Discard parameter changes for PfY1?')
  await discard.getByRole('button', { name: 'Cancel' }).click()
  await expect(discard).toBeHidden()
  await expect(panel).toBeVisible()
  // Leaving the page asks too, naming the edit.
  await page.getByRole('link', { name: 'Plates' }).click()
  const prompt = page.getByRole('alertdialog')
  await expect(prompt).toContainText('parameter changes for PfY1')
  await prompt.getByRole('button', { name: /Keep editing/ }).click()
  await expect(prompt).toBeHidden()
  await expect(page).toHaveURL(/\/projects\//)
  await panel.getByLabel('Min peak height', { exact: true }).press('Escape')
  await expect(panel).not.toContainText('unsaved change')
  await page.getByRole('link', { name: 'Plates' }).click()
  await expect(page).toHaveURL(/\/plates/)
})

test('writes a comment', async ({ page }) => {
  await openShowcase(page)
  const text = `Minor clone checked ${Date.now()}`
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('c')
  await expect(page.getByTestId('call-comment')).toBeFocused()
  await page.getByTestId('call-comment').fill(text)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('call-comment')).not.toBeFocused()
  await page.reload()
  await expect(page.getByTestId('call-comment')).toHaveValue(text)
  await expect(page.locator('[data-testid=calls-table] [role=row][data-sample="D1-SHOW-1"] [aria-label^="Comment"]')).toBeVisible()
})

test('a filter change makes the locus stale with a reason; re-analysis makes it current', async ({ page }) => {
  await openShowcase(page)
  await page.getByTestId('toggle-params').click()
  const panel = page.getByTestId('params-panel')
  await expect(panel).toHaveAttribute('data-locus', 'PfY1')
  const field = panel.getByLabel('Min peak height', { exact: true })
  await field.fill('60')
  await panel.getByRole('button', { name: 'Save', exact: true }).click()
  const notice = page.getByTestId('stale-notice')
  await expect(notice).toBeVisible()
  await expect(notice).toContainText('Parameters changed')
  await expect(page.locator('[data-testid=locus-strip] [data-locus=PfY1]')).toHaveAttribute('data-state', 'stale')
  await expect(page.getByTestId('project-status')).toContainText('need analysis')
  await page.getByTestId('reanalyze-locus').click()
  await expect(notice).toHaveCount(0, { timeout: 30_000 })
  await expect(page.locator('[data-testid=locus-strip] [data-locus=PfY1]')).toHaveAttribute('data-state', 'current')
  // Restore the defaults (and re-analyze) so the demo stays as it was.
  await rpc(page, 'reset_project_locus_params', { project_id: ids.project, locus_ids: [ids.pfy1] })
  await rpc(page, 'analyze_project', { id: ids.project, locus_ids: [ids.pfy1] })
  await expect(page.locator('[data-testid=locus-strip] [data-locus=PfY1]')).toHaveAttribute('data-state', 'current')
})

test('runs the probabilistic annotation', async ({ page }) => {
  await page.goto(`/projects/${ids.project}?tab=probabilities`)
  const tab = page.getByTestId('probabilities-tab')
  await expect(tab.locator('[data-state]').first()).toHaveAttribute('data-state', 'stale')
  await page.getByTestId('run-probabilities').click()
  await expect(tab.getByTestId('probability-result')).toBeVisible({ timeout: 30_000 })
  await expect(tab.locator('[data-state]').first()).toHaveAttribute('data-state', 'current')
  await expect(page.getByTestId('moi-chart')).toBeVisible()
})

test('opens the sample view and the summary', async ({ page }) => {
  await page.goto(`/projects/${ids.project}?tab=sample&sample=${ids.show1}`)
  await expect(page.getByTestId('sample-view-barcode')).toHaveText('D1-SHOW-1')
  await expect(page.getByTestId('sample-view').locator('[data-locus]')).toHaveCount(6)
  const pfy1 = page.getByTestId('sample-view').locator('[data-locus=PfY1]').locator('xpath=..')
  await expect(pfy1.getByTestId('sample-locus-alleles')).toHaveAttribute('data-alleles', '203;206')
  await pfy1.getByRole('button', { name: /Review/ }).click()
  await expect(callPanel(page)).toHaveAttribute('data-locus', 'PfY1')
  await expect(callPanel(page)).toHaveAttribute('data-sample', 'D1-SHOW-1')
  await page.goto(`/projects/${ids.project}?tab=summary`)
  await expect(page.getByTestId('locus-prevalence')).toHaveCount(6)
  await expect(page.getByTestId('summary-tab')).toContainText('more than 100%')
  await expect(page.getByTestId('moi-chart')).toBeVisible()
})

test('downloads each export with the right header; D1-SHOW-1 has two alleles at PfY1', async ({ page }) => {
  await page.goto(`/projects/${ids.project}?tab=export`)
  const get = async (kind: string) => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId(`export-${kind}`).click()])
    return readFileSync((await dl.path())!, 'utf8')
  }
  const wide = await get('wide')
  const wl = wide.split('\n')
  expect(wl[0]).toBe('Sample,PfB1,PfB2,PfG1,PfG2,PfY1,PfY2')
  const col = wl[0]!.split(',').indexOf('PfY1')
  expect(
    wl
      .find((l) => l.startsWith('D1-SHOW-1,'))!
      .split(',')
      [col]!.split(';'),
  ).toEqual(['203', '206'])
  const long = await get('long')
  expect(long.split('\n')[0]).toBe('Sample,Locus,Allele,Size,Height,Proportion,Corrected Proportion,Probability,MOI,Reviewed')
  const show = long
    .split('\n')
    .filter((l) => l.startsWith('D1-SHOW-1,PfY1,'))
    .map((l) => l.split(','))
  expect(show.map((c) => c[2])).toEqual(['203', '206'])
  const reviewed = (await locusRows(page, ids.pfy1)).find((r) => r.sample_id === ids.show1)!.reviewed ? 'True' : 'False'
  expect(show.map((c) => c[9])).toEqual([reviewed, reviewed])
  const peaks = await get('peaks')
  expect(peaks.split('\n')[0]).toMatch(
    /^Sample,Locus,Peak Height,Relative Peak Height,Proportion,Corrected Proportion,.*,Crosstalk Flag,Height Share of All Peaks,Spectral Dip Ratio,Spectral Flag,Expected Pull-Up,Pull-Up Error$/,
  )
  // Proportion: share of the called signal, NA for peaks not called.
  const head = peaks.split('\n')[0]!.split(',')
  const [pi, ci] = [head.indexOf('Proportion'), head.indexOf('Called Allele')]
  const uncalled = peaks
    .split('\n')
    .filter((l) => l.startsWith('D1-SHOW-1,PfY1,'))
    .map((l) => l.split(','))
    .filter((c) => c[ci] !== 'True')
  expect(uncalled.length).toBeGreaterThan(0)
  expect(uncalled.every((c) => c[pi] === 'NA')).toBe(true)
  const showcase = peaks.split('\n').filter((l) => l.startsWith('D1-SHOW-1,PfY1,'))
  const called = showcase
    .map((l) => l.split(','))
    .filter((c) => c[13] === 'True')
    .map((c) => c[14])
  expect(called).toEqual(['203', '206'])
})

test('creates a project, adds samples by CSV, analyzes it, and deletes it', async ({ page }) => {
  const title = `E2E project ${Date.now()}`
  await page.goto('/projects')
  await page.getByTestId('new-project').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Title').fill(title)
  await dialog.getByRole('combobox', { name: 'Bin estimator' }).click()
  await page.getByRole('option', { name: /Demo bins/ }).click()
  await dialog.getByRole('combobox', { name: 'Artifact estimator' }).click()
  await page.getByRole('option', { name: /Demo artifacts/ }).click()
  await dialog.getByTestId('project-form-save').click()
  await expect(page.getByTestId('project-title')).toHaveText(title)
  await expect(page).toHaveURL(/tab=samples/)
  // Add samples from a CSV, with an unknown barcode in it.
  await page
    .getByTestId('samples-tab')
    .getByRole('button', { name: /Add samples/ })
    .first()
    .click()
  const add = page.getByRole('dialog', { name: /Add samples/ })
  await add.getByRole('tab', { name: 'From CSV' }).click()
  await add.getByLabel('Sample CSV').fill('Barcode\nD1-SHOW-1\nD1-SHOW-2\nNOT-A-SAMPLE\n')
  await expect(add.getByTestId('csv-preview')).toContainText('2 samples to add')
  await expect(add.getByTestId('csv-preview')).toContainText('NOT-A-SAMPLE')
  await add.getByTestId('add-samples-confirm').click()
  await expect(page.getByRole('grid', { name: 'Project samples' }).locator('[role=row][data-row-id]')).toHaveCount(2)
  // Analyze every locus.
  await page.getByTestId('analyze-main').click()
  await expect(page.getByTestId('project-status')).toContainText('Probabilities not calculated', { timeout: 60_000 })
  await page.getByRole('tab', { name: 'Review' }).click()
  await expect(page.locator('[data-testid=calls-table] [role=row][data-sample]')).toHaveCount(2)
  // Delete it.
  await page.getByRole('button', { name: 'Project actions' }).click()
  await page.getByRole('menuitem', { name: /Delete/ }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page).toHaveURL(/\/projects$/)
  await expect(page.getByRole('grid', { name: 'Genotyping projects' }).getByText(title)).toHaveCount(0)
})

test('runs the probabilistic pass and reports the run', async ({ page }) => {
  await page.goto(`/projects/${ids.project}?tab=probabilities`)
  await expect(page.getByRole('radiogroup', { name: 'Probability model' })).toHaveCount(0)
  await page.getByTestId('run-probabilities').click()
  await expect(page.getByTestId('probability-result')).toContainText('annotated', { timeout: 60_000 })
  await expect(page.getByTestId('project-status')).toContainText(/current/i)
  // The samples tab shows the most alleles called at one locus beside the MOI.
  await page.getByRole('tab', { name: /Samples/ }).click()
  await expect(page.getByTestId('samples-tab').getByText('Max alleles', { exact: true })).toBeVisible()
})
