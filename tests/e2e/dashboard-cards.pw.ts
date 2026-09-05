import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './support'

async function expectUrlContains(page: Page, fragment: string) {
  await expect.poll(() => page.url()).toContain(fragment)
}

test('ADMIN dashboard cards and CTAs are interactive', async ({ page }) => {
  await loginAs(page, 'admin@mock.test')
  await page.goto('/dashboard')

  // The People stat cards are modal buttons labelled by the stat (the redesign
  // replaced the old standalone "View details" CTA). Open the Students card by
  // role/label - robust to affordance-copy changes, like the Net card below.
  const studentsCard = page.getByRole('button', { name: /^Students/i })
  await expect(studentsCard.first()).toBeVisible()

  await studentsCard.first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  const studentRow = page.getByRole('link', { name: /Sara Student/i }).first()
  if (await studentRow.count()) {
    await studentRow.click()
    await expectUrlContains(page, '/students/')
  } else {
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }

  await page.goto('/dashboard')
  await page
    .getByRole('link', { name: /calendar/i })
    .first()
    .click()
  await expectUrlContains(page, '/calendar')

  await page.goto('/dashboard')
  await page.getByRole('button', { name: /\bNet\b/i }).click() // finance card headline is Net (revenue - payouts)
  await expect(page.getByRole('dialog')).toBeVisible()
  const financeRow = page.getByRole('link', { name: /R-/i }).first()
  if (await financeRow.count()) {
    await financeRow.click()
    await expectUrlContains(page, '/admin/finance')
  }
})

test('SUB ADMIN dashboard cards and CTA are interactive', async ({ page }) => {
  await loginAs(page, 'subadmin@mock.test')
  await page.goto('/dashboard')

  await expect(page.getByRole('heading', { name: 'User management' })).toBeVisible()
  // Open a People stat card by role/label rather than the "View details" copy.
  await page
    .getByRole('button', { name: /^Students/i })
    .first()
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('link', { name: /Manage users|View users/i }).click()
  await expectUrlContains(page, '/admin/users')
})

test('TUTOR dashboard cards and CTAs are interactive', async ({ page }) => {
  await loginAs(page, 'tutor@mock.test')
  await page.goto('/dashboard')

  await expect(page.getByRole('heading', { name: 'Upcoming classes' })).toBeVisible()

  // "Review all" links to the class list; grading lives in a per-class
  // Classroom -> Grading tab.
  const reviewAll = page.getByRole('link', { name: /Review all/i })
  if (await reviewAll.count()) {
    await reviewAll.first().click()
    await expectUrlContains(page, '/classroom')
  }

  await page.goto('/dashboard')
  const openClasses = page.getByRole('link', { name: /Open classes/i })
  if (await openClasses.count()) {
    await openClasses.first().click()
    await expectUrlContains(page, '/classroom')
  }
})

test('MENTOR dashboard cards and CTAs are interactive', async ({ page }) => {
  await loginAs(page, 'mentor@mock.test')
  await page.goto('/dashboard')

  await expect(page.getByRole('heading', { name: 'Mentee roster' })).toBeVisible()
  await page
    .getByRole('link', { name: /Sara Student/i })
    .first()
    .click()
  await expectUrlContains(page, '/students/')
})

test('MENTOR+TUTOR combined dashboard labels both scopes and drops the duplicate chart', async ({ page }) => {
  // Tessa (tutormentor@mock.test) both mentors Sam and teaches a class, so her
  // dashboard stacks the pastoral and teaching scopes. Each scope must be labelled
  // so the two attendance figures / work lists don't read as repetition, and the
  // teaching chart panel is dropped in this combined view to keep the page short.
  await loginAs(page, 'tutormentor@mock.test')
  await page.goto('/dashboard')

  await expect(page.getByRole('heading', { name: 'Your mentees' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your classes' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Mentee roster' })).toBeVisible()
  // Teaching (class-scope) summary is present under "Your classes"...
  await expect(page.getByText('Teaching hours')).toBeVisible()
  // ...but the chart panel ("Insights") is suppressed in the combined view.
  await expect(page.getByRole('heading', { name: 'Insights' })).toHaveCount(0)
})

test('STUDENT dashboard cards and CTAs are interactive', async ({ page }) => {
  await loginAs(page, 'student@mock.test')
  await page.goto('/dashboard')

  await expect(page.getByRole('heading', { name: 'Due work' })).toBeVisible()

  const feedback = page.getByRole('link', { name: /View feedback/i })
  if (await feedback.count()) {
    await feedback.first().click()
    await expect.poll(() => page.url()).toMatch(/\/classroom\/.+\/classwork/)
  }

  await page.goto('/dashboard')
  const latestAnnouncement = page.getByRole('link', { name: /Open class stream/i })
  if (await latestAnnouncement.count()) {
    await latestAnnouncement.first().click()
    await expect.poll(() => page.url()).toMatch(/\/classroom\/.+/)
  }

  await page.goto('/dashboard')
  // The Attendance KPI tile deep-links to the class's Attendance tab (or the
  // class list when the student has more than one class).
  await page
    .getByRole('link', { name: /^Attendance/i })
    .first()
    .click()
  await expectUrlContains(page, '/classroom')
})

test('Dashboard reminder controls are interactive', async ({ page }) => {
  await loginAs(page, 'student@mock.test')
  await page.goto('/dashboard')
  const reminderTitle = `Dashboard reminder ${Date.now()}`
  const editedReminderTitle = `${reminderTitle} edited`
  const deleteReminderTitle = `${reminderTitle} delete`

  await page.getByRole('button', { name: '+ Add' }).click()
  const reminderForm = page.locator('#reminder-add-form')
  await expect(reminderForm).toBeVisible()
  await reminderForm.getByRole('textbox', { name: 'Title' }).fill(reminderTitle)
  await reminderForm.locator('input[name=remind_at]').fill('2026-08-01T09:00')
  await reminderForm.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('paragraph').filter({ hasText: reminderTitle }).first()).toBeVisible()

  const createdReminderRow = page.locator('li').filter({ hasText: reminderTitle }).first()
  await createdReminderRow.getByRole('button', { name: 'Edit reminder' }).click()
  await expect(reminderForm).toBeVisible()
  await reminderForm.getByRole('textbox', { name: 'Title' }).fill(editedReminderTitle)
  await reminderForm.getByRole('button', { name: 'Update' }).click()
  await expect(page.getByRole('paragraph').filter({ hasText: editedReminderTitle }).first()).toBeVisible()

  const editedReminderRow = page.locator('li').filter({ hasText: editedReminderTitle }).first()
  await editedReminderRow.getByRole('button', { name: 'Mark reminder done' }).click()
  await expect(page.getByText(/past reminder/i)).toBeVisible()

  await page.getByRole('button', { name: '+ Add' }).click()
  await expect(reminderForm).toBeVisible()
  await reminderForm.getByRole('textbox', { name: 'Title' }).fill(deleteReminderTitle)
  await reminderForm.locator('input[name=remind_at]').fill('2026-08-02T09:00')
  await reminderForm.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('paragraph').filter({ hasText: deleteReminderTitle }).first()).toBeVisible()
  const deleteReminderRow = page.locator('li').filter({ hasText: deleteReminderTitle }).first()
  await deleteReminderRow.getByRole('button', { name: 'Delete reminder' }).click()
  // Deleting a reminder is a hard delete with no undo, so it now goes through the shared
  // confirm modal - the same one the meeting and timetable deletes use.
  const confirmDialog = page.getByRole('dialog')
  await expect(confirmDialog).toBeVisible()
  await confirmDialog.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('paragraph').filter({ hasText: deleteReminderTitle })).toHaveCount(0)
})
