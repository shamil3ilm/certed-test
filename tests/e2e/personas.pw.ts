import { test, expect, type Locator, type Page } from '@playwright/test'
import { SEED, attemptName, loginAs, submitAndReload, ensureRecordedSession } from './support'

// Complete Tutor + Student persona journeys -- every capability each role needs,
// end to end in MOCK mode. The Tutor tests run first and set up the state
// (resource, grade, attendance) the Student tests then read.

/** Comment threads are collapsed until they have comments -- open before typing. */
async function ensureThreadOpen(scope: Locator) {
  const ta = scope.locator('textarea')
  const visible =
    (await ta.count()) > 0 &&
    (await ta
      .first()
      .isVisible()
      .catch(() => false))
  if (!visible)
    await scope
      .getByRole('button', { name: /Add a comment/ })
      .first()
      .click()
}

async function createTutorResource(page: Page, title = 'E2E Worksheet PDF') {
  await loginAs(page, 'tutor@mock.test', { clearCookies: true })
  await page.goto(`/classroom/${SEED.math}/classwork`)
  const upload = page.locator('form:has-text("Upload a document")')
  await upload.getByPlaceholder('e.g. Term 1 Question Paper').fill(title)
  // Custodial file upload is the primary path (the Drive link is a collapsed fallback).
  await upload.locator('input[type=file]').setInputFiles({
    name: 'e2e-res.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]),
  })
  await upload.getByRole('button', { name: 'Upload document' }).click()
  await expect(page.getByText(title).first()).toBeVisible()
}

// The seeded Math assignment (Problem set 3) caps at 10 marks, so grade within it.
async function gradeSeededMathSubmission(page: Page, score = '9') {
  await loginAs(page, 'tutor@mock.test', { clearCookies: true })
  await page.goto(`/assignments/${SEED.asgMath}`)
  const grade = page.locator('form:has-text("Save mark")').first()
  await grade.locator('input[type=number]').fill(score)
  await submitAndReload(page, () => grade.getByRole('button', { name: 'Save mark' }).click())
  await expect(page.locator('form:has-text("Save mark") input[type=number]').first()).toHaveValue(score)
}

test('TUTOR -- shares a meet link, a resource, and comments on the resource', async ({ page }, testInfo) => {
  const meeting = attemptName('E2E Doubt Session', testInfo)
  await loginAs(page, 'tutor@mock.test')

  // Post a meeting to the class Stream: a stream post carrying a join link IS a meeting
  await page.goto(`/classroom/${SEED.math}`)
  const composer = page.locator('form:has-text("Post to the class")')
  await composer.getByPlaceholder('Title').fill(meeting)
  await composer.getByPlaceholder('Share something with your class...').fill('Join for doubt clearing')
  await composer.getByText('Add a meeting link').click()
  await composer.getByPlaceholder('https://meet.google.com/...').fill('https://meet.google.com/e2e-abc')
  await submitAndReload(page, () => composer.getByRole('button', { name: 'Post' }).click())
  await expect(page.getByText(meeting).first()).toBeVisible()

  // Share a document in the Classwork -> Documents section
  await page.goto(`/classroom/${SEED.math}/classwork`)
  const upload = page.locator('form:has-text("Upload a document")')
  await upload.getByPlaceholder('e.g. Term 1 Question Paper').fill('E2E Worksheet PDF')
  await upload.locator('input[type=file]').setInputFiles({
    name: 'e2e-res.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]),
  })
  await upload.getByRole('button', { name: 'Upload document' }).click()
  await expect(page.getByText('E2E Worksheet PDF').first()).toBeVisible()

  // Comment on that resource
  const resourceCard = page.locator('li:has-text("E2E Worksheet PDF")').first()
  await ensureThreadOpen(resourceCard)
  await resourceCard.locator('textarea').fill('Please review this before class')
  await resourceCard.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Please review this before class')).toBeVisible()
})

test('TUTOR -- creates an assignment, grades homework + comments on it', async ({ page }) => {
  await loginAs(page, 'tutor@mock.test')

  // Create an assignment
  await page.goto(`/classroom/${SEED.math}/classwork`)
  const af = page.locator('form:has-text("Create assignment")')
  await af.getByPlaceholder('e.g. Chapter 4 worksheet').fill('E2E Persona HW')
  await af.locator('input[type=datetime-local]').fill('2026-12-05T10:00')
  await af.getByPlaceholder('e.g. 20').fill('20') // max marks is required
  await af.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'E2E Persona HW' }).first()).toBeVisible()

  // Grade a student's submission + leave feedback on it (Problem set 3 caps at 10).
  await page.goto(`/assignments/${SEED.asgMath}`)
  const grade = page.locator('form:has-text("Save mark")').first()
  await grade.locator('input[type=number]').fill('9')
  await submitAndReload(page, () => grade.getByRole('button', { name: 'Save mark' }).click())
  await expect(page.locator('form:has-text("Save mark") input[type=number]').first()).toHaveValue('9')

  const subThread = page.locator('form', { has: page.getByRole('button', { name: 'Send' }) }).first()
  await ensureThreadOpen(subThread)
  await subThread.locator('textarea').fill('Well done, Sara!')
  await subThread.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Well done, Sara!')).toBeVisible()
})

test('TUTOR -- marks attendance and adds a reminder', async ({ page }, testInfo) => {
  const reminder = attemptName('Prep Chapter 5', testInfo)
  await loginAs(page, 'tutor@mock.test')

  await page.goto(`/classroom/${SEED.math}/attendance`)
  await ensureRecordedSession(page)
  // .first(): one roster renders per recorded session since 0093/0094.
  await page.getByRole('button', { name: 'Mark all present' }).first().click()
  await submitAndReload(page, () => page.getByRole('button', { name: 'Save attendance' }).first().click())
  await expect(page.getByRole('button', { name: 'Save attendance' }).first()).toBeVisible()

  await page.goto('/dashboard')
  await page.getByRole('button', { name: '+ Add' }).click()
  await page.getByPlaceholder('Reminder title...').fill(reminder)
  await page.locator('input[name=remind_at]').fill('2026-12-10T09:00')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(reminder)).toBeVisible()
})

test('SUB ADMIN -- lands on a real dashboard and can reach settings (no blank lock-out)', async ({ page }) => {
  await loginAs(page, 'subadmin@mock.test')

  // A sub_admin lands on a real, users-focused dashboard (not a blank redirect).
  await expect(page.getByRole('heading', { name: 'User management' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Manage users' })).toBeVisible()

  // Settings is reachable for a sub_admin.
  await page.goto('/settings')
  await expect(page).toHaveURL(/\/settings/)
  await expect(page.getByRole('button', { name: 'Save profile' })).toBeVisible()

  // The Users hub (the one thing that always worked) still works.
  await page.goto('/admin/users')
  await expect(page).toHaveURL(/\/admin\/users/)
})

test('STUDENT -- full journey: timetable, submit homework, materials, grade, attendance, report card', async ({
  page,
}) => {
  // This test prepares the tutor-created state it reads later, so it remains
  // independent of the earlier tutor tests in this file.
  await createTutorResource(page)
  await gradeSeededMathSubmission(page)
  await page.goto('/api/dev/logout').catch(() => null)
  await loginAs(page, 'student@mock.test', { clearCookies: true })

  // Dashboard "Due work" lead widget + the timetable/calendar
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Due work' })).toBeVisible()

  await page.goto('/calendar')
  await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible()
  await expect(page.locator('.fc').first()).toBeVisible() // the FullCalendar grid
  await expect(page.getByText('Manage timetable')).toHaveCount(0) // students can't manage it

  // Submit homework (Science) via a custodial file upload - the primary path now.
  await page.goto(`/classroom/${SEED.science}/classwork`)
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'e2e-persona.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]),
    })
  await expect(page.getByText(/On time|Submitted late/).first()).toBeVisible()

  // See the tutor's material + the grade in Math
  await page.goto(`/classroom/${SEED.math}/classwork`)
  await expect(page.getByText('E2E Worksheet PDF').first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open' }).first()).toBeVisible()
  await expect(page.getByText(/Marked: 9/).first()).toBeVisible()

  // See attendance
  await page.goto(`/classroom/${SEED.math}/attendance`)
  await expect(page.getByRole('heading', { name: 'My attendance' })).toBeVisible()

  // Download the report card; its link is on the Classwork page
  await page.goto(`/classroom/${SEED.math}/classwork`)
  const href = await page.getByRole('link', { name: 'Download report card' }).getAttribute('href')
  const result = await page.evaluate(async (u) => {
    const r = await fetch(u)
    return { status: r.status, ct: r.headers.get('content-type') ?? '' }
  }, href!)
  expect(result.status).toBe(200)
  expect(result.ct).toContain('application/pdf')
})
