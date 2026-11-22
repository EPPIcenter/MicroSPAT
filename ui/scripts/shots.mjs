// Screenshot the shell and every gallery section in light and dark.
// Usage: node scripts/shots.mjs <outDir> [baseUrl]   (dev server in mock mode must be running)
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const out = process.argv[2] ?? 'shots'
const base = process.argv[3] ?? 'http://localhost:5173'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch()
const errors = []
for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: theme, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${theme}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`${theme} console: ${m.text()}`))
  await page.addInitScript((t) => localStorage.setItem('microspat.theme', t), theme)
  await page.goto(`${base}/plates?mock=1`)
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${out}/shell-plates-${theme}.png` })
  await page.goto(`${base}/projects/12?mock=1`)
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${out}/shell-projects-detail-${theme}.png` })
  await page
    .getByRole('button', { name: /workspace/i })
    .first()
    .click()
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${out}/shell-workspace-menu-${theme}.png` })
  await page.keyboard.press('Escape')
  await page.goto(`${base}/dev/gallery?mock=1`)
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${out}/gallery-top-${theme}.png` })
  await page.getByRole('button', { name: 'Run task' }).click()
  await page.getByRole('button', { name: 'Failing task' }).click()
  await page.getByRole('button', { name: 'RPC error' }).click()
  await page.waitForTimeout(2800)
  await page.screenshot({ path: `${out}/shell-tasks-toasts-${theme}.png` })
  await page.click('[data-testid=task-tray]')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${out}/shell-task-tray-${theme}.png` })
  await page.keyboard.press('Escape')
  await page.evaluate(() => document.getElementById('gallery-scroll').scrollTo(0, 0))
  for (const id of ['colors', 'trace', 'ladder', 'plate', 'bins', 'artifact', 'table', 'forms', 'primitives', 'layouts']) {
    const el = page.locator(`[data-section=${id}]`)
    await el.scrollIntoViewIfNeeded()
    await page.waitForTimeout(250)
    await el.screenshot({ path: `${out}/gallery-${id}-${theme}.png` })
  }
  await ctx.close()
}
await browser.close()
if (errors.length) {
  console.log('ERRORS:\n' + errors.join('\n'))
  process.exitCode = 1
} else console.log('ok')
