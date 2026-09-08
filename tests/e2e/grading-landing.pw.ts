import { test, expect } from '@playwright/test'
import { loginAs } from './support'

/**
 * The grading landing had no E2E coverage while it rendered every class in the academy as a
 * card wall. It now shares the Classes list's loader - paged by student, with a name search
 * - so these pin the two things that rewrite could break: it still renders for both the
 * academy-wide and the scoped reader, and its search actually narrows.
 */

for (const who of ['admin@mock.test', 'tutor@mock.test']) {
  test(`grading landing renders for ${who}`, async ({ page }) => {
    await loginAs(page, who, { clearCookies: true })
    await page.goto('/grading', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Grading', level: 1 })).toBeVisible()
    // A class card links through to that class's grading tab - the picker's whole job.
    await expect(page.locator('a[href*="/grading"]').first()).toBeVisible()
  })
}

test('grading landing search narrows the roster', async ({ page }) => {
  await loginAs(page, 'admin@mock.test', { clearCookies: true })
  await page.goto('/grading', { waitUntil: 'domcontentloaded' })
  const before = await page.getByRole('link', { name: /Open grading/ }).count()
  expect(before).toBeGreaterThan(0)

  // A name that matches nobody must yield the FILTERED empty state, not the bare one.
  await page.goto('/grading?q=zzzznotarealstudent', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('No students match that search.')).toBeVisible()
})
