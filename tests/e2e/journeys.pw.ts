import { test, expect, type Page } from '@playwright/test'

// Full-browser end-to-end journeys per persona, exercising the `'use server'`
// FORM submissions that HTTP-level tests can't reach (create class, enrol, post
// announcement, issue receipt, add user, create assignment, comment, submit).
// Runs against the production build in MOCK mode (seed reset before the run).

const SEED = {
  math: 'c0000000-0000-4000-8000-000000000001',
  science: 'c0000000-0000-4000-8000-000000000002',
  asgMath: 'a5000000-0000-4000-8000-000000000001', // "Problem set 3", has Sara's seeded submission
}

// Click a server-action submit, wait for the POST to land, then reload. (In this
// mock/host setup the action's own RSC revalidation refetch fails, so the write
// succeeds but the streamed view stays stale — a fresh GET shows the result.)
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

test('ADMIN — create class → enrol → announce → issue receipt → add user', async ({ page }) => {
  await loginAs(page, 'admin@mock.test')

  // Create a class via the New-class form
  await page.goto('/classroom')
  await page.click('summary:has-text("New class")')
  await page.fill('input[name=name]', 'E2E Physics G11')
  await page.getByRole('button', { name: 'Create class' }).click()
  await page.waitForURL(/\/classroom\/[0-9a-f-]{36}/)
  const classId = page.url().split('/classroom/')[1].split(/[/?#]/)[0]
  await expect(page.getByRole('heading', { name: 'E2E Physics G11' })).toBeVisible()

  // Enrol a student on the People tab
  await page.goto(`/classroom/${classId}/people`)
  await page.locator('form:has-text("Enrol a student") select').selectOption({ label: 'Sara Student' })
  await page.getByRole('button', { name: 'Enrol' }).click()
  await expect(page.getByText('Sara Student').first()).toBeVisible()

  // Post an announcement to the class Stream
  await page.goto(`/classroom/${classId}`)
  const post = page.locator('form:has-text("Post an announcement")')
  await post.locator('input[name=title]').fill('Welcome to Physics')
  await post.locator('textarea[name=message]').fill('First class Monday.')
  await submitAndReload(page, () => post.getByRole('button', { name: 'Post', exact: true }).click())
  await expect(page.getByRole('heading', { name: 'Welcome to Physics' })).toBeVisible()

  // Issue a receipt (8h × ₹600 = ₹4,800) for Sara
  await page.goto('/admin/finance')
  const rec = page.locator('section:has-text("Issue fee receipt")').locator('form', {
    has: page.getByRole('button', { name: 'Issue', exact: true }),
  })
  await rec.locator('select').first().selectOption({ label: 'Sara Student' })
  await rec.getByPlaceholder('Subject').fill('Physics tuition')
  await rec.getByPlaceholder('Hours').fill('8')
  await rec.getByPlaceholder('Rate/hr').fill('600')
  await rec.getByRole('button', { name: 'Issue', exact: true }).click()
  await expect(page.getByText(/4,800/).first()).toBeVisible()
  await page.waitForLoadState('networkidle').catch(() => null) // let IssueForm's location.reload() settle

  // Add a new user
  await page.goto('/admin/users')
  const add = page.locator('form', { has: page.getByRole('button', { name: 'Add user' }) })
  await add.locator('input[name=email]').fill('e2e-newbie@mock.test')
  await add.locator('input[name=full_name]').fill('Eve Newbie')
  await add.locator('select[name=role]').selectOption('student')
  await submitAndReload(page, () => add.getByRole('button', { name: 'Add user' }).click())
  await expect(page.getByText('e2e-newbie@mock.test')).toBeVisible()
})

test('TEACHER — create assignment + comment on a student submission', async ({ page }) => {
  await loginAs(page, 'teacher@mock.test')

  // Create an assignment in the Math classwork tab
  await page.goto(`/classroom/${SEED.math}/classwork`)
  const af = page.locator('form:has-text("Create assignment")')
  await af.getByPlaceholder('e.g. Chapter 4 worksheet').fill('E2E Trigonometry HW')
  await af.locator('input[type=datetime-local]').fill('2026-12-01T10:00')
  await af.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'E2E Trigonometry HW' })).toBeVisible()

  // Comment on Sara's seeded submission via the review page
  await page.goto(`/assignments/${SEED.asgMath}`)
  const thread = page.locator('form', { has: page.getByRole('button', { name: 'Send' }) }).first()
  await thread.locator('textarea').fill('Great work, Sara!')
  await thread.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Great work, Sara!')).toBeVisible()
})

test('STUDENT — submit an assignment (Drive link)', async ({ page }) => {
  await loginAs(page, 'student@mock.test')

  // Submit to the Science assignment (Sara enrolled, not yet submitted)
  await page.goto(`/classroom/${SEED.science}/classwork`)
  await page.getByPlaceholder('Paste your Google Drive link…').first().fill('https://drive.google.com/file/e2e-sub')
  await submitAndReload(page, () => page.getByRole('button', { name: 'Submit link' }).first().click())
  await expect(page.getByText(/On time|Submitted late/).first()).toBeVisible()
})

test('MENTOR — sees only assigned mentees, teaches no classes', async ({ page }) => {
  await loginAs(page, 'mentor@mock.test')
  await page.goto('/students')
  await expect(page.getByText('Sara Student').first()).toBeVisible()
  await expect(page.getByText('Sam Student').first()).toBeVisible()
  await page.goto('/classroom')
  await expect(page.getByText('No classes assigned')).toBeVisible()
})

test('SCOPING — student is blocked from admin finance', async ({ page }) => {
  await loginAs(page, 'student@mock.test')
  await page.goto('/admin/finance')
  await expect(page.getByText('Issue fee receipt')).toHaveCount(0)
})

test('SCOPING — mentor cannot enter a mentee class (404)', async ({ page }) => {
  await loginAs(page, 'mentor@mock.test')
  await page.goto(`/classroom/${SEED.math}`)
  await expect(page.getByText('404')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Classwork' })).toHaveCount(0)
})
