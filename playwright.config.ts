import { defineConfig } from '@playwright/test'

// E2E against the running production build in MOCK mode. The app uses host-based
// routing (resolveHost requires an `app.` prefix), so we drive `app.localhost`
// and map it to loopback in the browser.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.pw.ts',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 120000,
  expect: { timeout: 10000 },
  reporter: [['list']],
  // Reset the mock DB before the server boots so every run starts from the seed.
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: 'http://app.localhost:3100',
    actionTimeout: 15000,
    navigationTimeout: 20000,
  },
  // Build + serve the production app in MOCK MODE so the suite is self-contained
  // (this is what lets it run in CI). The command clears the mock DB first, so
  // even a globalSetup/webServer ordering change still boots a clean server.
  // Locally an already-running :3100 is reused instead of rebuilding.
  webServer: {
    command:
      "node -e \"require('fs').rmSync('.mock-db.json',{force:true})\" && npm run build && npm run start -- -p 3100",
    port: 3100,
    reuseExistingServer: !process.env.CI,
    timeout: 240000,
    env: {
      MOCK_MODE: '1',
      NEXT_PUBLIC_MOCK_MODE: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'http://mock.local',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'mock-anon-key',
      SUPABASE_SECRET_KEY: 'mock-secret',
      CRON_SECRET: 'mock-cron',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        headless: true,
        viewport: { width: 1280, height: 800 },
        launchOptions: { args: ['--host-resolver-rules=MAP app.localhost 127.0.0.1'] },
      },
    },
  ],
})
