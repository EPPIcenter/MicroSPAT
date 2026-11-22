/**
 * TanStack Query wiring.
 *
 * Query keys start with the entity name the engine uses in `changed` events,
 * e.g. `['plates']`, `['plates', id]`, `['plates', id, 'wells']`. A
 * `{type:'changed', entity:'plates'}` event invalidates every key whose first
 * element is `'plates'`. Use `apiQuery()` to build options that follow this;
 * `METHOD_CHANGES` in client.ts lists the entities each method announces.
 */
import { MutationCache, QueryCache, QueryClient, queryOptions, type QueryKey } from '@tanstack/react-query'
import { toast } from '@/stores/toasts'
import { useTaskStore } from '@/stores/tasks'
import { rpc, subscribe, type AppEvent, isRpcError } from './transport'
import { call, type MethodName, type Methods } from './client'

function describe(e: unknown): string {
  if (isRpcError(e)) return e.message
  if (e instanceof Error) return e.message
  return String(e)
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (e, q) => {
        if (q.meta?.silent) return
        toast.error('Could not load data', describe(e))
      },
    }),
    mutationCache: new MutationCache({
      onError: (e, _v, _c, m) => {
        if (m.meta?.silent) return
        toast.error(typeof m.meta?.errorTitle === 'string' ? m.meta.errorTitle : 'Action failed', describe(e))
      },
    }),
    defaultOptions: {
      queries: {
        // Data only changes through the engine, which tells us via events.
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        retry: (n, e) => !(isRpcError(e) && e.code !== 'transport') && n < 2,
      },
    },
  })
}

/**
 * Keys that a `changed` event for `entity` should invalidate. When the event
 * names ids, keys of one item (`[entity, id, ...]` with a numeric id) only
 * match those ids, so importing plate 7 does not refetch plate 3's wells.
 * Lists (`[entity]`, or a non-numeric second element) always match.
 */
export function keyMatchesEntity(key: QueryKey, entity: string, ids?: readonly number[] | null): boolean {
  if (key[0] !== entity) return false
  if (ids && typeof key[1] === 'number') return ids.includes(key[1])
  return true
}

/** Route one engine event into the query cache and task store. */
export function handleAppEvent(qc: QueryClient, e: AppEvent): void {
  if (e.type === 'changed') {
    void qc.invalidateQueries({ predicate: (q) => keyMatchesEntity(q.queryKey, e.entity, e.ids) })
  } else if (e.type === 'task') {
    const prev = useTaskStore.getState().tasks[e.task.id]
    useTaskStore.getState().upsert(e.task)
    if (e.task.status === 'failed' && prev?.status !== 'failed') {
      toast.error(`${e.task.label} failed`, e.task.message ?? undefined)
    }
  }
}

/** Subscribe the query client to engine events. Returns unsubscribe. */
export function connectEvents(qc: QueryClient): () => void {
  return subscribe((e) => handleAppEvent(qc, e))
}

/**
 * Typed query options for an engine method:
 * `useQuery(apiQuery(['plates', id], 'get_plate', { id }))`. Params are omitted for
 * methods that take none. Result types come from the generated client.
 */
export function apiQuery<M extends MethodName>(
  key: readonly [string, ...unknown[]],
  method: M,
  ...params: Methods[M]['params'] extends null ? [] : [Methods[M]['params']]
) {
  return queryOptions<Methods[M]['result']>({
    queryKey: key,
    queryFn: () => call(method, (params[0] ?? null) as Methods[M]['params']),
  })
}

/** Untyped query options, for methods not in the engine yet (mock-only). */
export function rpcQuery<T>(key: readonly [string, ...unknown[]], method: string, params?: unknown) {
  return queryOptions<T>({
    queryKey: key,
    queryFn: () => rpc<T>(method, params),
  })
}

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: { silent?: boolean }
    mutationMeta: { silent?: boolean; errorTitle?: string }
  }
}
