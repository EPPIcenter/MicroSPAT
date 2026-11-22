/**
 * Settings screen against a real engine. Run with `pnpm e2e:real settings`
 * (a fresh demo workspace of its own; see ui/README.md).
 *
 * The workspace needs the demo plates (DEMO-1..3). The spec restores default
 * workspace settings and browser preferences before finishing, so it can also
 * run against a shared server.
 */
import { expect, test, type Page } from '@playwright/test'

const BASE = process.env.MICROSPAT_E2E_URL
const OPEN_SETTINGS_KEY = process.platform === 'darwin' ? 'Meta+,' : 'Control+,'

test.skip(!BASE, 'MICROSPAT_E2E_URL is not set')
test.describe.configure({ mode: 'serial' })
test.use({ baseURL: BASE, viewport: { width: 1280, height: 800 } })

async function openPlate(page: Page, label: string) {
  await page.getByRole('grid', { name: 'Plates' }).getByText(label, { exact: true }).click()
  await expect(page.getByTestId('plate-detail')).toHaveAttribute('data-plate', label)
}

test('opens Settings from sidebar and keyboard shortcut with default values', async ({ page }) => {
  await page.goto('/plates')
  const nav = page.getByRole('navigation', { name: 'Main' })
  await nav.getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page).toHaveTitle(/^Settings · .+ · MicroSPAT$/)

  const form = page.getByTestId('settings-form')
  await expect(form).toBeVisible()
  await expect(form.getByLabel('Contamination limit')).toHaveValue('500')
  await expect(form.getByLabel('Breakdown peaks')).toHaveValue('2')
  await expect(form.getByLabel('Ladder pull-up deviation')).toHaveValue('3')
  await expect(form.getByLabel('Pull-up warning')).toHaveValue('8')
  await expect(form.getByLabel('Pull-up problem')).toHaveValue('20')

  await nav.getByRole('link', { name: 'Plates' }).click()
  await expect(page).toHaveURL(/\/plates/)
  await expect(page.getByRole('grid', { name: 'Plates' })).toBeVisible()

  await page.keyboard.press(OPEN_SETTINGS_KEY)
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByTestId('settings-form')).toBeVisible()
})

test('guards unsaved edits when leaving and saves updated quality limits', async ({ page }) => {
  await page.goto('/settings')
  const form = page.getByTestId('settings-form')
  await expect(form).toBeVisible()

  await form.getByLabel('Contamination limit').fill('750')
  await form.getByLabel('Breakdown peaks').fill('50')
  await form.getByLabel('Ladder pull-up deviation').fill('50')

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Plates' }).click()
  await expect(page.getByTestId('unsaved-prompt')).toBeVisible()
  await page.getByRole('button', { name: 'Keep editing' }).click()
  await expect(page.getByTestId('unsaved-prompt')).toHaveCount(0)
  await expect(page).toHaveURL(/\/settings$/)

  await form.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Settings saved', { exact: true })).toBeVisible()
})

test('applies saved limits to DEMO-2 quality report and persists across reload', async ({ page }) => {
  await page.goto('/plates')
  await openPlate(page, 'DEMO-2')
  await page.getByTestId('quality-tab').click()
  const panel = page.getByTestId('quality-panel')
  await expect(panel).toBeVisible()
  await expect(panel.getByTestId('quality-issue').filter({ hasText: 'Dyes not separated' })).toHaveCount(0)

  await panel.getByRole('link', { name: 'Limits' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await page.reload()

  const form = page.getByTestId('settings-form')
  await expect(form.getByLabel('Contamination limit')).toHaveValue('750')
  await expect(form.getByLabel('Breakdown peaks')).toHaveValue('50')
  await expect(form.getByLabel('Ladder pull-up deviation')).toHaveValue('50')
})

test('restores defaults and re-enables DEMO-2 spectral issue', async ({ page }) => {
  await page.goto('/settings')
  const form = page.getByTestId('settings-form')
  await expect(form).toBeVisible()

  await form.getByRole('button', { name: 'Defaults', exact: true }).click()
  await form.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Settings saved', { exact: true })).toBeVisible()

  await expect(form.getByLabel('Contamination limit')).toHaveValue('500')
  await expect(form.getByLabel('Breakdown peaks')).toHaveValue('2')
  await expect(form.getByLabel('Ladder pull-up deviation')).toHaveValue('3')

  await page.goto('/plates')
  await openPlate(page, 'DEMO-2')
  await expect(page.getByTestId('header-quality')).toContainText('1 problem, 1 note')
  await page.getByTestId('quality-tab').click()
  const panel = page.getByTestId('quality-panel')
  await expect(panel.getByTestId('quality-issue').filter({ hasText: 'Dyes not separated' })).toHaveCount(1)
})

test('switches application theme, default plate view, and shows workspace info', async ({ page }) => {
  await page.goto('/settings')
  await page.getByRole('tab', { name: 'Application' }).click()
  const appTab = page.getByRole('tabpanel', { name: 'Application' })
  await expect(appTab).toBeVisible()

  await appTab.getByRole('radio', { name: 'Dark' }).click()
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true)

  await appTab.getByRole('radio', { name: 'Light' }).click()
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(false)

  await appTab.getByRole('radio', { name: 'Follow system' }).click()
  await expect(appTab.getByRole('radio', { name: 'Follow system' })).toHaveAttribute('aria-checked', 'true')

  const plateView = appTab.getByRole('combobox', { name: 'Default plate view' })
  await plateView.click()
  await page.getByRole('option', { name: 'Signal', exact: true }).click()
  await expect(plateView).toHaveText('Signal')

  await plateView.click()
  await page.getByRole('option', { name: 'Ladder', exact: true }).click()
  await expect(plateView).toHaveText('Ladder')

  const info = appTab.getByTestId('settings-workspace-info')
  await expect(info).toBeVisible()
  await expect(info).toContainText('Workspace name')
  await expect(info).toContainText('Schema version')
  await expect(info).toContainText('App version')
  await expect(info.locator('dd').first()).not.toBeEmpty()
})
