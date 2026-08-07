import { test, expect } from '@playwright/test'

/**
 * NEGATIVE auth: the login form must reject bad credentials with a visible error
 * and keep the user on /login (never leak them onto a portal page). Complements
 * support.ts's loginAs happy path. Mock mode stores plaintext demo passwords, so
 * a wrong password is a genuine rejection, not a no-op.
 */

async function attemptLogin(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.locator('input[name=email]').fill(email)
  await page.locator('input[name=password]').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('negative -- unknown email cannot sign in (error shown, stays on /login)', async ({ page }) => {
  await attemptLogin(page, 'nobody@mock.test', 'cert-ed')
  await expect(page.getByRole('alert').or(page.locator('[role=alert]')).first()).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})

test('negative -- correct email but wrong password is rejected', async ({ page }) => {
  await attemptLogin(page, 'student@mock.test', 'not-the-password')
  await expect(page.getByRole('alert').or(page.locator('[role=alert]')).first()).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})

test('negative -- an unauthenticated visitor is redirected away from a portal page', async ({ page }) => {
  // No login. A guarded page must not render for an anonymous visitor.
  await page.context().clearCookies()
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 })
  await expect(page, 'anonymous /dashboard must land on /login').toHaveURL(/\/login/)
})
