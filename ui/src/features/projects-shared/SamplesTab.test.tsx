/** SamplesTab handles both sample modes of an estimator itself (no page wrapper needed). */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ProjectDetail, ProjectSampleRow, ProjectSummary } from '@/api/bindings'
import { createMockBackend } from '@/api/mock/backend'
import { dispatchMock } from '@/api/mock/registry'
import { setBackendForTesting } from '@/api/transport'
import { SamplesTab } from './SamplesTab'

beforeAll(() => setBackendForTesting(createMockBackend()))
afterAll(() => setBackendForTesting(null))

async function binEstimator(): Promise<ProjectDetail> {
  const list = (await dispatchMock('list_projects', { kind: 'bin_estimator' })) as ProjectSummary[]
  const p = list.find((x) => x.title === 'Mock bins')!
  return (await dispatchMock('get_project', { id: p.id })) as ProjectDetail
}

function renderTab(detail: ProjectDetail) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <div style={{ height: 600, display: 'flex' }}>
        <SamplesTab detail={detail} />
      </div>
    </QueryClientProvider>,
  )
}

describe('SamplesTab sample modes', () => {
  it('every-sample mode: no Remove (the engine refuses it); "Use only" switches to a list; list mode can switch back', async () => {
    const d = await binEstimator()
    expect(d.project.all_samples).toBe(true)
    const { unmount } = renderTab(d)
    expect(await screen.findByTestId('samples-mode')).toHaveTextContent('Every sample with runs')
    expect(screen.getByTestId('samples-tab')).toHaveAttribute('data-mode', 'all')
    const grid = await screen.findByRole('grid', { name: 'Project samples' })
    expect(screen.queryByTestId('remove-samples')).toBeNull()
    expect(screen.getByTestId('keep-samples')).toBeDisabled()
    // Select everything (the virtual rows do not render in jsdom; Ctrl+A works on the grid).
    const before = ((await dispatchMock('list_project_samples', { id: d.project.id })) as ProjectSampleRow[]).length
    grid.focus()
    await userEvent.keyboard('{Control>}a{/Control}')
    await waitFor(() => expect(screen.getByTestId('keep-samples')).toBeEnabled())
    expect(screen.getByTestId('exclude-samples')).toBeDisabled() // leaving out everything is not a list
    await userEvent.click(screen.getByTestId('keep-samples'))
    await userEvent.click(await screen.findByRole('button', { name: 'Use only these' }))
    await waitFor(async () => expect(((await dispatchMock('get_project', { id: d.project.id })) as ProjectDetail).project.all_samples).toBe(false), { timeout: 5000 })
    expect(((await dispatchMock('list_project_samples', { id: d.project.id })) as ProjectSampleRow[]).length).toBe(before)
    unmount()
    renderTab((await dispatchMock('get_project', { id: d.project.id })) as ProjectDetail)
    expect(await screen.findByTestId('samples-use-all')).toBeInTheDocument()
    expect(screen.getByTestId('samples-tab')).toHaveAttribute('data-mode', 'list')
    expect(screen.getByTestId('remove-samples')).toBeInTheDocument()
  }, 20000)
})
