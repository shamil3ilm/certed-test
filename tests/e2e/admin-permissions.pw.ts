import { test, expect } from '@playwright/test'
import { SEED, loginAs } from './support'

// The per-user capability-override editor: an admin grants a capability the
// student's persona baseline doesn't include, and it persists.
test('ADMIN -- grants a per-user capability override and it persists', async ({ page }) => {
  await loginAs(page, 'admin@mock.test')
  await page.goto(`/admin/users/${SEED.sara}/permissions`)
  await expect(page.getByRole('heading', { name: /permissions/i })).toBeVisible()

  // "Grading queue" (viewGrading) isn't in the student baseline and needs no reason.
  const row = page.locator('li', { hasText: 'Grading queue' })
  await expect(row).toBeVisible()
  // Normalise to the persona default first so the test is idempotent across reruns
  // and Playwright retries (it grants an override further down).
  await row.getByRole('button', { name: /^Default/ }).click()
  await expect(row.getByText('Not in default')).toBeVisible()
  await row.getByRole('button', { name: 'Allow' }).click()
  await expect(row.getByText(/Granted/)).toBeVisible()

  // Survives a reload (written to capability_overrides, re-resolved on load).
  await page.reload()
  const rowAfter = page.locator('li', { hasText: 'Grading queue' })
  await expect(rowAfter.getByText(/Granted/)).toBeVisible()

  // The hard platform rule is locked, not editable.
  const hardRow = page.locator('li', { hasText: 'Admin tier' })
  // The chip specifically - the capability's own description also mentions "platform rule".
  await expect(hardRow.getByText('Locked - platform rule')).toBeVisible()
  await expect(hardRow.getByRole('button', { name: 'Allow' })).toHaveCount(0)
})
