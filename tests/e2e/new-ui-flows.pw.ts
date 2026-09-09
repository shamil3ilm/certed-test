import { test, expect } from '@playwright/test'
import { loginAs, submitAndReload, ensureRecordedSession, sessionForm, SEED } from './support'

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

  await ensureRecordedSession(page)
  // Every control below is scoped to the FIRST recorded session: the page also renders a
  // blank "Record another session" form, so an unscoped locator matches twice.
  const session = sessionForm(page)

  // Mark attendance so the student has a record for today (their attendance page only
  // lists dates they attended, which is where the shared summary surfaces).
  await page.getByRole('button', { name: 'Mark all present' }).first().click()
  await submitAndReload(page, () => page.getByRole('button', { name: 'Save attendance' }).first().click())

  // Record a shared summary + a staff-private note on the session.
  await session.getByPlaceholder(SUMMARY_PLACEHOLDER).fill(SHARED_SUMMARY)
  await session.getByPlaceholder(STAFF_NOTE_PLACEHOLDER).fill(STAFF_NOTE)
  await submitAndReload(page, () => session.getByRole('button', { name: 'Save session' }).click())

  // The private note round-trips for the tutor (read back via the manager path).
  await expect(session.getByPlaceholder(STAFF_NOTE_PLACEHOLDER)).toHaveValue(STAFF_NOTE)

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
  // visible: true - the assignable-staff <select> on each subject carries every tutor as an
  // <option> ("Tarun Tutor - Tutor"), so a bare text match can resolve to a hidden option in
  // some other subject's picker rather than the chip naming who teaches THIS one.
  await expect(subjects.getByText('Tarun Tutor', { exact: false }).filter({ visible: true }).first()).toBeVisible()
  await expect(
    subjects.getByText('Tessa Tutor-Mentor', { exact: false }).filter({ visible: true }).first(),
  ).toBeVisible()

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

test('revoke and restore both confirm first, and the modal names the account being changed', async ({ page }) => {
  await loginAs(page, 'subadmin@mock.test')
  await page.goto('/admin/users')
  // Target the CONTROL, not a row containing her name. `li` with hasText 'Maya Mentor'
  // also matches every student whose subtitle reads "mentor: Maya Mentor", so `.first()`
  // resolved to whichever of them the database happened to return first - it picked Maya
  // only by luck, and stopped the day the people list gained a deterministic sort. The
  // button's accessible name is unique by construction, which is the property the row
  // controls were given aria-labels for in the first place.
  const revoke = page.getByRole('button', { name: 'Revoke access for Maya Mentor (mentor@mock.test)' })
  await revoke.click()

  // The confirm modal covers the list, so it must name the account itself -
  // otherwise "they are signed out" points at nothing still on screen.
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Maya Mentor')
  await dialog.getByRole('button', { name: 'Revoke' }).click()

  // Restore confirms too. It used to submit on a single click, sitting next to the
  // irreversible Erase, and re-grants sign-in - so it asks like its siblings.
  const restore = page.getByRole('button', { name: 'Restore access for Maya Mentor (mentor@mock.test)' })
  await expect(restore).toBeVisible()
  await restore.click()
  await expect(dialog).toContainText('Maya Mentor')
  await dialog.getByRole('button', { name: 'Restore' }).click()

  await expect(page.getByRole('button', { name: 'Revoke access for Maya Mentor (mentor@mock.test)' })).toBeVisible()
})
