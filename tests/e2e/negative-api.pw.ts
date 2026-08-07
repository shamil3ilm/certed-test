import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './support'

/**
 * NEGATIVE API contracts (extends scoping.pw.ts's calendar cases to money +
 * scheduling). Financial writes are STRUCTURAL admin-only (requireRoleApi), so a
 * forbidden caller must get 403 BEFORE any record is touched - and a malformed
 * body from an allowed caller must be a clean 422, never a raw 500 that leaks
 * internals.
 */
async function apiCall(page: Page, method: string, path: string, body?: unknown): Promise<{ status: number }> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const res = await fetch(path, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      return { status: res.status }
    },
    { method, path, body },
  )
}

const BAD_ID = '00000000-0000-4000-8000-0000000000ff'
const RECEIPT_BODY = {
  party_id: BAD_ID,
  issue_date: '2026-08-01',
  currency: 'INR',
  lines: [{ subject: 'x', hours: 1, rate: 100 }],
}

test('negative api -- issuing a finance doc is admin-only (tutor + student get 403)', async ({ page }) => {
  for (const email of ['tutor@mock.test', 'student@mock.test']) {
    await loginAs(page, email, { clearCookies: true })
    for (const path of ['/api/receipts', '/api/payslips']) {
      const r = await apiCall(page, 'POST', path, RECEIPT_BODY)
      expect(r.status, `${email} POST ${path} must be forbidden`).toBe(403)
    }
  }
})

test('negative api -- voiding a finance doc is admin-only (tutor gets 403, before any id lookup)', async ({ page }) => {
  await loginAs(page, 'tutor@mock.test')
  const r = await apiCall(page, 'POST', `/api/receipts/${BAD_ID}/void`)
  expect(r.status).toBe(403)
})

test('negative api -- finance export requires viewFinance (student + tutor get 403)', async ({ page }) => {
  for (const email of ['student@mock.test', 'tutor@mock.test']) {
    await loginAs(page, email, { clearCookies: true })
    const r = await apiCall(page, 'GET', '/api/receipts/export')
    expect(r.status, `${email} GET export must be forbidden`).toBe(403)
  }
})

test('negative api -- creating a timetable slot needs manageCalendar (student gets 403)', async ({ page }) => {
  await loginAs(page, 'student@mock.test')
  const r = await apiCall(page, 'POST', '/api/timetable', {
    class_id: BAD_ID,
    day_of_week: 1,
    start_time: '10:00',
    end_time: '11:00',
    subject: 'X',
  })
  expect(r.status).toBe(403)
})

test('negative api -- an admin issuing with an invalid body is a clean 422, not a 500', async ({ page }) => {
  await loginAs(page, 'admin@mock.test')
  const r = await apiCall(page, 'POST', '/api/receipts', { garbage: true })
  expect(r.status, 'ValidationError must map to 422, never a raw 500').toBe(422)
})
