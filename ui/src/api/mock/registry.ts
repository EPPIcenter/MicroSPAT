/**
 * Registry of fake RPC handlers used by the mock transport. Feature pages
 * register handlers for their methods (see handlers.ts) so the UI can be
 * built and screenshotted before the engine implements them.
 */
import { RpcError, type AppEvent, type TaskInfo } from '../transport'

export interface MockContext {
  emit(e: AppEvent): void
  /** Simulate a background task that reports progress over `ms`. */
  runTask(kind: string, label: string, ms?: number, opts?: { fail?: string }): Promise<void>
  /** Mark an entity changed (invalidates queries keyed under it). */
  changed(entity: string, ids?: number[] | null): void
}

export type MockHandler = (params: unknown, ctx: MockContext) => unknown | Promise<unknown>

const handlers = new Map<string, MockHandler>()
const listeners = new Set<(e: AppEvent) => void>()
let taskSeq = 0

export function registerMock(method: string, handler: MockHandler): void {
  handlers.set(method, handler)
}

export function registerMocks(map: Record<string, MockHandler>): void {
  for (const [m, h] of Object.entries(map)) handlers.set(m, h)
}

/** The handler registered so far for `method`, so a feature can wrap (extend) it. */
export function getMock(method: string): MockHandler | undefined {
  return handlers.get(method)
}

export function emitMockEvent(e: AppEvent): void {
  for (const l of listeners) l(e)
}

export function addMockListener(l: (e: AppEvent) => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const mockContext: MockContext = {
  emit: emitMockEvent,
  changed(entity, ids = null) {
    emitMockEvent({ type: 'changed', entity, ids })
  },
  async runTask(kind, label, ms = 2500, opts) {
    const id = `mock-${++taskSeq}`
    const steps = 20
    const base: TaskInfo = { id, kind, label, status: 'running', progress: 0, message: null }
    emitMockEvent({ type: 'task', task: base })
    for (let i = 1; i <= steps; i++) {
      await sleep(ms / steps)
      if (opts?.fail && i === Math.floor(steps * 0.6)) {
        emitMockEvent({ type: 'task', task: { ...base, status: 'failed', progress: i / steps, message: opts.fail } })
        throw new RpcError('task_failed', opts.fail)
      }
      emitMockEvent({
        type: 'task',
        task: { ...base, progress: i / steps, message: `Step ${i} of ${steps}` },
      })
    }
    emitMockEvent({ type: 'task', task: { ...base, status: 'done', progress: 1, message: null } })
  },
}

export async function dispatchMock(method: string, params: unknown): Promise<unknown> {
  const h = handlers.get(method)
  await sleep(40 + Math.random() * 60)
  if (!h) throw new RpcError('unknown_method', `Mock transport has no handler for "${method}"`)
  return h(params, mockContext)
}
