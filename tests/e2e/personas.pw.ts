import { test, expect, type Page, type Locator } from '@playwright/test'

// Complete Tutor + Student persona journeys — every capability each role needs,
// end to end in MOCK mode. The Tutor tests run first and set up the state
// (resource, grade, attendance) the Student tests then read.

const SEED = {
  math: 'c0000000-0000-4000-8000-000000000001',
  science: 'c0000000-0000-4000-8000-000000000002',
  asgMath: 'a5000000-0000-4000-8000-000000000001', // "Problem set 3", Sara has a submission
}

async function submitAndReload(page: Page, click: () => Promise<void>) {
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST', { timeout: 15000 }).catch(() => null),
    click(),
  ])
  await page.waitForTimeout(300)
  await page.reload()
}

async function loginAs(page: Page, email: string) {
  await page.goto('/login')
  await page.fill('input[name=email]', email)
  await page.fill('input[name=password]', 'cert-ed')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/dashboard')
}

/** Comment threads are collapsed until they have comments — open before typing. */
async function ensureThreadOpen(scope: Locator) {
  const ta = scope.locator('textarea')
  const visible = (await ta.count()) > 0 && (await ta.first().isVisible().catch(() => false))
  if (!visible) await scope.getByRole('button', { name: /Add a comment/ }).first().click()
}

test('TUTOR — shares a meet link, a resource, and comments on the resource', async ({ page }) => {
  await loginAs(page, 'teacher@mock.test')

  // Share a meeting link on the class Stream
  await page.goto(`/classroom/${SEED.math}`)
  const meet = page.locator('form:has-text("Share a Meet Link")')
  await meet.getByPlaceholder('e.g. Maths Doubt Class').fill('E2E Doubt Session')
  await meet.getByPlaceholder('https://meet.google.com/...').fill('https://meet.google.com/e2e-abc')
  await submitAndReload(page, () => meet.getByRole('button', { name: 'Share link' }).click())
  await expect(page.getByText('E2E Doubt Session').first()).toBeVisible()

  // Share a resource in Classwork → Materials
  await page.goto(`/classroom/${SEED.math}/classwork`)
  const upload = page.locator('form:has-text("Share a resource")')
  await upload.getByPlaceholder('e.g. Chapter 4 Practice Questions').fill('E2E Worksheet PDF')
  await upload.getByPlaceholder('https://drive.google.com/...').fill('https://drive.google.com/file/e2e-res')
  await submitAndReload(page, () => upload.getByRole('button', { name: 'Share link' }).click())
  await expect(page.getByText('E2E Worksheet PDF').first()).toBeVisible()

  // Comment on that resource
  const resourceCard = page.locator('li:has-text("E2E Worksheet PDF")').first()
  await ensureThreadOpen(resourceCard)
  await resourceCard.locator('textarea').fill('Please review this before class')
  await resourceCard.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Please review this before class')).toBeVisible()
})

test('TUTOR — creates an assignment, grades homework + comments on it', async ({ page }) => {
  await loginAs(page, 'teacher@mock.test')

  // Create an assignment
  await page.goto(`/classroom/${SEED.math}/classwork`)
  const af = page.locator('form:has-text("Create assignment")')
  await af.getByPlaceholder('e.g. Chapter 4 worksheet').fill('E2E Persona HW')
  await af.locator('input[type=datetime-local]').fill('2026-12-05T10:00')
  await af.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'E2E Persona HW' }).first()).toBeVisible()

  // Grade a student's submission + leave feedback on it
  await page.goto(`/assignments/${SEED.asgMath}`)
  const grade = page.locator('form:has-text("Save mark")').first()
  await grade.locator('input[type=number]').fill('18')
  await submitAndReload(page, () => grade.getByRole('button', { name: 'Save mark' }).click())
  await expect(page.locator('form:has-text("Save mark") input[type=number]').first()).toHaveValue('18')

  const subThread = page.locator('form', { has: page.getByRole('button', { name: 'Send' }) }).first()
  await ensureThreadOpen(subThread)
  await subThread.locator('textarea').fill('Well done, Sara!')
  await subThread.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Well done, Sara!')).toBeVisible()
})

test('TUTOR — marks attendance and adds a reminder', async ({ page }) => {
  await loginAs(page, 'teacher@mock.test')

  await page.goto(`/classroom/${SEED.math}/attendance`)
  await page.getByRole('button', { name: 'Mark all present' }).click()
  await submitAndReload(page, () => page.getByRole('button', { name: 'Save attendance' }).click())
  await expect(page.getByRole('button', { name: 'Save attendance' })).toBeVisible()

  await page.goto('/dashboard')
  await page.getByRole('button', { name: '+ Add' }).click()
  await page.getByPlaceholder('Reminder title…').fill('Prep Chapter 5')
  await page.locator('input[name=remind_at]').fill('2026-12-10T09:00')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Prep Chapter 5')).toBeVisible()
})

test('STUDENT — full journey: timetable, submit homework, materials, grade, attendance, report card', async ({ page }) => {
  await loginAs(page, 'student@mock.test')

  // Dashboard "Due soon" + the timetable/calendar
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Due soon' })).toBeVisible()

  await page.goto('/calendar')
  await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible()
  await expect(page.locator('.fc').first()).toBeVisible() // the FullCalendar grid
  await expect(page.getByText('Manage timetable')).toHaveCount(0) // students can't manage it

  // Submit homework (Science)
  await page.goto(`/classroom/${SEED.science}/classwork`)
  await page.getByPlaceholder('Paste your Google Drive link…').first().fill('https://drive.google.com/file/e2e-persona')
  await submitAndReload(page, () => page.getByRole('button', { name: 'Submit link' }).first().click())
  await expect(page.getByText(/On time|Submitted late/).first()).toBeVisible()

  // See the tutor's material + the grade in Math
  await page.goto(`/classroom/${SEED.math}/classwork`)
  await expect(page.getByText('E2E Worksheet PDF').first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open Link' }).first()).toBeVisible()
  await expect(page.getByText(/Marked: 18/).first()).toBeVisible()

  // See attendance + download the report card
  await page.goto(`/classroom/${SEED.math}/attendance`)
  await expect(page.getByRole('heading', { name: 'My attendance' })).toBeVisible()
  const href = await page.getByRole('link', { name: 'Download report card' }).getAttribute('href')
  const result = await page.evaluate(async (u) => {
    const r = await fetch(u)
    return { status: r.status, ct: r.headers.get('content-type') ?? '' }
  }, href!)
  expect(result.status).toBe(200)
  expect(result.ct).toContain('application/pdf')
})
