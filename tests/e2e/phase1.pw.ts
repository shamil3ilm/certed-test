import { test, expect, type Page } from '@playwright/test'

// Phase-1 feature journeys: topics + grading, attendance, report card, and the
// "Today" dashboard panels — the full server-action write paths in MOCK mode.

const SEED = {
  math: 'c0000000-0000-4000-8000-000000000001',
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

test('TEACHER — assignment with topic + max marks, then grade a submission', async ({ page }) => {
  await loginAs(page, 'teacher@mock.test')

  // Create an assignment carrying a topic + max marks
  await page.goto(`/classroom/${SEED.math}/classwork`)
  const af = page.locator('form:has-text("Create assignment")')
  await af.getByPlaceholder('e.g. Chapter 4 worksheet').fill('E2E Graded Quiz')
  await af.getByPlaceholder('Unit / chapter').fill('Trigonometry')
  await af.getByPlaceholder('e.g. 20').fill('25')
  await af.locator('input[type=datetime-local]').fill('2026-12-01T10:00')
  await af.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'E2E Graded Quiz' }).first()).toBeVisible()
  await expect(page.getByText('Trigonometry').first()).toBeVisible() // topic chip
  await expect(page.getByText('/ 25 marks').first()).toBeVisible() // max marks

  // Grade Sara's seeded submission on Problem set 3
  await page.goto(`/assignments/${SEED.asgMath}`)
  const grade = page.locator('form:has-text("Save mark")').first()
  await grade.locator('input[type=number]').fill('18')
  await grade.getByPlaceholder(/Well done/).fill('Neat working')
  await submitAndReload(page, () => grade.getByRole('button', { name: 'Save mark' }).click())
  // Score persisted → the mark input shows 18 after a fresh load
  await expect(page.locator('form:has-text("Save mark") input[type=number]').first()).toHaveValue('18')
})

test('STUDENT — sees the mark on Classwork', async ({ page }) => {
  await loginAs(page, 'student@mock.test')
  await page.goto(`/classroom/${SEED.math}/classwork`)
  await expect(page.getByText(/Marked: 18/).first()).toBeVisible()
})

test('TEACHER — marks attendance for the class', async ({ page }) => {
  await loginAs(page, 'teacher@mock.test')
  await page.goto(`/classroom/${SEED.math}/attendance`)
  await expect(page.getByRole('heading', { name: 'Mark attendance' })).toBeVisible()
  await page.getByRole('button', { name: 'Mark all present' }).click()
  await submitAndReload(page, () => page.getByRole('button', { name: 'Save attendance' }).click())
  await expect(page.getByRole('button', { name: 'Save attendance' })).toBeVisible() // roster still renders, no error
})

test('STUDENT — sees own attendance + downloads a report card PDF', async ({ page }) => {
  await loginAs(page, 'student@mock.test')
  await page.goto(`/classroom/${SEED.math}/attendance`)
  await expect(page.getByRole('heading', { name: 'My attendance' })).toBeVisible()

  const href = await page.getByRole('link', { name: 'Download report card' }).getAttribute('href')
  expect(href).toContain('/api/report-card/')
  // fetch inside the page so the browser's app.localhost host-mapping + cookies apply
  const result = await page.evaluate(async (u) => {
    const r = await fetch(u)
    return { status: r.status, ct: r.headers.get('content-type') ?? '' }
  }, href!)
  expect(result.status).toBe(200)
  expect(result.ct).toContain('application/pdf')
})

test('DASHBOARD — student "Due soon" + teacher "To review" panels render', async ({ page }) => {
  await loginAs(page, 'student@mock.test')
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Due soon' })).toBeVisible()

  await page.goto('/api/dev/logout')
  await loginAs(page, 'teacher@mock.test')
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'To review' })).toBeVisible()
})
