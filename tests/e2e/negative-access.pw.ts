import { test, expect } from '@playwright/test'
import { loginAs, SEED } from './support'

/**
 * NEGATIVE access-control matrix (the complement to scoping.pw.ts, widened to the
 * full capability-gated route set). A persona missing a route's capability is sent
 * back to /dashboard by requireCapability; a persona that HOLDS it stays on the
 * route. The positive controls guard against the matrix over-blocking (a redirect
 * that fires for the wrong reason would pass a naive "was redirected" check).
 *
 * Capability baselines (see src/lib/capabilities): student = view classes/calendar/
 * messages only; tutor adds grading + class content (NOT mentees/admin); mentor =
 * tutor + viewMentees; sub_admin = user admin only (NO classes/grades/finance).
 */

const BLOCKED: Record<string, string[]> = {
  'student@mock.test': ['/students', '/admin/users', '/admin/finance', '/admin/history', '/admin/messaging'],
  'tutor@mock.test': ['/students', '/admin/users', '/admin/finance', '/admin/history', '/admin/messaging'],
  'mentor@mock.test': ['/admin/users', '/admin/finance', '/admin/history', '/admin/messaging'],
  'subadmin@mock.test': ['/classroom', '/documents', '/students', '/grades', '/admin/finance', '/admin/history'],
}

const ALLOWED: Record<string, string[]> = {
  'student@mock.test': ['/classroom', '/documents', '/grades', '/calendar', '/messages'],
  'tutor@mock.test': ['/classroom', '/documents', '/grades', '/calendar', '/messages'],
  'mentor@mock.test': ['/students', '/classroom', '/documents', '/calendar', '/messages'],
  'subadmin@mock.test': ['/admin/users', '/admin/messaging', '/calendar', '/messages'],
}

for (const [email, urls] of Object.entries(BLOCKED)) {
  test(`negative -- ${email} is bounced from ${urls.length} unauthorized routes`, async ({ page }) => {
    await loginAs(page, email)
    for (const url of urls) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await expect(page, `${email} must NOT reach ${url}`).toHaveURL(/\/dashboard(\?|$|#)/)
    }
  })
}

for (const [email, urls] of Object.entries(ALLOWED)) {
  test(`positive control -- ${email} reaches its ${urls.length} authorized routes (matrix not over-blocking)`, async ({
    page,
  }) => {
    await loginAs(page, email)
    for (const url of urls) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await expect(page, `${email} should stay on ${url}, not be bounced`).not.toHaveURL(/\/dashboard(\?|$|#)/)
    }
  })
}

// notFound() paths render the branded portal 404 (src/app/(prt)/not-found.tsx),
// NOT a redirect - a distinct failure mode from the capability bounce above.
const BAD_ID = '00000000-0000-4000-8000-0000000000ff'

test('negative -- invalid class/assignment ids render the 404 page, not a real record', async ({ page }) => {
  await loginAs(page, 'tutor@mock.test')
  for (const url of [`/classroom/${BAD_ID}`, `/assignments/${BAD_ID}`]) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await expect(page.getByText('404').first(), `${url} should 404`).toBeVisible()
  }
})

test('negative -- a student never sees a class Grading queue (grader-only surface)', async ({ page }) => {
  await loginAs(page, 'student@mock.test')
  // The Grading tab requires viewGrading, which a student lacks: they are bounced
  // to the dashboard (or 404 if they aren't a class member). Either way they must
  // NEVER reach the queue itself, so assert its signature text is absent.
  await page.goto(`/classroom/${SEED.math}/grading`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await expect(page.getByText(/awaiting a mark/i)).toHaveCount(0)
  await expect(page, 'student must not remain on a working grading page').not.toHaveURL(/\/grading$/)
})
