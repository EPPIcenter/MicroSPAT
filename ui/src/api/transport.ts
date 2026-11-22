/**
 * The one module that knows where the engine lives.
 *
 * Three backends implement the same contract:
 * - tauri: `invoke('rpc')`, event `microspat://event`, native dialogs.
 * - http:  `POST /api/rpc/<method>`, SSE `/api/events`, multipart `/api/upload`.
 * - mock:  in-process fake (src/api/mock), for running the UI with no engine.
 *
 * Selection: Tauri when `window.__TAURI_INTERNALS__` exists; otherwise mock
 * when `VITE_TRANSPORT=mock` (`pnpm dev:mock`) or, in a development build,
 * the URL has `?mock` (sticky for the tab via sessionStorage, `?mock=0` turns
 * it off); otherwise http. A production build ignores `?mock`: it always
 * talks to the engine.
 */

import type { AppEvent, TaskInfo } from './bindings'

// Event types are generated from the engine (crates/microspat-engine/src/events.rs).
export type { AppEvent, TaskInfo }

export interface PickedFile {
  path: string
  name: string
}

export interface PickFilesOptions {
  multiple?: boolean
  directory?: boolean
  /** Extensions without the dot, e.g. `['fsa', 'zip']`. */
  extensions?: string[]
}

/** Error from the engine (or the transport itself, with code `transport`). */
export class RpcError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'RpcError'
    this.code = code
  }
}

export function isRpcError(e: unknown): e is RpcError {
  return e instanceof RpcError
}

/** The contract every backend implements. */
export interface Backend {
  readonly kind: 'tauri' | 'http' | 'mock'
  rpc(method: string, params: unknown): Promise<unknown>
  subscribe(handler: (e: AppEvent) => void): () => void
  pickFiles(opts: PickFilesOptions): Promise<PickedFile[]>
  saveTextFile(suggestedName: string, content: string): Promise<boolean>
  pickSavePath(suggestedName: string, extensions: string[]): Promise<string | null>
  pickOpenPath(extensions: string[]): Promise<string | null>
}

// ---------------------------------------------------------------- selection

export type TransportKind = Backend['kind']

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function mockRequested(): boolean {
  if (typeof window === 'undefined') return false
  if (!import.meta.env.DEV) return import.meta.env.VITE_TRANSPORT === 'mock'
  try {
    const q = new URLSearchParams(window.location.search).get('mock')
    if (q !== null) {
      const on = q !== '0' && q !== 'false'
      sessionStorage.setItem('microspat.mock', on ? '1' : '0')
      return on
    }
    const stored = sessionStorage.getItem('microspat.mock')
    if (stored !== null) return stored === '1'
  } catch {
    // Storage can be unavailable (private mode); fall through to env.
  }
  return import.meta.env.VITE_TRANSPORT === 'mock'
}

export function detectTransport(): TransportKind {
  if (isTauri()) return 'tauri'
  return mockRequested() ? 'mock' : 'http'
}

let backendPromise: Promise<Backend> | null = null
let backendKind: TransportKind | null = null

function getBackend(): Promise<Backend> {
  if (!backendPromise) {
    backendKind = detectTransport()
    backendPromise =
      backendKind === 'tauri'
        ? Promise.resolve(tauriBackend())
        : backendKind === 'mock'
          ? import('./mock/backend').then((m) => m.createMockBackend())
          : Promise.resolve(httpBackend())
  }
  return backendPromise
}

/** Which backend is in use. Stable for the lifetime of the page. */
export function transportKind(): TransportKind {
  return backendKind ?? detectTransport()
}

/** Replace the backend (tests). Pass null to re-detect on next call. */
export function setBackendForTesting(b: Backend | null): void {
  backendPromise = b ? Promise.resolve(b) : null
  backendKind = b ? b.kind : null
}

// ---------------------------------------------------------------- public API

/** Call an engine method. Rejects with `RpcError`. */
export async function rpc<T>(method: string, params?: unknown): Promise<T> {
  const b = await getBackend()
  try {
    return (await b.rpc(method, params ?? null)) as T
  } catch (e) {
    throw toRpcError(e)
  }
}

/** Listen to engine events. Returns an unsubscribe function. */
export function subscribe(handler: (e: AppEvent) => void): () => void {
  let unsub: (() => void) | null = null
  let cancelled = false
  void getBackend().then((b) => {
    if (!cancelled) unsub = b.subscribe(handler)
  })
  return () => {
    cancelled = true
    unsub?.()
  }
}

/**
 * Let the user choose files. In Tauri these are filesystem paths; in the
 * browser the files are uploaded and the paths point at server temp files.
 * Resolves to `[]` when the user cancels.
 */
export async function pickFiles(opts: PickFilesOptions = {}): Promise<PickedFile[]> {
  return (await getBackend()).pickFiles(opts)
}

/** Save text the user chose a location for (download in the browser). Returns false if cancelled. */
export async function saveTextFile(suggestedName: string, content: string): Promise<boolean> {
  return (await getBackend()).saveTextFile(suggestedName, content)
}

/** Native save dialog for workspace files. Null in the browser or on cancel. */
export async function pickSavePath(suggestedName: string, extensions: string[]): Promise<string | null> {
  return (await getBackend()).pickSavePath(suggestedName, extensions)
}

/** Native open dialog for workspace files. Null in the browser or on cancel. */
export async function pickOpenPath(extensions: string[]): Promise<string | null> {
  return (await getBackend()).pickOpenPath(extensions)
}

/** True when native path dialogs exist (hide workspace open/save otherwise). */
export function hasNativePaths(): boolean {
  return transportKind() === 'tauri'
}

/**
 * Upload already-chosen browser `File`s (drag-and-drop). Tauri drops are
 * handled natively and never reach here.
 */
export async function uploadFiles(files: File[]): Promise<PickedFile[]> {
  const b = await getBackend()
  if (b.kind === 'mock') return files.map((f) => ({ path: `/mock/upload/${f.name}`, name: f.name }))
  return httpUpload(files)
}

// ---------------------------------------------------------------- helpers

export function toRpcError(e: unknown): RpcError {
  if (e instanceof RpcError) return e
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>
    const inner = (o.error && typeof o.error === 'object' ? o.error : o) as Record<string, unknown>
    if (typeof inner.code === 'string' && typeof inner.message === 'string') {
      return new RpcError(inner.code, inner.message)
    }
    if (e instanceof Error) return new RpcError('transport', e.message)
  }
  if (typeof e === 'string') return new RpcError('transport', e)
  return new RpcError('transport', 'Unknown error')
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] || p
}

function acceptAttr(exts: string[] | undefined): string {
  return (exts ?? []).map((e) => `.${e.replace(/^\./, '')}`).join(',')
}

// ---------------------------------------------------------------- tauri

function tauriBackend(): Backend {
  const core = () => import('@tauri-apps/api/core')
  const dialog = () => import('@tauri-apps/plugin-dialog')
  const filters = (exts?: string[]) =>
    exts && exts.length
      ? [{ name: exts.join(',') === 'microspat' ? 'MicroSPAT workspace' : exts.join(', ').toUpperCase(), extensions: exts }]
      : undefined

  const backend: Backend = {
    kind: 'tauri',
    async rpc(method, params) {
      const { invoke } = await core()
      return invoke('rpc', { method, params })
    },
    subscribe(handler) {
      let unlisten: (() => void) | null = null
      let cancelled = false
      void import('@tauri-apps/api/event').then(({ listen }) =>
        listen<AppEvent>('microspat://event', (e) => handler(e.payload)).then((fn) => {
          if (cancelled) fn()
          else unlisten = fn
        }),
      )
      return () => {
        cancelled = true
        unlisten?.()
      }
    },
    async pickFiles(opts) {
      const { open } = await dialog()
      const res = await open({
        multiple: opts.multiple ?? false,
        directory: opts.directory ?? false,
        filters: opts.directory ? undefined : filters(opts.extensions),
      })
      if (res == null) return []
      const paths = Array.isArray(res) ? res : [res]
      return paths.map((p) => ({ path: p, name: basename(p) }))
    },
    async saveTextFile(suggestedName, content) {
      const ext = suggestedName.includes('.') ? suggestedName.split('.').pop() : undefined
      const path = await backend.pickSavePath(suggestedName, ext ? [ext] : [])
      if (!path) return false
      await backend.rpc('write_text_file', { path, content })
      return true
    },
    async pickSavePath(suggestedName, extensions) {
      const { save } = await dialog()
      return (await save({ defaultPath: suggestedName, filters: filters(extensions) })) ?? null
    },
    async pickOpenPath(extensions) {
      const { open } = await dialog()
      const res = await open({ multiple: false, directory: false, filters: filters(extensions) })
      return typeof res === 'string' ? res : null
    },
  }
  return backend
}

// ---------------------------------------------------------------- http

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    throw new RpcError('transport', `Invalid JSON from server (HTTP ${res.status})`)
  }
}

async function httpUpload(files: File[]): Promise<PickedFile[]> {
  const form = new FormData()
  for (const f of files) form.append('files', f, f.webkitRelativePath || f.name)
  let res: Response
  try {
    // The header makes this a non-simple request, so another site cannot post
    // files here: the server refuses uploads without it.
    res = await fetch('/api/upload', { method: 'POST', body: form, headers: { 'X-MicroSPAT-Request': '1' } })
  } catch (e) {
    throw new RpcError('transport', `Upload failed: ${(e as Error).message}`)
  }
  const body = await readJson(res)
  if (!res.ok) throw toRpcError(body ?? { code: 'http', message: `HTTP ${res.status}` })
  return body as PickedFile[]
}

/** Open a hidden file input and resolve with the chosen files ([] on cancel). */
export function chooseBrowserFiles(opts: PickFilesOptions): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = opts.multiple ?? false
    if (opts.directory) input.webkitdirectory = true
    const accept = acceptAttr(opts.extensions)
    if (accept && !opts.directory) input.accept = accept
    input.style.display = 'none'
    const done = (files: File[]) => {
      input.remove()
      resolve(files)
    }
    input.addEventListener('change', () => done(Array.from(input.files ?? [])))
    input.addEventListener('cancel', () => done([]))
    // Inside an open dialog, keep the input in it: a focus change outside a
    // modal dialog would dismiss it while the picker is open.
    const host = document.activeElement?.closest('[role=dialog],[role=alertdialog]') ?? document.body
    host.appendChild(input)
    input.click()
  })
}

export function downloadText(name: string, content: string): void {
  const type = name.endsWith('.csv') ? 'text/csv' : 'text/plain'
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function httpBackend(): Backend {
  return {
    kind: 'http',
    async rpc(method, params) {
      let res: Response
      try {
        res = await fetch(`/api/rpc/${encodeURIComponent(method)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(params ?? null),
        })
      } catch (e) {
        throw new RpcError('transport', `Cannot reach the MicroSPAT server: ${(e as Error).message}`)
      }
      const body = await readJson(res)
      if (!res.ok) throw toRpcError(body ?? { code: 'http', message: `HTTP ${res.status}` })
      return body
    },
    subscribe(handler) {
      // EventSource reconnects on its own after network errors.
      const es = new EventSource('/api/events')
      es.onmessage = (m) => {
        try {
          handler(JSON.parse(m.data as string) as AppEvent)
        } catch {
          // Ignore malformed events rather than killing the stream.
        }
      }
      return () => es.close()
    },
    async pickFiles(opts) {
      const files = await chooseBrowserFiles(opts)
      if (files.length === 0) return []
      return httpUpload(files)
    },
    async saveTextFile(name, content) {
      downloadText(name, content)
      return true
    },
    async pickSavePath() {
      return null
    },
    async pickOpenPath() {
      return null
    },
  }
}

/**
 * Native (Tauri) file drops, with the position in CSS pixels. Browser drops
 * arrive as DOM events instead and never reach this. Returns an unsubscribe
 * function.
 */
export function onNativeFileDrop(
  handler: (e: { type: 'over' | 'drop' | 'leave'; paths: string[]; x: number; y: number }) => void,
): () => void {
  if (!isTauri()) return () => {}
  let unlisten: (() => void) | null = null
  let cancelled = false
  // Despite its PhysicalPosition type, the position is in logical points on
  // macOS and Linux (wry passes the native view coordinates through); only
  // WebView2 on Windows reports physical pixels.
  // Read at each event: the ratio changes when the window moves to a
  // monitor with different scaling.
  const isWindows = navigator.userAgent.includes('Windows')
  void import('@tauri-apps/api/webview').then(({ getCurrentWebview }) =>
    getCurrentWebview()
      .onDragDropEvent((ev) => {
        const p = ev.payload
        const scale = isWindows ? window.devicePixelRatio || 1 : 1
        if (p.type === 'enter' || p.type === 'over')
          handler({ type: 'over', paths: [], x: p.position.x / scale, y: p.position.y / scale })
        else if (p.type === 'drop')
          handler({ type: 'drop', paths: p.paths, x: p.position.x / scale, y: p.position.y / scale })
        else handler({ type: 'leave', paths: [], x: 0, y: 0 })
      })
      .then((fn) => {
        if (cancelled) fn()
        else unlisten = fn
      }),
  )
  return () => {
    cancelled = true
    unlisten?.()
  }
}

/**
 * Actions the desktop shell asks the UI to run: native menu items
 * (`new_workspace`, `open_workspace`, `save_workspace_as`, `load_demo_data`),
 * and for a workspace file the OS hands over, which the shell opens itself:
 * `workspace_opening` before the engine changes workspace, then
 * `workspace_opened` or `workspace_open_failed`. No-op outside Tauri.
 * Returns an unsubscribe function.
 */
export function onShellAction(handler: (action: string) => void): () => void {
  if (!isTauri()) return () => {}
  let unlisten: (() => void) | null = null
  let cancelled = false
  void import('@tauri-apps/api/event').then(({ listen }) =>
    listen<string>('microspat://action', (e) => handler(e.payload)).then((fn) => {
      if (cancelled) fn()
      else unlisten = fn
    }),
  )
  return () => {
    cancelled = true
    unlisten?.()
  }
}
