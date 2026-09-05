import { type Page, type TestInfo } from '@playwright/test'

/**
 * Shared helpers + seed ids for the Playwright e2e suite (MOCK mode). Every
 * *.pw.ts file imports from here instead of redefining these, so the login flow,
 * the mock-environment refresh workaround, and the seed ids have a single source.
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
 * mock/host setup the action's own RSC revalidation refetch does not refresh the
 * streamed view reliably, so a fresh GET is the stable way to observe the new state.
 *
 * The reload does NOT re-submit the action, so it cannot double-create: a Server
 * Action is a `fetch` POST carrying a Next-Action header, not a document navigation
 * (measured - reload() issues zero POSTs and the record count stays 1). A creating
 * spec that finds TWO of its record has hit retry pollution, not a replay - see
 * attemptName below.
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
 * A fixture name unique to the test ATTEMPT that creates it.
 *
 * The mock database is reset ONCE per run (scripts/reset-e2e-state.mjs, in the webServer
 * command) and never between tests or retries. So when a creating spec fails its first
 * attempt for ANY reason - a flake, a slow boot - Playwright retries the whole test body,
 * the first attempt's row is still there, and the retry's `getByRole('heading', {name})`
 * resolves to TWO elements. The run then reports a strict-mode violation that describes
 * the retry, not the failure that actually broke the test.
 *
 * Suffixing the name on retries keeps each attempt's rows disjoint, so a retry either
 * reproduces the real failure or passes. Attempt 0 keeps the bare name, so the common
 * case still reads as the fixture it is.
 */
export function attemptName(base: string, testInfo: TestInfo): string {
  return testInfo.retry === 0 ? base : `${base} r${testInfo.retry}`
}

/**
 * Sign in through the real login form and wait for the dashboard. Pass
 * `clearCookies` when a test re-logs-in as another role within one test body
 * (the scoping suite), so the previous session does not linger.
 */
export async function loginAs(page: Page, email: string, opts: { clearCookies?: boolean } = {}) {
  if (opts.clearCookies) await page.context().clearCookies()

  if (email.endsWith('@mock.test')) {
    await page.goto('/api/dev/logout', { waitUntil: 'domcontentloaded' }).catch(() => null)
    if (opts.clearCookies) await page.context().clearCookies()

    // Sign in through the mock dev-login FORM in the browser - a native form POST,
    // so the session cookie is set + carried and the CSP allows it. A Node request
    // context or a fetch() both fail here (no cookie jar).
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.fill('#dev-email', email)
    await page.fill('#dev-password', 'cert-ed')
    await Promise.all([
      page.waitForURL('**/dashboard', { timeout: 15000 }),
      page.getByRole('button', { name: /sign in/i }).click(),
    ])
    return
  }

  async function openLoginPage() {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    if (!page.url().includes('/login')) {
      await page.goto('/api/dev/logout', { waitUntil: 'domcontentloaded' }).catch(() => null)
      if (opts.clearCookies) await page.context().clearCookies()
      await page.goto('/login', { waitUntil: 'domcontentloaded' })
    }
  }

  await openLoginPage()

  const emailInput = page.getByRole('textbox', { name: 'Email' })
  const passwordInput = page.getByRole('textbox', { name: 'Password' })
  await emailInput.waitFor({ state: 'visible', timeout: 15000 })
  await emailInput.fill(email)
  await passwordInput.fill('cert-ed')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/dashboard')
}

/**
 * Scope to ONE session's form on the attendance page.
 *
 * Since 0093 a class may hold SEVERAL recorded sessions on one day, and the page renders a
 * SessionTimesForm per recorded session PLUS a trailing blank "Record another session"
 * form. Every session control - summary, private note, Save session - therefore matches
 * more than once the moment a session exists, which is a strict-mode violation rather than
 * a flake. Index 0 is the first RECORDED session; the blank form is always last.
 */
export function sessionForm(page: Page, index = 0) {
  return page.locator('form').filter({ hasText: 'Save session' }).nth(index)
}

/**
 * Ensure the open attendance date has at least one recorded session, recording one if not.
 *
 * Since 0094 an attendance mark belongs to a session, so the roster - and its "Mark all
 * present" button - only renders once a session exists. A spec that marks attendance can
 * no longer assume an earlier spec left one behind, which is exactly the order-dependence
 * that makes a suite pass together and fail alone.
 */
export async function ensureRecordedSession(page: Page, start = '10:00', end = '11:00') {
  if ((await page.getByRole('button', { name: 'Mark all present' }).count()) > 0) return
  const blank = page.locator('form').filter({ hasText: 'Save session' }).last()
  await blank.locator('input[type="time"]').first().fill(start)
  await blank.locator('input[type="time"]').nth(1).fill(end)
  await submitAndReload(page, () => blank.getByRole('button', { name: 'Save session' }).click())
}
