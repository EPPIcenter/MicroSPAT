// Regenerates the app icons from src-tauri/icons/icon.svg (desktop sizes only).
// Usage: pnpm icons
import { execFileSync } from 'node:child_process'
import { readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'src-tauri/icons'
execFileSync('pnpm', ['exec', 'tauri', 'icon', join(dir, 'icon.svg'), '--output', dir], { stdio: 'inherit' })
// `tauri icon` also writes mobile and Windows Store assets; this app ships neither.
for (const f of readdirSync(dir)) {
  if (/^(android|ios|Square\d+x\d+Logo\.png|StoreLogo\.png)$/.test(f)) rmSync(join(dir, f), { recursive: true })
}
