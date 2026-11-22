/**
 * Genotyping review in mock mode (`pnpm e2e`): run and dye overlays on the
 * mock's multi-run samples, review marks, narrow misses, and the leave guard
 * for an unsaved comment. The mock's state lives in the page, so each test
 * starts from the seeded study.
 */
import { expect, test, type Page } from '@playwright/test'

async function openReview(page: Page) {
  await page.goto('/projects')
  await page.getByRole('grid', { name: 'Genotyping projects' }).getByText('Mock genotyping', { exact: true }).dblclick()
  await expect(page.getByTestId('genotyping-workspace')).toBeVisible()
  await expect(page.getByTestId('call-panel')).toBeVisible()
}

const panel = (page: Page) => page.getByTestId('call-panel')

test('overlays a sample’s other runs and the well’s other dyes', async ({ page }) => {
  await openReview(page)
  await page.locator('[data-filter=multi-run]').click()
  const row = page.locator('[data-testid=calls-table] [role=row][data-sample="MX-004"]')
  await row.click()
  await expect(panel(page)).toHaveAttribute('data-sample', 'MX-004')
  const runs = page.getByTestId('runs-list').getByRole('button')
  await expect(runs).toHaveCount(3)
  await expect(page.getByRole('button', { name: /Other runs \(2\)/ })).toBeEnabled()
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('r')
  const legend = page.getByTestId('overlay-legend')
  await expect(legend).toContainText('MOCK-2')
  await expect(legend).toContainText('MOCK-3')
  await page.keyboard.press('d')
  await expect(legend).toContainText(/Dye \d/)
  // Show a re-run instead of the reference run: its own peaks, a note that calls come from the reference.
  await runs.filter({ hasText: 'MOCK-2' }).click()
  await expect(runs.filter({ hasText: 'MOCK-2' })).toHaveClass(/border-accent/)
  await page.getByTestId('peak-table').locator('tbody tr').first().click()
  await expect(page.getByTestId('peak-readout')).toContainText('not the reference run')
})

test('marks a call reviewed, clears it, bulk-marks what the filter shows, and shows narrow misses', async ({ page }) => {
  await openReview(page)
  const state = page.getByTestId('review-state')
  await expect(state).toHaveAttribute('data-reviewed', /true|false/)
  const was = (await state.getAttribute('data-reviewed')) === 'true'
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('m')
  await expect(state).toHaveAttribute('data-reviewed', String(!was))
  await page.keyboard.press('m')
  await expect(state).toHaveAttribute('data-reviewed', String(was))
  // Bulk: every call the "not reviewed" filter shows.
  await page.locator('[data-filter=unreviewed]').click()
  await expect(page.getByTestId('calls-count')).toContainText(/ of /)
  const shown = Number(/^(\d+) of/.exec(await page.getByTestId('calls-count').innerText())![1])
  expect(shown).toBeGreaterThan(0)
  await page.getByTestId('bulk-review').click()
  await page.getByRole('alertdialog').getByRole('button', { name: `Mark ${shown} reviewed` }).click()
  await expect(page.getByTestId('calls-count')).toContainText(/^0 of /)
  await page.locator('[data-filter=unreviewed]').click()
  await expect(page.locator('[data-testid=locus-strip] [aria-selected=true] [data-testid=locus-review-progress]')).toHaveText('✓ all')
  // Narrow misses, if this locus has any, are marked in the table and the trace's peak table.
  const narrowRows = page.locator('[data-testid=calls-table] [role=row][data-narrow]')
  if ((await narrowRows.count()) > 0) {
    await narrowRows.first().click()
    await expect(page.getByTestId('narrow-misses')).toBeVisible()
    await expect(page.locator('[data-testid=peak-table] tbody tr[data-narrow]').first()).toBeVisible()
  }
})

test('a comment typed when leaving is kept: the leave guard holds the navigation until it is saved', async ({ page }) => {
  await openReview(page)
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('c')
  await page.getByTestId('call-comment').fill('half a thought')
  // Back to the project list straight from the text box: the guard blocks, the
  // comment saves as the text box loses focus, and the navigation goes through.
  await page.goBack()
  await expect(page).toHaveURL(/\/projects$/)
  await page.goForward()
  await expect(page.getByTestId('call-comment')).toHaveValue('half a thought')
})
