/** Default mock handlers for shell-level methods. */
import type { DemoResult, WorkspaceCounts, WorkspaceInfo } from '../bindings'
import type { MethodName } from '../client'
import { registerMocks, type MockHandler } from './registry'

const EMPTY: WorkspaceCounts = { plates: 0, samples: 0, loci: 0, locus_sets: 0, ladders: 4 }

let workspace: WorkspaceInfo = {
  path: null,
  name: 'Untitled workspace',
  counts: EMPTY,
  schema_version: 1,
  app_version: 'mock',
  file_size: 0,
}

function basename(p: string) {
  return p.split(/[\\/]/).pop() ?? p
}

// Engine method names are checked against the generated client.
const shell: Partial<Record<MethodName, MockHandler>> = {
  get_workspace_info: () => workspace,
  new_workspace: (params, ctx) => {
    const path = (params as { path?: string | null } | null)?.path ?? null
    workspace = { ...workspace, path, name: path ? basename(path) : 'Untitled workspace', counts: EMPTY }
    ctx.changed('workspace')
    return workspace
  },
  open_workspace: (params, ctx) => {
    const { path } = params as { path: string }
    workspace = { ...workspace, path, name: basename(path), counts: { plates: 4, samples: 310, loci: 12, locus_sets: 2, ladders: 4 } }
    ctx.changed('workspace')
    return workspace
  },
  save_workspace_as: (params, ctx) => {
    const { path } = params as { path: string }
    workspace = { ...workspace, path, name: basename(path) }
    ctx.changed('workspace')
    return workspace
  },
  load_demo_data: async (_params, ctx) => {
    await ctx.runTask('load_demo_data', 'Loading demo data', 3000)
    workspace = { ...workspace, counts: { plates: 3, samples: 288, loci: 6, locus_sets: 1, ladders: 4 } }
    ctx.changed('workspace')
    ctx.changed('plates')
    const result: DemoResult = { plates: [], locus_set_id: 1, samples_created: 288 }
    return result
  },
  write_text_file: () => null,
}
registerMocks(shell as Record<string, MockHandler>)

registerMocks({
  mock_fail: () => {
    throw { code: 'mock_error', message: 'This is what an engine error looks like.' }
  },
  mock_task: async (params, ctx) => {
    const p = (params ?? {}) as { fail?: boolean; label?: string }
    await ctx.runTask('mock', p.label ?? 'Recalculating ladders', 4000, p.fail ? { fail: 'Ladder fit failed in 3 wells' } : undefined)
    return null
  },
})

// Feature mock handlers.
import '@/features/plates/mock'
// Setup pages; after plates so their ladder/locus/sample handlers are the ones used.
import '@/features/ladders/mock'
import '@/features/loci/mock'
import '@/features/samples/mock'
// Projects: the shared project store first, then the kinds that analyze into it.
import '@/features/projects-shared/mock'
import '@/features/genotyping/mock'
// Controls and quantification bias (after genotyping: they use its bins and seeded estimators).
import '@/features/controls/mock'
import '@/features/quant-bias/mock'
// Bin and artifact estimators (after genotyping: they extend its get_locus_bins and its seeded estimators).
import '@/features/bin-estimators/mock'
import '@/features/artifact-estimators/mock'
import '@/features/settings/mock'
