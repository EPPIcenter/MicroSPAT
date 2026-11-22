import type { Backend } from '../transport'
import { chooseBrowserFiles, downloadText } from '../transport'
import { addMockListener, dispatchMock } from './registry'
import './handlers'

/** In-process backend for `pnpm dev:mock`, the gallery, and tests. */
export function createMockBackend(): Backend {
  return {
    kind: 'mock',
    rpc: dispatchMock,
    subscribe: addMockListener,
    async pickFiles(opts) {
      const files = await chooseBrowserFiles(opts)
      return files.map((f) => ({ path: `/mock/upload/${f.name}`, name: f.name }))
    },
    async saveTextFile(name, content) {
      downloadText(name, content)
      return true
    },
    async pickSavePath(name) {
      return `/mock/${name}`
    },
    async pickOpenPath(exts) {
      return `/mock/workspace.${exts[0] ?? 'microspat'}`
    },
  }
}
