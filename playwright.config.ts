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
  // `list` for live console output; `html` (never auto-opened) writes
  // playwright-report/ so CI can upload it as a failure artifact - every E2E
  // diagnosis so far has come from reading test-results/*/error-context.md.
  reporter: [['list'], ['html', { open: 'never' }]],
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
  // Aborted local builds can leave a stale `.next/lock`, and Next 16 currently
  // emits middleware traces even when this app uses `src/proxy.ts`; patch the
  // expected proxy trace filename after build so `next start` stays stable.
  // Locally an already-running :3100 is reused instead of rebuilding.
  webServer: {
    command:
      'node scripts/reset-e2e-state.mjs && npm run build && node scripts/fix-next-proxy-build.mjs && npm run start -- -p 3100',
    port: 3100,
    reuseExistingServer: !process.env.CI,
    timeout: 240000,
    env: {
      MOCK_MODE: '1',
      NEXT_PUBLIC_MOCK_MODE: '1',
      VERCEL: '0',
      NEXT_PUBLIC_SUPABASE_URL: 'http://mock.local',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'mock-anon-key',
      SUPABASE_SECRET_KEY: 'mock-secret',
      CRON_SECRET: 'mock-cron',
      // The browser maps app.localhost -> 127.0.0.1 (see the launch flag below);
      // this makes the NODE server agree, so a server-side self-resolution of
      // app.localhost (Next completing a Server Action) can't ENOTFOUND. Appended
      // so an existing NODE_OPTIONS is preserved.
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import ./scripts/e2e-dns-shim.mjs`.trim(),
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
