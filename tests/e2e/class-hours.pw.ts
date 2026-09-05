import { test, expect } from '@playwright/test'
import { loginAs, submitAndReload, SEED } from './support'

/**
 * E2E for the academy class-hours report (/admin/teaching-hours): hours TAUGHT, per
 * tutor/mentor, and hours RECEIVED, per student - both derived from recorded sessions.
 *
 * The unit tests in tests/unit/services/teaching-hours.test.ts already pin the arithmetic,
 * including the per-session credit rule. What they CANNOT check is the assumption the whole
 * student side rests on: that marking attendance in the classroom UI writes a row carrying
 * the `session_id` the report joins on. Only a real write -> real read proves that, so this
 * spec records a session, marks attendance, and reads the numbers back.
 *
 * Assertions are deliberately about the RELATIONSHIP between what was recorded and what is
 * reported, not absolute totals: the suite runs sequentially against one shared mock DB and
 * other specs also mark attendance on this class today, so an exact figure would be a
 * cross-spec coupling rather than a fact about this feature.
 */

const REPORT = '/admin/teaching-hours'

/** "1h 30m" / "45m" / "2h" -> minutes, so a rendered total can be compared numerically. */
function parseHours(text: string): number {
  const hours = /(\d+)h/.exec(text)
  const minutes = /(\d+)m/.exec(text)
  return (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0)
}

test('records a session and attendance, then reports the hours on both sides', async ({ page }) => {
  await loginAs(page, 'tutor@mock.test')
  await page.goto(`/classroom/${SEED.math}/attendance`)

  // A recorded window is what makes a session countable - a session with no actual_start
  // is excluded from the report entirely, so set both ends before marking anyone present.
  const times = page.locator('main input[type="time"]')
  await times.nth(0).fill('10:00')
  await times.nth(1).fill('11:30')
  await submitAndReload(page, () => page.getByRole('button', { name: 'Save session' }).first().click())
  await expect(page.getByText('1h 30m').first()).toBeVisible()

  // .first(): one roster per recorded session, and this spec bills the first one.
  await page.getByRole('button', { name: 'Mark all present' }).first().click()
  await submitAndReload(page, () => page.getByRole('button', { name: 'Save attendance' }).first().click())

  await loginAs(page, 'admin@mock.test', { clearCookies: true })
  await page.goto(REPORT)

  // Every section is present, and the class that was just taught appears in each.
  await expect(page.getByRole('heading', { name: 'Tutors & mentors' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'By class and tutor' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Students' })).toBeVisible()

  const tables = page.locator('main table')
  await expect(tables).toHaveCount(3)

  // The tutor who ran the session is credited at least the window that was recorded.
  const tutorRow = tables.nth(0).locator('tbody tr', { hasText: 'Tarun Tutor' })
  await expect(tutorRow).toHaveCount(1)
  expect(parseHours(await tutorRow.locator('td').last().innerText())).toBeGreaterThanOrEqual(90)

  // The student side is populated from the SAME sessions - this is the join the unit
  // tests cannot exercise. A student marked present is credited that day's window.
  const studentTable = tables.nth(2)
  await expect(studentTable.locator('tbody tr')).not.toHaveCount(0)
  const firstStudentHours = await studentTable.locator('tbody tr').first().locator('td').last().innerText()
  expect(parseHours(firstStudentHours)).toBeGreaterThanOrEqual(90)
})

test('a month with no recorded sessions reports empty rather than erroring', async ({ page }) => {
  await loginAs(page, 'admin@mock.test')
  // Far enough back that no seed or spec has written a session into it.
  await page.goto(`${REPORT}?month=2020-01`)

  await expect(page.getByText('No sessions recorded for January 2020')).toBeVisible()
  await expect(page.locator('main table')).toHaveCount(0)
})
