import { test, expect } from '@playwright/test'
import { SEED, loginAs } from './support'

/**
 * NEGATIVE form-validation + forbidden-UI: bad input is rejected inline, and a
 * persona never even SEES the controls for actions its capabilities forbid (the
 * UI complement to the server-side access matrix - a control that's hidden can't
 * be the only guard, but its absence is the intended UX).
 */

test('negative form -- change-password flags a mismatch inline before any submit', async ({ page }) => {
  await loginAs(page, 'student@mock.test')
  await page.goto('/settings', { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.locator('input[name=password]').fill('a-new-password')
  await page.locator('input[name=confirm]').fill('a-different-password')
  await expect(page.getByText('Passwords do not match.')).toBeVisible()
})

test('negative ui -- a student sees no content-management controls on their own class', async ({ page }) => {
  await loginAs(page, 'student@mock.test')
  // The student IS enrolled in the math class, so it opens - but a student manages
  // nothing: no stream composer, no assignment/document creation.
  await page.goto(`/classroom/${SEED.math}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await expect(page.locator('form:has-text("Post to the class")')).toHaveCount(0)
  await page.goto(`/classroom/${SEED.math}/classwork`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await expect(page.locator('form:has-text("Create assignment")')).toHaveCount(0)
  await expect(page.locator('form:has-text("Upload a document")')).toHaveCount(0)
})

test('negative ui -- a student nav exposes no admin / oversight destinations', async ({ page }) => {
  await loginAs(page, 'student@mock.test')
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 })
  for (const label of ['Users', 'Finance', 'History', 'Access management', 'Mentees', 'Mentoring']) {
    await expect(
      page.getByRole('link', { name: label, exact: true }),
      `student must not see a "${label}" link`,
    ).toHaveCount(0)
  }
})
