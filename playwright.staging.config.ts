import { defineConfig, devices } from '@playwright/test'

/**
 * E2E against the DEPLOYED staging app (real Supabase auth, real data) - distinct from
 * playwright.config.ts, which builds and serves the app locally in MOCK mode.
 *
 * Differences that matter:
 *  - No `webServer`: the target is already running at STAGING_APP_URL.
 *  - Real credentials, supplied ONLY through the environment (never committed). See
 *    tests/staging/support.ts.
 *  - Serial, single worker, with retries: staging is a shared environment, so the suite
 *    stays gentle and tolerates a cold start.
 *
 * The journeys here are deliberately READ-ONLY (navigate + assert). They must never
 * create, edit or delete records - staging holds real data that other people are using.
 *
 * Run:  STAGING_PASSWORD=... npx playwright test --config=playwright.staging.config.ts
 */
export default defineConfig({
  testDir: './tests/staging',
  testMatch: '**/*.staging.pw.ts',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-staging' }]],
  outputDir: 'test-results/staging',
  use: {
    baseURL: process.env.STAGING_APP_URL ?? 'https://app.staging.certedacademia.com',
    // A deployed target is slower than localhost: give navigation and actions room.
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    // Evidence for a failure on an environment we cannot inspect directly.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    ...devices['Desktop Chrome'],
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
