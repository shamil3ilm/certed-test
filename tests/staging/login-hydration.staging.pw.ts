import { test, expect } from '@playwright/test'
import { emailFor, stagingPassword } from './support'

/**
 * Does the login form lose credentials entered BEFORE the React island hydrates?
 *
 * This is not a synthetic concern: a password manager or browser autofill writes both
 * fields the instant the markup exists, which is routinely before hydration on a cold
 * or throttled load. If the form submits React state rather than what is on screen, the
 * user sees a filled-in form rejected as "Wrong email or password."
 *
 * READ-ONLY: only sign-in attempts.
 */
test('LOGIN-EDGE: credentials entered before hydration are still submitted', async ({ page }) => {
  const refusals: string[] = []
  page.on('console', (m) => {
    if (/sign-in refused/i.test(m.text())) refusals.push(m.text())
  })

  // Throttle the network so the hydration window is wide enough to type into - the same
  // window a real user on a slow connection gets.
  const client = await page.context().newCDPSession(page)
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 300,
    downloadThroughput: (500 * 1024) / 8,
    uploadThroughput: (500 * 1024) / 8,
  })

  await page.context().clearCookies()
  await page.goto('/login', { waitUntil: 'domcontentloaded' })

  // Fill IMMEDIATELY - do not wait for networkidle. This is the autofill timing.
  const email = page.locator('input[type="email"]').first()
  const password = page.locator('input[type="password"]').first()
  await email.waitFor({ state: 'visible' })
  await email.fill(emailFor('student'))
  await password.fill(stagingPassword())

  // What the USER sees on screen at this point.
  expect(await email.inputValue()).toBe(emailFor('student'))

  await page.getByRole('button', { name: /sign in/i }).click()
  const reached = await page
    .waitForURL(/\/dashboard/, { timeout: 40_000 })
    .then(() => true)
    .catch(() => false)

  const banner = await page
    .locator('[role="alert"], .text-red-600')
    .first()
    .textContent()
    .catch(() => null)

  console.log(`pre-hydration submit reached dashboard=${reached}`)
  if (banner) console.log(`banner: ${banner.trim()}`)
  if (refusals.length) console.log(`provider said: ${refusals[0]}`)

  // The visible form was complete and correct, so it must be accepted.
  expect(
    reached,
    `A form the user can SEE is filled was rejected${banner ? ` with "${banner.trim()}"` : ''}` +
      (refusals.length ? ` - provider: ${refusals[0]}` : ''),
  ).toBe(true)
})
