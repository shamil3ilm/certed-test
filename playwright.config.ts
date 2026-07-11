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
  use: {
    baseURL: 'http://app.localhost:3100',
    actionTimeout: 15000,
    navigationTimeout: 20000,
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
