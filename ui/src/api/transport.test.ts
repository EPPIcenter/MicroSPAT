import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, onlineManager } from '@tanstack/react-query'
import { RpcError, rpc, setBackendForTesting, toRpcError, detectTransport } from './transport'
import { createQueryClient, handleAppEvent, keyMatchesEntity } from './query'
import { useTaskStore } from '@/stores/tasks'
import { useToastStore } from '@/stores/toasts'

afterEach(() => {
  onlineManager.setOnline(true)
  setBackendForTesting(null)
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(body == null ? '' : JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('http transport', () => {
  it('POSTs params as JSON to /api/rpc/<method> and returns the body', async () => {
    const f = stubFetch(200, { id: 1 })
    expect(detectTransport()).toBe('http')
    await expect(rpc('get_plate', { id: 1 })).resolves.toEqual({ id: 1 })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/rpc/get_plate')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"id":1}')
  })
  it('sends null when there are no params', async () => {
    const f = stubFetch(200, null)
    await expect(rpc('ping')).resolves.toBeNull()
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].body).toBe('null')
  })
  it('turns error bodies into RpcError', async () => {
    stubFetch(404, { error: { code: 'not_found', message: 'No plate 9' } })
    const e = await rpc('get_plate', { id: 9 }).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(RpcError)
    expect(e).toMatchObject({ code: 'not_found', message: 'No plate 9' })
  })
  it('network failures become transport errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    )
    await expect(rpc('x')).rejects.toMatchObject({ code: 'transport' })
  })
})

describe('mock transport', () => {
  it('is selected by ?mock and dispatches registered handlers', async () => {
    window.history.replaceState(null, '', '/?mock=1')
    expect(detectTransport()).toBe('mock')
    const info = await rpc<{ name: string }>('get_workspace_info')
    expect(info.name).toBe('Untitled workspace')
    await expect(rpc('no_such_method')).rejects.toMatchObject({ code: 'unknown_method' })
    await expect(rpc('mock_fail')).rejects.toMatchObject({ code: 'mock_error' })
    window.history.replaceState(null, '', '/')
  })
})

describe('toRpcError', () => {
  it('accepts Tauri-style plain error objects and strings', () => {
    expect(toRpcError({ code: 'bad', message: 'm' })).toMatchObject({ code: 'bad', message: 'm' })
    expect(toRpcError('boom')).toMatchObject({ code: 'transport', message: 'boom' })
  })
})

describe('event routing', () => {
  it('changed events invalidate keys starting with the entity', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['plates'], 1)
    qc.setQueryData(['plates', 3, 'wells'], 1)
    qc.setQueryData(['samples'], 1)
    handleAppEvent(qc, { type: 'changed', entity: 'plates', ids: [3] })
    expect(qc.getQueryState(['plates'])?.isInvalidated).toBe(true)
    expect(qc.getQueryState(['plates', 3, 'wells'])?.isInvalidated).toBe(true)
    expect(qc.getQueryState(['samples'])?.isInvalidated).toBe(false)
    expect(keyMatchesEntity(['plate'], 'plates')).toBe(false)
  })
  it('changed events with ids leave other items alone', () => {
    const qc = new QueryClient()
    qc.setQueryData(['plates'], 1)
    qc.setQueryData(['plates', 3], 1)
    qc.setQueryData(['plates', 4, 'well', 9], 1)
    handleAppEvent(qc, { type: 'changed', entity: 'plates', ids: [3] })
    expect(qc.getQueryState(['plates'])?.isInvalidated).toBe(true)
    expect(qc.getQueryState(['plates', 3])?.isInvalidated).toBe(true)
    expect(qc.getQueryState(['plates', 4, 'well', 9])?.isInvalidated).toBe(false)
    handleAppEvent(qc, { type: 'changed', entity: 'plates', ids: null })
    expect(qc.getQueryState(['plates', 4, 'well', 9])?.isInvalidated).toBe(true)
  })
  it('task events feed the task store and failures toast once', () => {
    const qc = new QueryClient()
    const task = { id: 't1', kind: 'ladder', label: 'Sizing', status: 'running' as const, progress: 0.5, message: null }
    handleAppEvent(qc, { type: 'task', task })
    expect(useTaskStore.getState().tasks.t1?.progress).toBe(0.5)
    const before = useToastStore.getState().toasts.length
    handleAppEvent(qc, { type: 'task', task: { ...task, status: 'failed', message: 'bad ladder' } })
    handleAppEvent(qc, { type: 'task', task: { ...task, status: 'failed', message: 'bad ladder' } })
    expect(useToastStore.getState().toasts.length).toBe(before + 1)
    expect(useTaskStore.getState().tasks.t1?.status).toBe('failed')
  })
})

describe('createQueryClient', () => {
  it('runs queries and mutations even when the browser reports offline', async () => {
    onlineManager.setOnline(false)
    const qc = createQueryClient()

    const queryFn = vi.fn(async () => ({ id: 2 }))
    await expect(qc.fetchQuery({ queryKey: ['plates', 2], queryFn })).resolves.toEqual({ id: 2 })
    expect(queryFn).toHaveBeenCalledTimes(1)

    const mutationFn = vi.fn(async () => 'saved')
    const mutation = qc.getMutationCache().build(qc, { mutationFn })
    await expect(mutation.execute(undefined)).resolves.toBe('saved')
    expect(mutationFn).toHaveBeenCalledTimes(1)
  })
})
