import { defineConfig, devices } from '@playwright/test'

// Real-backend specs (e2e/*.real.spec.ts). No web server here: `pnpm e2e:real`
// (scripts/e2e-real.mjs) starts one engine per spec file and passes its URL in
// MICROSPAT_E2E_URL. The specs skip themselves without it.
export default defineConfig({
  testDir: './e2e',
  testMatch: '*.real.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 },
  },
})
