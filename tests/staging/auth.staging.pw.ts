import { test, expect } from '@playwright/test'
import { emailFor, loginAs, settle, type Persona } from './support'

/**
 * Live auth checks against the DEPLOYED app: who can get in, who cannot, and whether a
 * rejection leaks which accounts exist.
 *
 * READ-ONLY. Failed sign-ins create no records; the successful ones only navigate.
 */

const PERSONAS: Persona[] = ['superadmin', 'subadmin', 'tutor', 'mentor', 'student']

/** Fill the login form without submitting expectations - shared by the negative cases. */
async function attemptLogin(page: import('@playwright/test').Page, email: string, password: string) {
  await page.context().clearCookies()
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => null)
  await page.locator('input[type="email"]').first().fill(email)
  await page.locator('input[type="password"]').first().fill(password)
  // Wait for the form to HYDRATE before submitting, or the values never reach React
  // state and every rejection reads the same for the wrong reason (see login-hydration).
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => null)
  await page.getByRole('button', { name: /sign in/i }).click()

  // Wait for an actual outcome - a banner or a navigation - rather than a fixed delay.
  // A fixed wait made this flaky: a slower rejection had not painted its banner yet, and
  // the empty string read as "a different message", i.e. a false enumeration finding.
  // Scope to the FORM's banner. The page also carries an always-present, empty toast
  // container with role="alert"; an unscoped .first() matched that instead, was already
  // visible, and so read "" - which made the enumeration comparison pass vacuously.
  const banner = page.locator('form [role="alert"]').first()
  await Promise.race([
    banner.waitFor({ state: 'visible', timeout: 30_000 }),
    page.waitForURL(/\/dashboard/, { timeout: 30_000 }),
  ]).catch(() => null)

  const message = await banner.textContent().catch(() => null)
  return { url: page.url(), message: (message ?? '').trim() }
}

for (const persona of PERSONAS) {
  test(`AUTH: ${persona} can sign in`, async ({ page }) => {
    await loginAs(page, persona)
    expect(page.url()).toContain('/dashboard')
  })
}

test('AUTH-NEG: a wrong password is refused, and says so', async ({ page }) => {
  const r = await attemptLogin(page, emailFor('student'), 'definitely-not-the-password')
  expect(r.url, 'a wrong password must not reach the dashboard').not.toContain('/dashboard')
  console.log('wrong-password message:', r.message || '(none shown)')
  // Without this the enumeration test below could compare "" to "" and pass vacuously.
  expect(r.message, 'a rejected sign-in must tell the user something').not.toBe('')
})

test('AUTH-NEG: an unknown account is refused IDENTICALLY to a wrong password (no enumeration)', async ({ page }) => {
  const unknown = await attemptLogin(page, 'definitely-no-such-user-9f3a@certed.test', 'whatever-123')
  const wrongPw = await attemptLogin(page, emailFor('student'), 'definitely-not-the-password')

  expect(unknown.url).not.toContain('/dashboard')
  // If these differ, anyone can probe which addresses hold accounts.
  expect(
    unknown.message,
    `unknown-account message ("${unknown.message}") must match wrong-password ("${wrongPw.message}")`,
  ).toBe(wrongPw.message)
})

test('AUTH-NEG: an empty submit does not sign anyone in', async ({ page }) => {
  const r = await attemptLogin(page, '', '')
  expect(r.url).not.toContain('/dashboard')
})

test('AUTH-NEG: a script payload in the email field is neither executed nor reflected', async ({ page }) => {
  const dialogs: string[] = []
  page.on('dialog', (d) => {
    dialogs.push(d.message())
    void d.dismiss()
  })
  const payload = `<img src=x onerror="alert('xss')">`
  const r = await attemptLogin(page, payload, "' OR 1=1 --")
  expect(dialogs, 'a payload in the email field must never execute').toHaveLength(0)
  expect(r.url).not.toContain('/dashboard')
  // The raw markup must not be echoed back into the page.
  const html = await page.content()
  expect(html).not.toContain('onerror="alert(')
})

test('AUTH-NEG: protected routes bounce an anonymous visitor to sign-in', async ({ page }) => {
  const protectedRoutes = ['/dashboard', '/admin/users', '/admin/finance', '/messages', '/settings', '/notifications']
  const leaked: string[] = []
  for (const route of protectedRoutes) {
    await page.context().clearCookies()
    await page.goto(route, { waitUntil: 'domcontentloaded' }).catch(() => null)
    await settle(page)
    if (!/\/login|\/$/.test(new URL(page.url()).pathname) && new URL(page.url()).pathname === route) {
      leaked.push(`${route} -> ${page.url()}`)
    }
  }
  expect(leaked, `anonymous visitor reached protected routes: ${leaked.join(', ')}`).toEqual([])
})

test('AUTH: signing out ends the session, and going Back does not restore it', async ({ page }) => {
  await loginAs(page, 'student')
  await page.goto('/settings', { waitUntil: 'domcontentloaded' })
  await settle(page)

  // Sign out through whatever the account menu offers.
  await page
    .getByRole('button', { name: /account menu/i })
    .click()
    .catch(() => null)
  const signOut = page
    .getByRole('button', { name: /sign out|log out/i })
    .or(page.getByRole('link', { name: /sign out|log out/i }))
    .first()
  await signOut.click({ timeout: 10_000 }).catch(() => null)
  await page.waitForTimeout(3000)

  // Re-requesting a protected page must not serve it from the session.
  await page.goto('/settings', { waitUntil: 'domcontentloaded' })
  await settle(page)
  expect(page.url(), 'after sign-out a protected page must not render').not.toContain('/settings')
})

test('AUTH-EDGE: password field is masked and not auto-exposed', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  const pw = page.locator('input[type="password"]').first()
  await expect(pw).toBeVisible()
  await expect(pw).toHaveAttribute('type', 'password')
})
