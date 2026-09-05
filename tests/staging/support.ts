import { expect, type Page } from '@playwright/test'

/**
 * Staging sign-in helpers.
 *
 * Credentials come from the ENVIRONMENT only - nothing secret is committed. The account
 * EMAILS are non-secret identifiers for the seeded staging personas, so they carry
 * defaults; the PASSWORD has none and the suite fails fast without it.
 *
 *   STAGING_PASSWORD=...  (required)
 *   STAGING_<PERSONA>_EMAIL=...  (optional override per persona)
 */

export type Persona = 'superadmin' | 'subadmin' | 'tutor' | 'mentor' | 'student'

export function emailFor(persona: Persona): string {
  return process.env[`STAGING_${persona.toUpperCase()}_EMAIL`] ?? `${persona}@certed.test`
}

export function stagingPassword(): string {
  const pw = process.env.STAGING_PASSWORD
  if (!pw) {
    throw new Error(
      'STAGING_PASSWORD is not set. Supply the staging account password via the environment, ' +
        'e.g. STAGING_PASSWORD=... npx playwright test --config=playwright.staging.config.ts',
    )
  }
  return pw
}

/**
 * Sign in through the real login form and land on the dashboard.
 *
 * Selectors are resolved defensively (label -> input type) because a deployed target is
 * the one place we cannot fix a markup drift by editing the app: a brittle locator would
 * report "staging is broken" when only the query was wrong.
 */
export async function loginAs(page: Page, persona: Persona): Promise<void> {
  await page.context().clearCookies()
  await page.goto('/login', { waitUntil: 'domcontentloaded' })

  const email = page.getByLabel(/email/i).or(page.locator('input[type="email"]')).first()
  const password = page
    .getByLabel(/password/i)
    .or(page.locator('input[type="password"]'))
    .first()
  await email.waitFor({ state: 'visible' })
  await email.fill(emailFor(persona))
  await password.fill(stagingPassword())

  await page.getByRole('button', { name: /sign in/i }).click()
  // A failed sign-in keeps us on /login with an error banner - surface that as the
  // failure rather than a bare navigation timeout.
  await page.waitForURL(/\/dashboard/, { timeout: 45_000 }).catch(async () => {
    const banner = await page
      .locator('[role="alert"], .text-red-600, [data-error]')
      .first()
      .textContent()
      .catch(() => null)
    throw new Error(
      `Sign-in as ${emailFor(persona)} did not reach /dashboard (still at ${page.url()}).` +
        (banner ? ` Page message: ${banner.trim()}` : ''),
    )
  })
}

/**
 * Wait for the streamed portal to finish painting: the shell renders first with skeleton
 * placeholders, so anything that reads or screenshots the page immediately captures grey
 * blocks instead of content. Best-effort - never fails a test on its own.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => null)
  await page
    .locator('.animate-pulse, [aria-busy="true"], text=/^Loading/')
    .first()
    .waitFor({ state: 'detached', timeout: 10_000 })
    .catch(() => null)
}

/** The page rendered rather than erroring: no Next error boundary, no 404/500 copy. */
export async function expectHealthyPage(page: Page): Promise<void> {
  const body = (await page.locator('body').innerText()).toLowerCase()
  expect(body).not.toContain('application error')
  expect(body).not.toContain('internal server error')
  expect(body).not.toContain('this page could not be found')
  expect(body.length, 'page rendered no content').toBeGreaterThan(50)
}

/**
 * Visit a route and report how the app answered, without asserting - lets a journey
 * record "reachable" vs "redirected away" for permission boundaries.
 */
export async function visit(page: Page, path: string): Promise<{ url: string; denied: boolean }> {
  await page.goto(path, { waitUntil: 'domcontentloaded' }).catch(() => null)
  // The portal STREAMS: the shell (header/nav) paints first with a "Loading" content
  // region, and an access guard redirects only once the server segment resolves. Reading
  // the URL at domcontentloaded therefore reports "reachable" for a page that is about to
  // bounce - let the app settle before judging.
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => null)
  await page
    .locator('text=/^Loading/')
    .first()
    .waitFor({ state: 'detached', timeout: 10_000 })
    .catch(() => null)
  const url = page.url()
  const body = (
    await page
      .locator('body')
      .innerText()
      .catch(() => '')
  ).toLowerCase()
  const denied =
    !url.includes(path.split('?')[0]) ||
    body.includes('not authorised') ||
    body.includes('not authorized') ||
    body.includes('access denied') ||
    body.includes('this page could not be found')
  return { url, denied }
}
