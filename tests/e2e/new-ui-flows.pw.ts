import { test, expect } from '@playwright/test'
import { loginAs, submitAndReload, SEED } from './support'

/**
 * E2E for the UI added this cycle: the private session note (must NEVER reach the
 * student), multi-tutor subjects, and a sub_admin managing a mentor account.
 */

const MENTOR_ID = 'a0000000-0000-4000-8000-000000000005' // Maya Mentor (dedicated mentor)

const SHARED_SUMMARY = 'SHARED-SUMMARY-E2E'
const STAFF_NOTE = 'SECRET-STAFF-NOTE-E2E'
const SUMMARY_PLACEHOLDER = 'What did this session cover? Topics, homework, how it went...'
const STAFF_NOTE_PLACEHOLDER = 'For staff eyes only - concerns, follow-ups, context the student should not see.'

test('a tutor records a session summary + private note; the student sees the summary but NOT the private note', async ({
  page,
}) => {
  await loginAs(page, 'tutor@mock.test')
  await page.goto(`/classroom/${SEED.math}/attendance`)

  // Mark attendance so the student has a record for today (their attendance page only
  // lists dates they attended, which is where the shared summary surfaces).
  await page.getByRole('button', { name: 'Mark all present' }).click()
  await submitAndReload(page, () => page.getByRole('button', { name: 'Save attendance' }).click())

  // Record a shared summary + a staff-private note on the session.
  await page.getByPlaceholder(SUMMARY_PLACEHOLDER).fill(SHARED_SUMMARY)
  await page.getByPlaceholder(STAFF_NOTE_PLACEHOLDER).fill(STAFF_NOTE)
  await submitAndReload(page, () => page.getByRole('button', { name: 'Save session' }).click())

  // The private note round-trips for the tutor (read back via the manager path).
  await expect(page.getByPlaceholder(STAFF_NOTE_PLACEHOLDER)).toHaveValue(STAFF_NOTE)

  // Now the enrolled student: they see the shared summary, never the private note.
  await loginAs(page, 'student@mock.test', { clearCookies: true })
  await page.goto(`/classroom/${SEED.math}/attendance`)
  // Expand every session's "Summary & feedback" so any summary content is in view.
  const toggles = page.getByText('Summary & feedback')
  const count = await toggles.count()
  for (let i = 0; i < count; i++) await toggles.nth(i).click()
  await expect(page.getByText(SHARED_SUMMARY)).toBeVisible()
  // The staff note must not be anywhere in the student's page (not just hidden).
  await expect(page.getByText(STAFF_NOTE)).toHaveCount(0)
})

test('a subject can show and manage multiple tutors for the same student', async ({ page }) => {
  await loginAs(page, 'admin@mock.test')
  await page.goto(`/admin/users/${SEED.sara}`)

  // The seed gives Sara's Maths class two tutors - both must render on the subject.
  const subjects = page.getByRole('heading', { name: 'Subjects & tutors' }).locator('..')
  await expect(subjects.getByText('Tarun Tutor', { exact: false }).first()).toBeVisible()
  await expect(subjects.getByText('Tessa Tutor-Mentor', { exact: false }).first()).toBeVisible()

  // An "Add tutor…" picker is available per subject (multi-tutor add path).
  await expect(subjects.getByRole('button', { name: 'Add' }).first()).toBeVisible()
})

test('a sub_admin can open and manage a mentor account (revoke/restore)', async ({ page }) => {
  await loginAs(page, 'subadmin@mock.test')

  // Detail page: before this change a sub_admin was 404'd on a mentor; now it opens.
  // The teacher-roster panel only renders on a real mentor/tutor detail page, so its
  // heading is proof the page rendered (a 404 would not show it).
  await page.goto(`/admin/users/${MENTOR_ID}`)
  await expect(page.getByRole('heading', { name: 'Students & subjects' })).toBeVisible()

  // The users list offers the lifecycle control on the mentor row -> suspendable.
  await page.goto('/admin/users')
  const mayaRow = page.locator('li', { hasText: 'Maya Mentor' }).first()
  await expect(mayaRow.getByRole('button', { name: /revoke|restore/i })).toBeVisible()
})
