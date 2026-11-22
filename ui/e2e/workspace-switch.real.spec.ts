/**
 * Switching workspace from a page that shows one item of the workspace being
 * left (a project of each kind, a plate), against a real engine.
 *
 * The new workspace has none of those items, so any request for one answers
 * 404 and, from most pages, shows a "Could not load data" toast. A switch
 * must send none: the app shows the empty Plates page and nothing else.
 *
 * Every test starts from the demo study and leaves it for an empty workspace;
 * the next test loads the demo again.
 */
import { expect, test, type Page } from '@playwright/test'

const BASE = process.env.MICROSPAT_E2E_URL

test.skip(!BASE, 'MICROSPAT_E2E_URL is not set')
test.describe.configure({ mode: 'serial' })
test.use({ baseURL: BASE, viewport: { width: 1280, height: 800 }, actionTimeout: 15_000 })
test.setTimeout(90_000)

/** Pages that show one project, by section. */
const PROJECT_PAGES = [
  { section: 'projects', kind: 'genotyping', query: '?tab=review' },
  { section: 'bin-estimators', kind: 'bin_estimator', query: '' },
  { section: 'artifact-estimators', kind: 'artifact_estimator', query: '' },
  { section: 'quant-bias', kind: 'quant_bias_estimator', query: '' },
]

async function rpc<T>(page: Page, method: string, params: unknown): Promise<T> {
  const res = await page.request.post(`/api/rpc/${method}`, { data: params })
  expect(res.ok(), `${method} failed: ${await res.text()}`).toBeTruthy()
  return (await res.json()) as T
}

const workspaceMenu = (page: Page) => page.locator('[data-tour="workspace-menu"]')
const loadErrors = (page: Page) => page.getByText('Could not load data')

/** RPC calls the engine refuses from now on, as "404 get_project". */
function watchRefusals(page: Page): string[] {
  const refused: string[] = []
  page.on('response', (r) => {
    const method = r.url().split('/api/rpc/')[1]
    if (method && r.status() >= 400) refused.push(`${r.status()} ${method}`)
  })
  return refused
}

async function newWorkspace(page: Page) {
  await workspaceMenu(page).click()
  await page.getByRole('menuitem', { name: /New workspace/ }).click()
}

/** Open `path`, wait until its item is on screen and loaded, switch, and check that nothing asked for the item again. */
async function switchFrom(page: Page, path: string, shown: () => Promise<void>) {
  await page.goto(path)
  await shown()
  await page.waitForLoadState('networkidle')
  const refused = watchRefusals(page)

  await newWorkspace(page)
  await expect(page).toHaveURL(/\/plates$/)
  await expect(page.getByText('No plates yet')).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(refused).toEqual([])
  await expect(loadErrors(page)).toHaveCount(0)
  await workspaceMenu(page).click()
  await expect(page.getByRole('menu')).toContainText('0 plates')
  await page.keyboard.press('Escape')
}

test.beforeEach(async ({ page }) => {
  // The first-launch tour offer is not what this spec is about.
  await page.addInitScript(() => localStorage.setItem('microspat.tour.offered', '1'))
  const info = await rpc<{ counts: { plates: number } }>(page, 'get_workspace_info', null)
  if (info.counts.plates === 0) await rpc(page, 'load_demo_data', null)
})

for (const { section, kind, query } of PROJECT_PAGES) {
  test(`a new workspace from /${section}/:id asks nothing about the project left behind`, async ({ page }) => {
    const [project] = await rpc<{ id: number; title: string }[]>(page, 'list_projects', { kind })
    expect(project, `the demo study has a ${kind} project`).toBeTruthy()
    await switchFrom(page, `/${section}/${project.id}${query}`, () => expect(page.getByTestId('project-title')).toHaveText(project.title))
  })
}

test('a new workspace from an open plate asks nothing about the plate left behind', async ({ page }) => {
  await switchFrom(page, '/plates', () => expect(page.getByTestId('plate-detail')).toBeVisible())
})

test('a switch the engine refuses brings the page back', async ({ page }) => {
  const [project] = await rpc<{ id: number; title: string }[]>(page, 'list_projects', { kind: 'genotyping' })
  await page.goto(`/projects/${project.id}?tab=review`)
  await expect(page.getByTestId('project-title')).toHaveText(project.title)
  await page.route('**/api/rpc/new_workspace', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'io', message: 'E2E: disk full' } }),
    }),
  )

  await newWorkspace(page)
  await expect(page.getByText('Could not create workspace', { exact: true })).toBeVisible()
  await expect(page.getByText('E2E: disk full', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}\\?tab=review`))
  await expect(page.getByTestId('project-title')).toHaveText(project.title)
  await expect(loadErrors(page)).toHaveCount(0)
})
