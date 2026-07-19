import { type Page } from '@playwright/test'

/**
 * Shared helpers + seed ids for the Playwright e2e suite (MOCK mode). Every
 * *.pw.ts file imports from here instead of redefining these, so the login flow,
 * the write-then-reload workaround, and the seed ids have a single source.
 */

// Seeded fixture ids (see the mock seed). The union of what the suites need;
// extra keys are harmless to a file that only uses some of them.
export const SEED = {
  math: 'c0000000-0000-4000-8000-000000000001', // tutor teaches this
  science: 'c0000000-0000-4000-8000-000000000002', // tutor teaches this too
  asgMath: 'a5000000-0000-4000-8000-000000000001', // "Problem set 3", Sara has a seeded submission
  sara: 'a0000000-0000-4000-8000-000000000003',
}

/**
 * Click a server-action submit, wait for the POST to land, then reload. In this
 * mock/host setup the action's own RSC revalidation refetch fails, so the write
 * succeeds but the streamed view stays stale -- a fresh GET shows the result.
 */
export async function submitAndReload(page: Page, click: () => Promise<void>) {
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST', { timeout: 15000 }).catch(() => null),
    click(),
  ])
  await page.waitForTimeout(300)
  await page.reload()
}

/**
 * Sign in through the real login form and wait for the dashboard. Pass
 * `clearCookies` when a test re-logs-in as another role within one test body
 * (the scoping suite), so the previous session does not linger.
 */
export async function loginAs(page: Page, email: string, opts: { clearCookies?: boolean } = {}) {
  if (opts.clearCookies) await page.context().clearCookies()
  await page.goto('/login')
  await page.fill('input[name=email]', email)
  await page.fill('input[name=password]', 'cert-ed')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/dashboard')
}
