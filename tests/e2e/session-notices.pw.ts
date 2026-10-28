import { test, expect, type Page } from '@playwright/test'
import { loginAs, submitAndReload, SEED } from './support'

/**
 * E2E for what a recorded session tells people, and that a student's feedback belongs to the session
 * it was written on.
 *
 * Both halves were wrong until the walkthrough: a day can hold several sessions, but feedback was
 * written against the DATE, so one note landed on every session that day and the form always showed
 * the first session's; and the people whose hours a session is were told by three code paths that
 * each decided for themselves - which told the class tutor of an exam they were not in the room for.
 * The unit tests pin each rule; this drives the real forms and reads each person's real feed.
 *
 * Each test works on a date of its own: the mock database is shared by every spec in the run and many
 * treat "the first session on today's page" as theirs.
 *
 * Cast: Tarun teaches Maths, Sara is its student, Maya mentors Sara, Tessa teaches it too (and monitors exams).
 */

async function feedOf(page: Page, email: string): Promise<string> {
  await loginAs(page, email, { clearCookies: true })
  await page.goto('/notifications', { waitUntil: 'networkidle' })
  return page.locator('main').innerText()
}

/** Record one session through the blank form at the foot of the attendance page. */
async function recordSession(
  page: Page,
  opts: { start: string; end: string; summary?: string; kind?: 'regular' | 'exam'; monitor?: string },
) {
  // With sessions already on the day, the blank form is folded behind this disclosure.
  const another = page.locator('summary', { hasText: 'Record another session' })
  if ((await another.count()) > 0) await another.click()
  const form = page.locator('form').filter({ hasText: 'Save session' }).last()
  if (opts.kind) await form.getByLabel('Session type').selectOption(opts.kind)
  if (opts.monitor) await form.getByLabel('Monitored by').selectOption({ label: opts.monitor })
  const times = form.locator('input[type="time"]')
  await times.nth(0).fill(opts.start)
  await times.nth(1).fill(opts.end)
  if (opts.summary) await form.getByPlaceholder(/What did this session cover/).fill(opts.summary)
  await submitAndReload(page, () => form.getByRole('button', { name: 'Save session' }).click())
}

async function markEveryonePresent(page: Page, sessionIndex: number) {
  const card = page.locator('article').nth(sessionIndex)
  await card.getByRole('button', { name: 'Mark all present' }).click()
  await submitAndReload(page, () => card.getByRole('button', { name: /Save attendance/ }).click())
}

test("a student's feedback belongs to the session it was written on, and reaches tutors and mentors", async ({
  page,
}) => {
  const DAY = '2026-05-12'

  await loginAs(page, 'tutor@mock.test')
  await page.goto(`/classroom/${SEED.math}/attendance?date=${DAY}`, { waitUntil: 'networkidle' })
  await recordSession(page, { start: '10:00', end: '11:00', summary: 'Morning: fractions' })
  await markEveryonePresent(page, 0)
  await recordSession(page, { start: '16:00', end: '17:00', summary: 'Evening: decimals' })
  await markEveryonePresent(page, 1)

  // Sara leaves feedback on the EVENING session only.
  await loginAs(page, 'student@mock.test', { clearCookies: true })
  await page.goto(`/classroom/${SEED.math}/attendance`, { waitUntil: 'networkidle' })
  const row = (summary: string) => page.locator('li').filter({ hasText: summary })
  await row('Evening: decimals').locator('summary', { hasText: 'Summary & feedback' }).click()
  await row('Evening: decimals').getByLabel('Session feedback').fill('Evening feedback')
  await row('Evening: decimals').getByRole('button', { name: 'Save feedback' }).click()
  await expect(page.getByText('Feedback saved')).toBeVisible()

  // After a fresh read the morning's box is still empty and the evening's holds its own note.
  await page.reload({ waitUntil: 'networkidle' })
  await row('Morning: fractions').locator('summary', { hasText: 'Summary & feedback' }).click()
  await row('Evening: decimals').locator('summary', { hasText: 'Summary & feedback' }).click()
  await expect(row('Morning: fractions').getByLabel('Session feedback')).toHaveValue('')
  await expect(row('Evening: decimals').getByLabel('Session feedback')).toHaveValue('Evening feedback')

  // The tutor and the mentor are told, naming the day; the summary reached the mentor too, and its
  // author was told about neither.
  const dated = (title: string) => new RegExp(`${title}\\s+${DAY}`)
  const mentor = await feedOf(page, 'mentor@mock.test')
  expect(mentor).toMatch(dated('A class summary was posted'))
  expect(mentor).toMatch(dated('A student left feedback on a session'))
  const otherTutor = await feedOf(page, 'tutormentor@mock.test')
  expect(otherTutor).toMatch(dated('A student left feedback on a session'))
  const author = await feedOf(page, 'tutor@mock.test')
  expect(author).not.toMatch(dated('A class summary was posted'))
})

test('whoever a session’s hours belong to is told when they change, and nobody else', async ({ page }) => {
  const DAY = '2026-05-13'
  const dated = (title: string) => new RegExp(`${title}\\s+${DAY}`)

  // An admin records a class session for Tarun, then an exam that Tessa monitored.
  await loginAs(page, 'admin@mock.test')
  await page.goto(`/classroom/${SEED.math}/attendance?date=${DAY}`, { waitUntil: 'networkidle' })
  await recordSession(page, { start: '10:00', end: '11:00' })
  await recordSession(page, { start: '14:00', end: '15:00', kind: 'exam', monitor: 'Tessa Tutor-Mentor' })

  // Changing the class session's window (the record-session form's route) tells its tutor.
  await page.goto(`/classroom/${SEED.math}/attendance?date=${DAY}`, { waitUntil: 'networkidle' })
  const first = page.locator('article').nth(0)
  await first.locator('summary', { hasText: 'Times & notes' }).click()
  await first.locator('input[type="time"]').nth(1).fill('11:30')
  await submitAndReload(page, () => first.getByRole('button', { name: 'Save session' }).click())

  // Maya, a mentor, changing the exam's window (the narrower timings route) tells its MONITOR, Tessa - not
  // the tutor, and not Maya herself, who made the change.
  await loginAs(page, 'mentor@mock.test', { clearCookies: true })
  await page.goto(`/session-timings?student=${SEED.sara}&from=${DAY}&to=${DAY}`, { waitUntil: 'networkidle' })
  // The exam's own row (the table lists one row per session and student), then the editor inside it.
  const examRow = page.locator('tr', { hasText: DAY }).filter({ hasText: 'Exam' })
  const examEditor = examRow.locator('form').filter({ has: page.getByLabel('Session end time') })
  await examEditor.getByLabel('Session end time').fill('15:30')
  await submitAndReload(page, () => examEditor.getByRole('button', { name: 'Save' }).click())

  // Removing the exam tells the monitor it is gone.
  await loginAs(page, 'admin@mock.test', { clearCookies: true })
  await page.goto(`/classroom/${SEED.math}/attendance?date=${DAY}`, { waitUntil: 'networkidle' })
  await submitAndReload(page, async () => {
    await page.locator('article').nth(1).getByRole('button', { name: 'Remove session' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remove session', exact: true }).click()
  })

  const tutor = await feedOf(page, 'tutor@mock.test')
  expect(tutor, 'the class tutor hears their own session changed').toMatch(dated('A session of yours was changed'))
  // An exam someone else monitored is not their hours: not changed, not removed.
  expect(tutor).not.toContain('An exam you monitored was changed')
  expect(tutor).not.toMatch(dated('A session you worked was removed'))

  const monitor = await feedOf(page, 'tutormentor@mock.test')
  expect(monitor).toMatch(dated('You were recorded as monitoring an exam'))
  expect(monitor).toMatch(dated('An exam you monitored was changed'))
  expect(monitor).toMatch(dated('A session you worked was removed'))
})
