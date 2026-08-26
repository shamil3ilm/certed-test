import { test, expect, type Page } from '@playwright/test'
import { SEED, loginAs as loginFresh } from './support'

// Access-control and scoping boundaries per persona: page redirects/404s, API
// role gates, and API class-scope gates (admin-any / tutor-own / global=admin).
// Mock mode bypasses database RLS, so this suite verifies the app-layer guards
// that must still behave correctly before the database boundary is involved.

// This suite re-logs-in as different roles within a single test, so always clear
// the prior session first. The login flow itself lives in ./support.
async function loginAs(page: Page, email: string) {
  await loginFresh(page, email, { clearCookies: true })
}

// Run fetch INSIDE the browser so cookies + host routing apply.
async function apiCall(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const res = await fetch(path, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const json = await res.json().catch(() => null)
      return { status: res.status, data: json?.data ?? null }
    },
    { method, path, body },
  )
}

const evt = (class_id: string | null, title = 'x') => ({
  title,
  event_date: '2026-09-01',
  kind: 'event',
  class_id,
})

// ---------- Page-level ----------

async function assertAdminBlocked(page: Page, email: string) {
  await loginAs(page, email)
  for (const url of ['/admin/finance', '/admin/users']) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await expect(page, `${url} must redirect ${email} away`).toHaveURL(/\/dashboard/)
  }
}

test('page -- student is blocked from admin areas', async ({ page }) => {
  await assertAdminBlocked(page, 'student@mock.test')
})

test('page -- tutor is blocked from admin areas', async ({ page }) => {
  await assertAdminBlocked(page, 'tutor@mock.test')
})

test('page -- a mentor can open a class their mentee is enrolled in (scoped oversight read)', async ({ page }) => {
  // A mentor is read-only oversight (b9293ed): it keeps viewClasses + scoped
  // access to its mentees' classes, so the class page loads (no redirect). The
  // write side is denied at the capability gate - see the 403 API test below.
  await loginAs(page, 'mentor@mock.test')
  await page.goto(`/classroom/${SEED.math}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await expect(page, 'mentor has scoped class READ access -> no dashboard redirect').not.toHaveURL(/\/dashboard/)
})

test('page -- a mentor can open their mentees list (viewMentees success path)', async ({ page }) => {
  await loginAs(page, 'mentor@mock.test')
  await page.goto('/students', { waitUntil: 'domcontentloaded', timeout: 45000 })
  await expect(page, 'mentor holds viewMentees, so /students loads (no redirect)').toHaveURL(/\/students/)
})

// ---------- API role gate ----------

test('api -- a student cannot create a calendar event', async ({ page }) => {
  await loginAs(page, 'student@mock.test')
  const r = await apiCall(page, 'POST', '/api/events', evt(SEED.science))
  expect(r.status).toBe(403)
})

test('api -- a mentor CAN create an event for a mentee class, but not a global one', async ({ page }) => {
  await loginAs(page, 'mentor@mock.test')
  // 0082 + manageCalendar: a mentor may coordinate mentoring by creating calendar events
  // for a class their mentee is enrolled in (canWriteCalendar mirrors the teaches_class
  // RLS scope). A global (null-class) event stays admin-only, and CONTENT (announcements/
  // resources/assignments) stays tutor-only - the mentor is not a teaching persona.
  const mentee = await apiCall(page, 'POST', '/api/events', evt(SEED.math))
  expect(mentee.status, 'event for the mentee class').toBe(201)
  const global = await apiCall(page, 'POST', '/api/events', evt(null))
  expect(global.status, 'global event is admin-only').toBe(403)
})

// ---------- API class-scope gate ----------

test('api -- a tutor may create an event for a class they teach, but not a global one', async ({ page }) => {
  await loginAs(page, 'tutor@mock.test')
  const own = await apiCall(page, 'POST', '/api/events', evt(SEED.math, 'Doubt session'))
  expect(own.status, 'own-class event').toBe(201)
  const global = await apiCall(page, 'POST', '/api/events', evt(null, 'Global assembly'))
  expect(global.status, 'global event is admin-only').toBe(403)
})

test('api -- a global event is editable by admin only (tutor/student get 403)', async ({ page }) => {
  await loginAs(page, 'admin@mock.test')
  const created = await apiCall(page, 'POST', '/api/events', evt(null, 'Founders Assembly'))
  expect(created.status).toBe(201)
  const id = (created.data as { id: string }).id

  await loginAs(page, 'tutor@mock.test')
  expect((await apiCall(page, 'PATCH', `/api/events/${id}`, { title: 'hijack' })).status, 'tutor PATCH global').toBe(
    403,
  )

  await loginAs(page, 'student@mock.test')
  expect((await apiCall(page, 'PATCH', `/api/events/${id}`, { title: 'hijack' })).status, 'student PATCH global').toBe(
    403,
  )

  await loginAs(page, 'admin@mock.test')
  expect((await apiCall(page, 'PATCH', `/api/events/${id}`, { title: 'Founders Day' })).status, 'admin PATCH').toBe(200)
  expect((await apiCall(page, 'DELETE', `/api/events/${id}`)).status, 'admin DELETE').toBe(200)
})
