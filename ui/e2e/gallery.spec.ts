/**
 * Drives the gallery in mock mode and checks that the interactive components
 * emit the right callbacks. The gallery logs every callback to
 * window.__galleryEvents.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'

interface Ev {
  name: string
  detail: unknown
}

declare global {
  interface Window {
    __galleryEvents?: Ev[]
  }
}

async function events(page: Page, name: string): Promise<Ev[]> {
  return page.evaluate((n) => (window.__galleryEvents ?? []).filter((e) => e.name === n), name)
}

async function clearEvents(page: Page) {
  await page.evaluate(() => (window.__galleryEvents = []))
}

async function domain(el: Locator): Promise<[number, number]> {
  const v = await el.getAttribute('data-x-domain')
  const [a, b] = (v ?? '0,0').split(',').map(Number)
  return [a!, b!]
}

/** Pixel x (page coords) of data value v, given the plot's left/right margins. */
async function pxOf(el: Locator, v: number, left: number, right: number) {
  const box = (await el.boundingBox())!
  const [d0, d1] = await domain(el)
  return box.x + left + ((v - d0) / (d1 - d0)) * (box.width - left - right)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/gallery?mock=1')
  await page.waitForSelector('[data-section=trace] [data-testid=trace-viewer][data-x-domain]')
})

test('TraceViewer: wheel zoom, drag pan, peak click, reset', async ({ page }) => {
  const tv = page.locator('[data-section=trace] [data-testid=trace-viewer]')
  await tv.scrollIntoViewIfNeeded()
  const box = (await tv.boundingBox())!
  const d0 = await domain(tv)

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -300)
  await page.waitForTimeout(100)
  const d1 = await domain(tv)
  expect(d1[1] - d1[0]).toBeLessThan((d0[1] - d0[0]) * 0.8)
  expect((await events(page, 'trace.xDomain')).length).toBeGreaterThan(0)

  // Drag right pans left (domain decreases).
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 6 })
  await page.mouse.up()
  const d2 = await domain(tv)
  expect(d2[0]).toBeLessThan(d1[0])
  expect(d2[1] - d2[0]).toBeCloseTo(d1[1] - d1[0], 2)

  // Reset with the keyboard.
  await tv.focus()
  await page.keyboard.press('0')
  await page.waitForTimeout(100)
  expect(await domain(tv)).toEqual(d0)

  // Click the 174 allele: find its marker by scanning down until the hover readout names it.
  await clearEvents(page)
  const x = await pxOf(tv, 174.0, 52, 12)
  let clicked = false
  for (let y = box.y + 30; y < box.y + box.height - 40; y += 4) {
    await page.mouse.move(x, y)
    const tip = await tv.locator('div.pointer-events-none').first().innerText().catch(() => '')
    if (tip.includes('Called allele')) {
      await page.mouse.click(x, y)
      clicked = true
      break
    }
  }
  expect(clicked).toBe(true)
  const pc = await events(page, 'trace.peakClick')
  expect(pc).toHaveLength(1)
  expect((pc[0]!.detail as { size: number }).size).toBeCloseTo(174, 0)

  // Empty-space click arrives after the double-click window.
  await page.mouse.click(box.x + box.width * 0.85, box.y + 60)
  await page.waitForTimeout(400)
  expect(await events(page, 'trace.backgroundClick')).toHaveLength(1)
})

test('PlateGrid: click, shift-range, header, keyboard', async ({ page }) => {
  const grid = page.locator('[data-section=plate] [data-testid=plate-grid]').first()
  await grid.scrollIntoViewIfNeeded()
  await clearEvents(page)
  await grid.locator('[data-well=B03]').click()
  await grid.locator('[data-well=D05]').click({ modifiers: ['Shift'] })
  const ev = await events(page, 'plate.select')
  expect(ev[0]!.detail).toEqual(['B03'])
  expect(ev[1]!.detail).toEqual(['B03', 'B04', 'B05', 'C03', 'C04', 'C05', 'D03', 'D04', 'D05'])
  await page.keyboard.press('ArrowRight')
  const last = (await events(page, 'plate.select')).at(-1)!
  expect(last.detail).toEqual(['D06'])
  await grid.getByTitle('Select column 2').click()
  expect((await events(page, 'plate.select')).at(-1)!.detail).toHaveLength(8)
})

test('Plate quality: issues outline their wells, tables mark the limits', async ({ page }) => {
  const sec = page.locator('[data-section=quality]')
  await sec.scrollIntoViewIfNeeded()
  await clearEvents(page)
  const issues = sec.getByTestId('quality-issue')
  // Worst first, severity in words.
  await expect(issues.first()).toHaveAttribute('data-severity', 'problem')
  await expect(issues.first()).toContainText('Problem')
  await expect(issues.last()).toHaveAttribute('data-severity', 'info')
  const toggle = issues.first().getByRole('button', { name: /Dyes not separated/ })
  await toggle.click()
  expect((await events(page, 'quality.issue')).at(-1)!.detail).toBe('unseparated_dyes|Dyes not separated')
  await expect(sec.locator('[data-testid=plate-grid] [data-highlighted]')).toHaveCount(1)
  await expect(sec.locator('[data-well=F06]')).toHaveAttribute('data-highlighted', 'true')
  await expect(sec.locator('[data-well=F06]')).toContainText('!')
  // Keyboard: Space toggles it off.
  await toggle.focus()
  await page.keyboard.press('Space')
  expect((await events(page, 'quality.issue')).at(-1)!.detail).toBeNull()
  await expect(sec.locator('[data-testid=plate-grid] [data-highlighted]')).toHaveCount(0)
  await issues.first().getByRole('button', { name: 'F06', exact: true }).click()
  expect((await events(page, 'quality.well')).at(-1)!.detail).toBe('F06')
  // Blue into green at 14% is above the warning limit, marked by an icon and words, not color alone.
  const cell = sec.locator('[data-testid=pull-up-matrix] td[data-source=blue][data-target=green]')
  await expect(cell).toHaveAttribute('data-level', 'warning')
  await expect(cell).toContainText('14.0%')
  await expect(cell).toContainText('above the warning limit')
  await expect(sec.getByTestId('limits-legend')).toContainText('measured pull-up automatically; pull-up above 8% is unusual for a 3730 and above 20%')
  await expect(sec.getByTestId('controls-table')).toContainText('Not explained')
  await expect(sec.getByTestId('quality-indicator')).toHaveCount(4)
})

test('BinPlot: select, drag move, edge resize, add, delete', async ({ page }) => {
  const bp = page.locator('[data-testid=bin-plot]')
  await bp.scrollIntoViewIfNeeded()
  const box = (await bp.boundingBox())!
  const midY = box.y + box.height / 2
  await clearEvents(page)

  // Bin "162" is centered at 162.35 with buffer 0.75.
  const cx = await pxOf(bp, 162.35, 44, 12)
  await page.mouse.move(cx, midY)
  await page.mouse.down()
  await page.mouse.move(cx + 30, midY, { steps: 5 })
  await page.mouse.up()
  expect((await events(page, 'bins.select')).at(-1)!.detail).toBe(3)
  const mv = (await events(page, 'bins.move')).at(-1)!.detail as { base: number; buffer: number }
  expect(mv.base).toBeGreaterThan(162.6)
  expect(mv.buffer).toBeCloseTo(0.75, 2)

  // Resize the right edge outward.
  const right = await pxOf(bp, mv.base + 0.75, 44, 12)
  await page.mouse.move(right, midY)
  await page.mouse.down()
  await page.mouse.move(right + 15, midY, { steps: 5 })
  await page.mouse.up()
  const rs = (await events(page, 'bins.resize')).at(-1)!.detail as { base: number; buffer: number }
  expect(rs.buffer).toBeGreaterThan(0.8)

  // A drag whose events all arrive before React renders (one task: down,
  // moves, up) still commits where it ended, as a resize. Releasing used to
  // commit the last *rendered* preview: nothing, or an earlier step.
  const edge = await pxOf(bp, rs.base + rs.buffer, 44, 12)
  await clearEvents(page)
  await page.evaluate(
    ({ x0, y }) => {
      const c = document.querySelector('[data-testid=bin-plot] canvas')!
      const ev = (type: string, x: number) => c.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, buttons: 1, pointerId: 1, bubbles: true }))
      ev('pointerdown', x0)
      for (let i = 1; i <= 6; i++) ev('pointermove', x0 + 4 * i)
      ev('pointerup', x0 + 24)
    },
    { x0: edge, y: midY },
  )
  const fast = (await events(page, 'bins.resize')).at(-1)?.detail as { buffer: number } | undefined
  expect(fast?.buffer).toBeGreaterThan(rs.buffer + 0.3)
  expect(await events(page, 'bins.move')).toHaveLength(0)

  // Double-click empty space adds a bin near 198 bp.
  const ax = await pxOf(bp, 198, 44, 12)
  await page.mouse.dblclick(ax, midY)
  const add = (await events(page, 'bins.add')).at(-1)!.detail as { id: number; base: number }
  expect(add.id).toBeLessThan(0)
  expect(add.base).toBeCloseTo(198, 0)

  // Delete it with the keyboard (it is selected after adding).
  await bp.focus()
  await page.keyboard.press('Delete')
  expect((await events(page, 'bins.delete')).at(-1)!.detail).toMatchObject({ id: add.id })
})

test('ArtifactPlot: add and remove breakpoints', async ({ page }) => {
  const ap = page.locator('[data-testid=artifact-plot]')
  await ap.scrollIntoViewIfNeeded()
  const box = (await ap.boundingBox())!
  await clearEvents(page)
  const x = await pxOf(ap, 230, 48, 12)
  await page.mouse.dblclick(x, box.y + box.height / 2)
  const add = (await events(page, 'artifact.add')).at(-1)!
  expect(add.detail as number).toBeCloseTo(230, 0)
  const x2 = await pxOf(ap, add.detail as number, 48, 12)
  await page.mouse.dblclick(x2, box.y + box.height / 2)
  expect((await events(page, 'artifact.remove')).length).toBe(1)
})

test('DataTable: selection ranges and sorting', async ({ page }) => {
  const table = page.locator('[data-section=table] [data-testid=data-table]')
  await table.scrollIntoViewIfNeeded()
  await clearEvents(page)
  await table.locator('[data-row-id="2"]').click()
  await table.locator('[data-row-id="6"]').click({ modifiers: ['Shift'] })
  expect((await events(page, 'table.select')).at(-1)!.detail).toEqual(['2', '3', '4', '5', '6'])
  await table.getByRole('button', { name: 'MOI' }).click()
  await expect(table.getByRole('columnheader', { name: 'MOI' })).toHaveAttribute('aria-sort', 'ascending')
  await table.getByLabel('Filter rows').fill('BDG')
  await expect(table.getByText(/of 2,500 rows/)).toBeVisible()
})

test('TraceViewer: box zoom locks y, keyboard pan, double-click reset', async ({ page }) => {
  const tv = page.locator('[data-section=trace] [data-testid=trace-viewer]')
  await tv.scrollIntoViewIfNeeded()
  const box = (await tv.boundingBox())!
  const d0 = await domain(tv)
  await page.keyboard.down('Shift')
  await page.mouse.move(box.x + 300, box.y + 150)
  await page.mouse.down()
  await page.mouse.move(box.x + 500, box.y + 280, { steps: 5 })
  await page.mouse.up()
  await page.keyboard.up('Shift')
  const d1 = await domain(tv)
  expect(d1[1] - d1[0]).toBeLessThan((d0[1] - d0[0]) * 0.4)
  await expect(tv).not.toHaveAttribute('data-y-lock', 'auto')
  expect((await events(page, 'trace.yMax')).at(-1)!.detail).toBeGreaterThan(0)

  await tv.focus()
  await page.keyboard.press('ArrowRight')
  const d2 = await domain(tv)
  expect(d2[0]).toBeGreaterThan(d1[0])

  await page.mouse.dblclick(box.x + box.width * 0.6, box.y + 60)
  await page.waitForTimeout(100)
  expect(await domain(tv)).toEqual(d0)
  await expect(tv).toHaveAttribute('data-y-lock', 'auto')
  expect(await events(page, 'trace.backgroundClick')).toHaveLength(0)
})
