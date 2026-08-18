import { chromium, defineConfig } from '@playwright/test'

// Mock-mode PDF routes render with a real headless browser. The app's local-chrome
// finder only knows Windows paths, so on a Linux/macOS CI runner it finds nothing and
// the report-card/finance PDF routes 502. Point MOCK_CHROME_PATH at Playwright's own
// Chromium (installed by `playwright install --with-deps chromium`) so it works on any
// OS. Empty string if unresolved - the app then falls back to a system browser.
const playwrightChromePath = (() => {
  try {
    return chromium.executablePath()
  } catch {
    return ''
  }
})()

// E2E against the running production build in MOCK mode. Two servers on one build:
//   - PORTAL on localhost:3100 with PORTAL_ONLY=1 (forces the app host without an
//     `app.` prefix). Driving plain `localhost` - which equals its own loopback IP -
//     keeps a server-completed Server Action redirect same-origin, so the session
//     cookie survives; no DNS shim or --host-resolver-rules override is needed
//     (their app.localhost<->127.0.0.1 duality was the NEW-23 session-loss cause).
//   - MARKETING on localhost:3101 WITHOUT PORTAL_ONLY, so resolveHost classifies it
//     as the marketing site (the portal server can't, since PORTAL_ONLY forces app).
const MOCK_ENV = {
  MOCK_MODE: '1',
  NEXT_PUBLIC_MOCK_MODE: '1',
  VERCEL: '0',
  NEXT_PUBLIC_SUPABASE_URL: 'http://mock.local',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'mock-anon-key',
  SUPABASE_SECRET_KEY: 'mock-secret',
  CRON_SECRET: 'mock-cron',
  MOCK_CHROME_PATH: playwrightChromePath,
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.pw.ts',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 120000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3100',
    actionTimeout: 15000,
    navigationTimeout: 20000,
  },
  webServer: [
    {
      // Portal: builds once, resets the mock DB first, then serves as the app host.
      command:
        'node scripts/reset-e2e-state.mjs && npm run build && node scripts/fix-next-proxy-build.mjs && npm run start -- -p 3100',
      port: 3100,
      reuseExistingServer: !process.env.CI,
      timeout: 240000,
      env: { ...MOCK_ENV, PORTAL_ONLY: '1' },
    },
    {
      // Marketing: reuses the portal's build. Waits for :3100 (build done + booted)
      // so the two servers never race on the shared `.next`.
      command: 'node scripts/e2e-wait-port.mjs 3100 && npm run start -- -p 3101',
      port: 3101,
      reuseExistingServer: !process.env.CI,
      timeout: 240000,
      env: MOCK_ENV,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        headless: true,
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
})
