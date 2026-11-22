#!/usr/bin/env node
// Screenshots for the user guide (docs/user-guide.md), taken from the demo
// study so they never show real data.
//
//   pnpm build:server                                    # from the repository root, once
//   target/release/microspat-server --workspace /tmp/guide.microspat --demo --port 7900
//   pnpm --dir ui shots:guide http://127.0.0.1:7900      # writes docs/images/*.png
//
// Use a server that serves a production build of the UI (the development
// sidebar has an extra section). The last shots need an empty workspace, so
// the script ends by switching the server to a new, untitled one: point it
// at a throwaway server, not at one you are working in.
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const base = (process.argv[2] ?? 'http://127.0.0.1:7878').replace(/\/$/, '')
const out = resolve(process.argv[3] ?? join(REPO, 'docs', 'images'))
mkdirSync(out, { recursive: true })

async function rpc(method, params = null) {
  const res = await fetch(`${base}/api/rpc/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error(`${method}: ${res.status} ${await res.text()}`)
  return res.json()
}

const plates = await rpc('list_plates')
const projects = await rpc('list_projects', {})
const samples = await rpc('list_samples')
const genotyping = projects.find((p) => p.kind === 'genotyping' && p.title === 'Demo genotyping')
const plate = plates.find((p) => p.label.startsWith('DEMO-') && p.sizing.failed > 0) ?? plates.find((p) => p.label.startsWith('DEMO-'))
const showcase = samples.find((s) => s.barcode === 'D1-SHOW-1')
if (!genotyping?.bin_estimator || !genotyping.artifact_estimator || !plate || !showcase) {
  console.error(`${base} does not hold the demo study. Start the server with --demo on a new workspace.`)
  process.exit(2)
}

const browser = await chromium.launch()
const errors = []
// Off once the script switches workspace: the open page's last requests then fail by design.
let watching = true

async function open({ offered }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, colorScheme: 'light' })
  await context.addInitScript((seen) => {
    localStorage.setItem('microspat.theme', 'light')
    if (seen) localStorage.setItem('microspat.tour.offered', '1')
  }, offered)
  const page = await context.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on(
    'response',
    (r) => watching && r.status() >= 400 && errors.push(`${r.status()} ${r.request().method()} ${r.url()} (page at ${page.url()})`),
  )
  return page
}

/** Wait until the page has drawn (plots redraw on the next frame after their data arrives). */
async function settle(page, selector) {
  if (selector) await page.locator(selector).first().waitFor()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(600)
}

async function shot(page, name) {
  await page.screenshot({ path: join(out, `${name}.png`) })
  console.log(`  ${name}.png`)
}

const page = await open({ offered: true })
const go = async (path, selector) => {
  await page.goto(base + path)
  await settle(page, selector)
}

await go(`/plates/${plate.id}`, '[data-testid=well-inspector]')
await shot(page, 'plates')

await page.getByRole('button', { name: 'Edit ladder' }).click()
await settle(page, '[data-testid=ladder-editor]')
await shot(page, 'ladder-edit')
await page.getByRole('button', { name: 'Done', exact: true }).click()

await page.locator('[data-tour="plate-map"]').click()
await settle(page, '[role=dialog]')
await shot(page, 'plate-map')
await page.keyboard.press('Escape')

await go('/loci', 'section[aria-label="Size layout"]')
await shot(page, 'loci')

await go(`/bin-estimators/${genotyping.bin_estimator.id}`, '[data-testid=bin-plot]')
await shot(page, 'bins')

await go(`/artifact-estimators/${genotyping.artifact_estimator.id}`, '[data-testid=artifact-plot]')
await shot(page, 'artifacts')

if (genotyping.quant_bias_estimator) {
  await go(`/quant-bias/${genotyping.quant_bias_estimator.id}`, '[data-testid=locus-bias]')
  await shot(page, 'quant-bias')
}

await go(`/projects/${genotyping.id}?tab=review&sample=${showcase.id}`, '[data-testid=call-panel] [data-testid=trace-viewer]')
await shot(page, 'review')

await go(`/projects/${genotyping.id}?tab=summary`, '[data-testid=summary-tab]')
await shot(page, 'summary')

await go(`/projects/${genotyping.id}?tab=export`, '[data-testid=export-tab]')
await shot(page, 'export')

// The tour, at the stop that shows a minor clone on a stutter position.
await go(`/plates/${plate.id}`, '[data-testid=well-inspector]')
await page.locator('[data-tour="workspace-menu"]').click()
await page.getByRole('menuitem', { name: 'Take the tour' }).click()
await page.getByTestId('tour-start').click()
const tour = page.getByTestId('tour')
await tour.waitFor()
for (let i = 0; i < 40 && (await tour.getAttribute('data-step')) !== 'trace'; i++) await page.keyboard.press('ArrowRight')
await settle(page, '[data-testid=tour-highlight]')
await shot(page, 'tour')
await page.keyboard.press('Escape')

// An empty workspace: what a first launch looks like.
await go(`/plates/${plate.id}`, '[data-testid=well-inspector]')
watching = false
await page.locator('[data-tour="workspace-menu"]').click()
await page.getByRole('menuitem', { name: /New workspace/ }).click()
await page.getByText('No plates yet').waitFor()
await page.getByRole('button', { name: 'Import plates' }).last().click()
await settle(page, '[role=dialog]')
await shot(page, 'import-plates')
await page.keyboard.press('Escape')
await go('/projects', '[data-testid=setup-steps]')
await shot(page, 'setup-steps')

const first = await open({ offered: false })
await first.goto(base + '/plates')
await first.getByRole('dialog', { name: 'Welcome to MicroSPAT' }).waitFor()
await first.waitForTimeout(600)
await shot(first, 'welcome')

await browser.close()
if (errors.length) {
  console.error('Page errors:\n' + errors.join('\n'))
  process.exitCode = 1
} else console.log(`Wrote the guide's screenshots to ${out}`)
