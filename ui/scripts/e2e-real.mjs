#!/usr/bin/env node
// Runs every real-backend Playwright spec (e2e/*.real.spec.ts) against its
// own engine: one microspat-server per spec file, on a free port, with a
// fresh demo workspace in a temp directory, serving the built UI. Specs of
// different features therefore never see each other's changes.
//
//   pnpm e2e:real                       # build the UI, run every *.real.spec.ts
//   pnpm e2e:real plates setup          # only specs whose file name contains one of these
//   pnpm e2e:real --no-build -j 2       # reuse ui/dist; at most 2 servers at once
//
// Environment:
//   MICROSPAT_SERVER         server binary (default: <repo>/target/release/microspat-server;
//                            build it with `cargo build --release -p microspat-server`)
//   MICROSPAT_E2E_UI_DIR     built UI to serve (default: ui/dist, built first unless --no-build)
//   MICROSPAT_E2E_SYNTH_DIR  synthetic FSA plates for import tests (passed through; specs skip those tests without it)
//   MICROSPAT_E2E_KEEP=1     keep the temp workspaces (they are kept anyway when a spec fails)
// Extra arguments after `--` go to `playwright test`.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const UI = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = resolve(UI, '..')
const SERVER = process.env.MICROSPAT_SERVER ?? join(REPO, 'target', 'release', 'microspat-server')

const argv = process.argv.slice(2)
const dashdash = argv.indexOf('--')
const own = dashdash < 0 ? argv : argv.slice(0, dashdash)
const passthrough = dashdash < 0 ? [] : argv.slice(dashdash + 1)
let build = true
let jobs = 1
const filters = []
for (let i = 0; i < own.length; i++) {
  const a = own[i]
  if (a === '--no-build') build = false
  else if (a === '-j' || a === '--jobs') jobs = Math.max(1, Number(own[++i]) || 1)
  else if (a === '-h' || a === '--help') {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'))
    process.exit(0)
  } else filters.push(a)
}

if (!existsSync(SERVER)) {
  console.error(`Server binary not found: ${SERVER}\nBuild it with \`cargo build --release -p microspat-server\` or set MICROSPAT_SERVER.`)
  process.exit(2)
}

const specs = readdirSync(join(UI, 'e2e'))
  .filter((f) => f.endsWith('.real.spec.ts'))
  .filter((f) => filters.length === 0 || filters.some((x) => f.includes(x)))
  .sort()
if (specs.length === 0) {
  console.error(`No e2e/*.real.spec.ts matches ${filters.join(', ') || '(any)'}`)
  process.exit(2)
}

const children = new Set()
function run(cmd, args, opts = {}) {
  return new Promise((res) => {
    const child = spawn(cmd, args, { cwd: UI, stdio: opts.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', env: { ...process.env, ...opts.env } })
    children.add(child)
    let out = ''
    child.stdout?.on('data', (d) => (out += d))
    child.stderr?.on('data', (d) => (out += d))
    child.on('exit', (code, signal) => {
      children.delete(child)
      res({ code: code ?? (signal ? 1 : 0), out })
    })
  })
}

function stopAll() {
  for (const c of children) c.kill('SIGTERM')
}
for (const sig of ['SIGINT', 'SIGTERM'])
  process.on(sig, () => {
    stopAll()
    process.exit(130)
  })

function freePort() {
  return new Promise((res, rej) => {
    const s = createServer()
    s.unref()
    s.on('error', rej)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => res(port))
    })
  })
}

async function waitForDemo(url, server, timeoutMs = 120_000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if (server.exitCode != null) throw new Error(`server exited with code ${server.exitCode}`)
    try {
      const r = await fetch(`${url}/api/rpc/list_plates`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'null' })
      if (r.ok && (await r.json()).length > 0) {
        // `--demo` loads in the background; wait for its task to finish too.
        const info = await fetch(`${url}/api/rpc/get_workspace_info`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'null' })
        const counts = info.ok ? (await info.json()).counts : null
        if (!counts || counts.plates >= 3) return
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('timed out waiting for the demo workspace')
}

async function runSpec(spec, uiDir) {
  const dir = mkdtempSync(join(tmpdir(), 'microspat-e2e-'))
  const port = await freePort()
  const url = `http://127.0.0.1:${port}`
  const server = spawn(SERVER, ['--workspace', join(dir, 'e2e.microspat'), '--port', String(port), '--demo', '--ui-dir', uiDir], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(server)
  let serverLog = ''
  server.stdout.on('data', (d) => (serverLog += d))
  server.stderr.on('data', (d) => (serverLog += d))
  const started = Date.now()
  let result
  try {
    await waitForDemo(url, server)
    const report = join(dir, 'report.json')
    const r = await run('pnpm', ['exec', 'playwright', 'test', '--config', 'playwright.real.config.ts', `e2e/${spec}`, '--reporter=list,json', ...passthrough], {
      capture: true,
      env: { MICROSPAT_E2E_URL: url, PLAYWRIGHT_JSON_OUTPUT_NAME: report },
    })
    result = { spec, code: r.code, out: r.out, stats: existsSync(report) ? JSON.parse(readFileSync(report, 'utf8')).stats : null }
  } catch (e) {
    result = { spec, code: 1, out: `${e.message}\n--- server log ---\n${serverLog}`, stats: null }
  } finally {
    server.kill('SIGTERM')
    await new Promise((r) => (server.exitCode != null ? r() : server.once('exit', r)))
    children.delete(server)
  }
  result.seconds = Math.round((Date.now() - started) / 1000)
  if (result.code === 0 && process.env.MICROSPAT_E2E_KEEP !== '1') rmSync(dir, { recursive: true, force: true })
  else result.dir = dir
  return result
}

let uiDir = process.env.MICROSPAT_E2E_UI_DIR ? resolve(process.env.MICROSPAT_E2E_UI_DIR) : join(UI, 'dist')
if (build && !process.env.MICROSPAT_E2E_UI_DIR) {
  console.log('Building the UI…')
  const b = await run('pnpm', ['build'], { capture: true })
  if (b.code !== 0) {
    console.error(b.out)
    console.error('UI build failed; fix it, or pass --no-build / MICROSPAT_E2E_UI_DIR to use an existing build.')
    process.exit(1)
  }
}
if (!existsSync(join(uiDir, 'index.html'))) {
  console.error(`No built UI at ${uiDir} (index.html missing). Run without --no-build.`)
  process.exit(2)
}

console.log(`Server: ${SERVER}\nUI: ${uiDir}\nSpecs: ${specs.join(', ')} (${Math.min(jobs, specs.length)} at a time)\n`)
const queue = [...specs]
const results = []
await Promise.all(
  Array.from({ length: Math.min(jobs, specs.length) }, async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      const r = await runSpec(s, uiDir)
      console.log(`\n=== ${s} (${r.code === 0 ? 'passed' : 'FAILED'}, ${r.seconds}s) ===\n${r.out.trim()}`)
      if (r.dir) console.log(`(workspace kept in ${r.dir})`)
      results.push(r)
    }
  }),
)

console.log('\nSummary')
for (const r of results.sort((a, b) => a.spec.localeCompare(b.spec))) {
  const st = r.stats
  const counts = st ? `${st.expected} passed, ${st.unexpected} failed, ${st.flaky} flaky, ${st.skipped} skipped` : 'did not run'
  console.log(`  ${r.code === 0 ? 'ok  ' : 'FAIL'}  ${r.spec.padEnd(32)} ${counts}`)
}
process.exit(results.some((r) => r.code !== 0) ? 1 : 0)
