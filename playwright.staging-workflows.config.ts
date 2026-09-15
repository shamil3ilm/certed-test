import { defineConfig, devices } from '@playwright/test'

/**
 * WORKFLOW E2E against the deployed staging app: each persona does their real work - creates,
 * submits, grades, marks, messages, issues - and the next persona sees the result.
 *
 * Unlike playwright.staging.config.ts (read-only by contract), these specs WRITE. They are
 * limited to the seeded @certed.test accounts, every record they create carries the run tag
 * from tests/staging-workflows/support.ts, and each spec archives, voids or removes what it
 * made where the app allows it.
 *
 * Serial, one worker, no retries: a workflow step depends on the step before it, and a retry
 * would repeat writes.
 *
 * Run:  STAGING_PASSWORD=... npx playwright test --config=playwright.staging-workflows.config.ts
 */
export default defineConfig({
  testDir: './tests/staging-workflows',
  testMatch: '**/*.workflow.pw.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-staging-workflows' }]],
  outputDir: 'test-results/staging-workflows',
  use: {
    baseURL: process.env.STAGING_APP_URL ?? 'https://app.staging.certedacademia.com',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    ...devices['Desktop Chrome'],
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
