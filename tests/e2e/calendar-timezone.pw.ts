import { test, expect } from '@playwright/test'
import { loginAs } from './support'

/**
 * The calendar draws a class at the hour it is held in the VIEWER's own zone.
 *
 * The seeded Monday Maths class is 09:00-10:00 at the academy, which is 03:30 UTC. The calendar API
 * sends that instant correctly; the grid once drew every instant in UTC (a named timezone handed to
 * FullCalendar without a timezone plugin falls back to it), so a viewer in India saw their 09:00 class
 * at 3:30am. Each zone below must see the same instant as its own wall clock.
 */
const ZONES: Array<{ timezoneId: string; expected: string }> = [
  { timezoneId: 'Asia/Kolkata', expected: '9:00am - 10:00am' },
  { timezoneId: 'Asia/Dubai', expected: '7:30am - 8:30am' },
  { timezoneId: 'UTC', expected: '3:30am - 4:30am' },
]

for (const { timezoneId, expected } of ZONES) {
  test.describe(`viewer in ${timezoneId}`, () => {
    test.use({ timezoneId })

    test(`the Monday Maths class reads ${expected}`, async ({ page }) => {
      await loginAs(page, 'tutor@mock.test')
      await page.goto('/calendar', { waitUntil: 'networkidle' })
      await page.getByRole('button', { name: 'Agenda', exact: true }).click()

      const maths = page.locator('.fc-list-event').filter({ hasText: 'Mathematics - Room 1' })
      await expect(maths.first()).toBeVisible()
      await expect(maths.filter({ hasText: expected }).first()).toBeVisible()
    })
  })
}
