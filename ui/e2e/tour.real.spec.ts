/**
 * The guided tour, against a real engine with the demo workspace.
 *
 * The first test walks every stop and checks that the tour only shows the
 * workspace: clicks and page shortcuts do not reach the page. The second
 * leaves the demo for an empty workspace (so it runs last) and checks the
 * first-launch offer, which loads the demo study itself.
 */
import { expect, test, type Page } from '@playwright/test'

const BASE = process.env.MICROSPAT_E2E_URL

test.skip(!BASE, 'MICROSPAT_E2E_URL is not set')
test.use({ baseURL: BASE, viewport: { width: 1280, height: 800 }, actionTimeout: 15_000 })
test.describe.configure({ mode: 'serial' })

const STOPS = [
  'sidebar',
  'workspace',
  'plate',
  'well',
  'plate-map',
  'loci',
  'bins',
  'artifacts',
  'quant-bias',
  'project',
  'calls',
  'trace',
  'peaks',
  'probabilities',
  'summary',
  'export',
  'next',
]
/** Stops whose card stands alone, without a highlighted element. */
const NO_TARGET = new Set(['next'])

const workspaceMenu = (page: Page) => page.locator('[data-tour="workspace-menu"]')

async function openTour(page: Page) {
  await workspaceMenu(page).click()
  await page.getByRole('menuitem', { name: 'Take the tour' }).click()
  await expect(page.getByTestId('tour-intro')).toBeVisible()
}

test('walks every stop of the demo study without changing the page', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/plates')
  await expect(page.getByTestId('plate-detail')).toBeVisible()
  // A workspace with plates is not a first launch: no offer.
  await expect(page.getByTestId('tour-intro')).toHaveCount(0)

  await openTour(page)
  await expect(page.getByTestId('tour-intro')).toContainText('uses the demo study in this workspace')
  await page.getByTestId('tour-start').click()

  const tour = page.getByTestId('tour')
  const card = page.getByTestId('tour-card')
  for (const [i, stop] of STOPS.entries()) {
    await expect(tour).toHaveAttribute('data-step', stop)
    await expect(card).toContainText(`${i + 1} of ${STOPS.length}`)
    if (!NO_TARGET.has(stop)) await expect(page.getByTestId('tour-highlight')).toBeVisible()

    if (stop === 'plate') {
      // The page is locked: neither its shortcuts nor a click on a well get through.
      const panel = page.locator('section[aria-label="Plate"]')
      const inspector = page.getByTestId('well-inspector')
      const well = await inspector.getAttribute('data-well')
      await page.keyboard.press('s')
      // The Signal view (S) would show its locus picker.
      await expect(panel.getByLabel('Locus')).toHaveCount(0)
      // Around the middle of the grid, one of these lands on a well and would select it.
      const grid = await panel.getByTestId('plate-grid').boundingBox()
      expect(grid).not.toBeNull()
      for (const d of [0, 9, 18]) await page.mouse.click(grid!.x + grid!.width / 2 + d, grid!.y + grid!.height / 2 + d)
      await expect(inspector).toHaveAttribute('data-well', well ?? '')
      // Back and forward again.
      await page.getByTestId('tour-back').click()
      await expect(tour).toHaveAttribute('data-step', 'workspace')
      await page.keyboard.press('ArrowRight')
      await expect(tour).toHaveAttribute('data-step', 'plate')
    }
    // The stops that name what is on screen show exactly that.
    if (stop === 'well') await expect(page.getByTestId('well-sizing')).toContainText(/failed/i)
    if (stop === 'trace') await expect(page.getByTestId('call-panel')).toHaveAttribute('data-sample', 'D1-SHOW-1')

    if (i < STOPS.length - 1) await page.keyboard.press('ArrowRight')
  }
  await expect(page.getByTestId('tour-next')).toHaveText('Done')
  await page.getByTestId('tour-next').click()
  await expect(tour).toHaveCount(0)
  // The tour ends where the work starts.
  await expect(page).toHaveURL(/\/plates\/\d+/)

  // Esc leaves at any stop, and the page works again.
  await openTour(page)
  await page.getByTestId('tour-start').click()
  await expect(tour).toHaveAttribute('data-step', 'sidebar')
  await page.keyboard.press('Escape')
  await expect(tour).toHaveCount(0)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Loci', exact: true }).click()
  await expect(page).toHaveURL(/\/loci$/)

  expect(errors).toEqual([])
})

test('a first launch with an empty workspace offers the tour and loads the demo study', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('/plates')
  await workspaceMenu(page).click()
  await page.getByRole('menuitem', { name: /New workspace/ }).click()
  await expect(page.getByText('No plates yet')).toBeVisible()
  // The offer belongs to the launch, not to switching workspace.
  await expect(page.getByTestId('tour-intro')).toHaveCount(0)

  await page.reload()
  const intro = page.getByRole('dialog', { name: 'Welcome to MicroSPAT' })
  await expect(intro).toBeVisible()
  await expect(intro).toContainText('first loads the demo study')
  await intro.getByTestId('tour-cancel').click()
  await expect(intro).toHaveCount(0)

  // Offered once: the next launch stays quiet, and the empty page still leads to the tour.
  await page.reload()
  await expect(page.getByText('No plates yet')).toBeVisible()
  await expect(page.getByTestId('tour-intro')).toHaveCount(0)
  await page.getByTestId('empty-take-tour').click()
  await page.getByTestId('tour-start').click()
  const tour = page.getByTestId('tour')
  await expect(tour).toHaveAttribute('data-step', 'sidebar', { timeout: 180_000 })
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(tour).toHaveAttribute('data-step', 'plate')
  await expect(page.getByTestId('plate-detail')).toHaveAttribute('data-plate', /^DEMO-/)
  await expect(page.getByTestId('tour-highlight')).toBeVisible()
})
