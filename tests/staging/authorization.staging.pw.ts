import { test, expect } from '@playwright/test'
import { loginAs, settle, visit, type Persona } from './support'

/**
 * Permission boundaries on the DEPLOYED app: what each persona can reach by typing a URL,
 * and what the APIs answer when the UI never offered the control.
 *
 * READ-ONLY for pages. The API probes deliberately send writes that MUST be refused - if
 * one is ever accepted that is itself the finding, and the payloads are inert (a blank
 * title on a nonexistent class) so an unexpected success leaves nothing meaningful behind.
 */

const ADMIN_ONLY = [
  '/admin/users',
  '/admin/finance',
  '/admin/finance/rates',
  '/admin/history',
  '/admin/messaging',
  '/admin/settings',
  '/admin/teaching-hours',
]

const LOWER_PRIVILEGE: Persona[] = ['student', 'tutor', 'mentor']

for (const persona of LOWER_PRIVILEGE) {
  test(`AUTHZ: ${persona} is refused every admin route`, async ({ page }) => {
    await loginAs(page, persona)
    const reached: string[] = []
    for (const route of ADMIN_ONLY) {
      const { url, denied } = await visit(page, route)
      if (!denied) reached.push(`${route} (landed on ${url})`)
    }
    expect(reached, `${persona} reached admin-only routes: ${reached.join(' | ')}`).toEqual([])
  })
}

test('AUTHZ-API: a student cannot create a calendar event', async ({ page }) => {
  await loginAs(page, 'student')
  const res = await page.request.post('/api/events', {
    data: { title: '', class_id: null, starts_at: new Date().toISOString() },
    failOnStatusCode: false,
  })
  console.log(`POST /api/events as student -> ${res.status()}`)
  expect(res.status(), 'a student must not be able to create an event').toBeGreaterThanOrEqual(400)
})

test('AUTHZ-API: a student cannot read finance exports', async ({ page }) => {
  await loginAs(page, 'student')
  const results: string[] = []
  for (const path of ['/api/receipts/export', '/api/payslips/export']) {
    const res = await page.request.get(path, { failOnStatusCode: false })
    results.push(`${path} -> ${res.status()}`)
    expect(res.status(), `${path} must not be readable by a student`).toBeGreaterThanOrEqual(400)
  }
  console.log(results.join(' | '))
})

test('AUTHZ-API: a tutor cannot create an academy-wide (global) event', async ({ page }) => {
  await loginAs(page, 'tutor')
  const res = await page.request.post('/api/events', {
    data: { title: 'E2E-SHOULD-BE-REFUSED', class_id: null, starts_at: new Date().toISOString() },
    failOnStatusCode: false,
  })
  console.log(`POST /api/events (global) as tutor -> ${res.status()}`)
  expect(res.status(), 'a global event is admin-only').toBeGreaterThanOrEqual(400)
})

test('AUTHZ-IDOR: a student cannot fetch another account report card by id', async ({ page }) => {
  await loginAs(page, 'student')
  // A well-formed but foreign uuid: the answer must be a refusal or a not-found, never a document.
  const foreign = '00000000-0000-4000-8000-0000000000ff'
  const res = await page.request.get(`/api/report-card/${foreign}/pdf`, { failOnStatusCode: false })
  const type = res.headers()['content-type'] ?? ''
  console.log(`GET /api/report-card/<foreign>/pdf as student -> ${res.status()} ${type}`)
  expect(res.status(), 'a foreign report card must not return 200').toBeGreaterThanOrEqual(400)
  expect(type, 'must never stream a PDF for a foreign id').not.toContain('application/pdf')
})

test('AUTHZ: a sub_admin reaches the admin areas it should, and the record of them', async ({ page }) => {
  await loginAs(page, 'subadmin')
  const reachable: string[] = []
  const refused: string[] = []
  for (const route of ADMIN_ONLY) {
    const { denied } = await visit(page, route)
    ;(denied ? refused : reachable).push(route)
  }
  console.log(`sub_admin reachable: ${reachable.join(', ') || '(none)'}`)
  console.log(`sub_admin refused:   ${refused.join(', ') || '(none)'}`)
  // A sub_admin exists to administer people; if it cannot reach the users hub the role is broken.
  expect(reachable, 'a sub_admin must be able to reach the People hub').toContain('/admin/users')
})

test('AUTHZ-EDGE: a malformed id in a detail route fails cleanly, without a stack trace', async ({ page }) => {
  await loginAs(page, 'superadmin')
  await page.goto('/admin/users/not-a-uuid', { waitUntil: 'domcontentloaded' }).catch(() => null)
  await settle(page)
  const body = (
    await page
      .locator('body')
      .innerText()
      .catch(() => '')
  ).toLowerCase()
  expect(body, 'a bad id must not leak an internal error').not.toContain('invalid input syntax')
  expect(body).not.toContain('at async')
  expect(body).not.toContain('supabase')
  console.log(`/admin/users/not-a-uuid -> ${page.url()}`)
})
