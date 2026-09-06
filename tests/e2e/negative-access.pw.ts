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
  'student@mock.test': [
    '/students',
    '/admin/users',
    '/admin/finance',
    '/admin/history',
    '/admin/messaging',
    '/admin/teaching-hours',
    '/admin/finance/billing-rates',
  ],
  // /grades is a student's OWN grade card - student-only by design; a tutor is
  // bounced (the staff view of a student's marks lives on /students/[id]).
  'tutor@mock.test': [
    '/grades',
    '/students',
    '/admin/users',
    '/admin/finance',
    '/admin/history',
    '/admin/messaging',
    // The academy-wide class-hours report is manageClasses-gated oversight; a tutor's
    // own hours live on their dashboard, a mentor's scoped view on /session-timings.
    '/admin/teaching-hours',
    // A tutor must not read the hourly rates - not even their own pay rate.
    '/admin/finance/billing-rates',
  ],
  'mentor@mock.test': [
    '/grades',
    '/admin/users',
    '/admin/finance',
    '/admin/history',
    '/admin/messaging',
    '/admin/teaching-hours',
    '/admin/finance/billing-rates',
  ],
  // Sub-admin is now an operational admin (holds viewClasses + viewMentees), so it
  // reaches /classroom, /documents and /students - and manageClasses, so the class-hours
  // report is allowed. It still lacks viewFinance/viewHistory, so the ledger and the
  // hourly rates behind it stay out of reach, and /grades is a student's own card.
  'subadmin@mock.test': ['/grades', '/admin/finance', '/admin/finance/billing-rates', '/admin/history'],
}

const ALLOWED: Record<string, string[]> = {
  'student@mock.test': ['/classroom', '/documents', '/grades', '/calendar', '/messages'],
  'tutor@mock.test': ['/classroom', '/documents', '/calendar', '/messages'],
  'mentor@mock.test': ['/students', '/classroom', '/documents', '/calendar', '/messages'],
  'subadmin@mock.test': [
    '/admin/users',
    '/admin/messaging',
    // Oversight, same as /students: a sub-admin mentors nobody, so it sees every class's
    // session times rather than an empty page (mentoringScopeClassIds).
    '/session-timings',
    // Holds manageClasses, so the class-hours report is oversight it is entitled to.
    '/admin/teaching-hours',
    '/calendar',
    '/messages',
    '/classroom',
    '/documents',
    '/students',
  ],
}

const DASHBOARD = /\/dashboard(\?|$|#)/

for (const [email, urls] of Object.entries(BLOCKED)) {
  test(`negative -- ${email} is bounced from ${urls.length} unauthorized routes`, async ({ page }) => {
    await loginAs(page, email)
    for (const url of urls) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
      // Some guards bounce via a redirect that resolves as a SOFT client navigation
      // - it lands a beat after domcontentloaded when the guard runs below the
      // already-committed portal layout (e.g. /grades' non-student check). Wait for
      // that navigation to settle before asserting, or the check races it.
      await page.waitForURL(DASHBOARD, { timeout: 15000 }).catch(() => {})
      await expect(page, `${email} must NOT reach ${url}`).toHaveURL(DASHBOARD)
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
      // Let any soft redirect fire before asserting the route was NOT bounced, so a
      // late client redirect can't slip past a check that sampled the URL too early
      // and passed (the false-pass side of the same race).
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
      await expect(page, `${email} should stay on ${url}, not be bounced`).not.toHaveURL(DASHBOARD)
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
  // The Grading tab requires viewGrading, which a student lacks. This nested page
  // refuses a non-grader with notFound() (the same primitive requireClassAccess
  // uses for a non-member) - a grader-only surface is hidden as a 404 rather than
  // announced, and unlike a redirect it replaces the already-committed class
  // layout. So the queue never renders and the branded 404 is shown in its place.
  await page.goto(`/classroom/${SEED.math}/grading`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await expect(page.getByText(/awaiting a mark/i)).toHaveCount(0)
  await expect(page.getByText('404').first(), 'student must get the grader-only 404, not the queue').toBeVisible()
})
