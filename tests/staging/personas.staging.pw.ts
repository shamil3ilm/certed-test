import { test, expect } from '@playwright/test'
import { loginAs, expectHealthyPage, visit, emailFor, settle, type Persona } from './support'

/**
 * Per-persona smoke + permission-boundary journeys against the DEPLOYED staging app.
 *
 * READ-ONLY by design: every step navigates and asserts. Nothing here creates, edits or
 * deletes a record, because staging holds real data shared with other people.
 *
 * Assertions are STRUCTURAL (does the surface render, is the route reachable or refused)
 * rather than data-driven - the seeded content of staging is unknown from here, so
 * asserting on specific classes/students would be flaky rather than informative.
 *
 * Each persona captures a full-page dashboard screenshot into test-results/staging/,
 * which is the artefact for the ease-of-use / dashboard review.
 */

/** Admin-only surfaces: reachable for admin tiers, refused for everyone else. */
const ADMIN_ROUTES = ['/admin/users', '/admin/finance', '/admin/history']

async function shot(page: import('@playwright/test').Page, name: string) {
  await settle(page)
  await page.screenshot({ path: `test-results/staging/${name}.png`, fullPage: true })
}

/** Login + dashboard renders. The single most important thing about a deployment: can
 *  this persona actually get in, and does their landing page have content? */
async function landsOnDashboard(page: import('@playwright/test').Page, persona: Persona) {
  await loginAs(page, persona)
  await expect(page).toHaveURL(/\/dashboard/)
  await expectHealthyPage(page)
  await shot(page, `${persona}-dashboard`)
}

test.describe('staging - Super Admin', () => {
  test('signs in, lands on a populated dashboard, and reaches every admin surface', async ({ page }) => {
    await landsOnDashboard(page, 'superadmin')

    for (const route of ADMIN_ROUTES) {
      const { denied, url } = await visit(page, route)
      expect(denied, `super admin should reach ${route} (landed on ${url})`).toBe(false)
      await expectHealthyPage(page)
    }
    await shot(page, 'superadmin-admin-users')
  })
})

test.describe('staging - Sub Admin', () => {
  test('signs in and lands on a real dashboard (not a blank lock-out), and can reach People', async ({ page }) => {
    await landsOnDashboard(page, 'subadmin')

    // The regression this guards: a sub_admin landing on an empty/locked dashboard.
    const dashboardText = await page.locator('body').innerText()
    expect(dashboardText.length, 'sub admin dashboard looks empty').toBeGreaterThan(200)

    const people = await visit(page, '/admin/users')
    expect(people.denied, 'sub admin manages the tutor/mentor/student tier').toBe(false)
    await expectHealthyPage(page)

    const settings = await visit(page, '/settings')
    expect(settings.denied, 'sub admin can reach settings').toBe(false)
  })
})

test.describe('staging - Tutor', () => {
  test('signs in, sees the teaching dashboard, reaches their classroom, and is refused admin areas', async ({
    page,
  }) => {
    await landsOnDashboard(page, 'tutor')

    const classroom = await visit(page, '/classroom')
    expect(classroom.denied, 'a tutor reaches their classes').toBe(false)
    await expectHealthyPage(page)
    await shot(page, 'tutor-classroom')

    for (const route of ADMIN_ROUTES) {
      const { denied } = await visit(page, route)
      expect(denied, `tutor must NOT reach ${route}`).toBe(true)
    }
  })
})

test.describe('staging - Mentor', () => {
  test('signs in, sees mentee oversight, reaches mentees + session times, and is refused admin areas', async ({
    page,
  }) => {
    await landsOnDashboard(page, 'mentor')

    const mentees = await visit(page, '/students')
    expect(mentees.denied, 'a mentor reaches their mentees list').toBe(false)
    await expectHealthyPage(page)
    await shot(page, 'mentor-mentees')

    // The mentor's own hub: session times (start/end + student entry, tutor + subject).
    const timings = await visit(page, '/session-timings')
    expect(timings.denied, 'a mentor reaches the session-times list').toBe(false)
    await expectHealthyPage(page)
    await shot(page, 'mentor-session-timings')

    for (const route of ADMIN_ROUTES) {
      const { denied } = await visit(page, route)
      expect(denied, `mentor must NOT reach ${route}`).toBe(true)
    }
  })
})

test.describe('staging - Student', () => {
  test('signs in, sees their own dashboard, and is refused every admin area', async ({ page }) => {
    await landsOnDashboard(page, 'student')

    for (const route of ADMIN_ROUTES) {
      const { denied } = await visit(page, route)
      expect(denied, `student must NOT reach ${route}`).toBe(true)
    }

    // A student's nav must not advertise oversight/admin destinations.
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    const nav = (await page.locator('body').innerText()).toLowerCase()
    expect(nav, 'student nav exposes an admin destination').not.toContain('all classes')
  })
})

test.describe('staging - account sanity', () => {
  test('every persona account signs in', async ({ page }) => {
    const personas: Persona[] = ['superadmin', 'subadmin', 'tutor', 'mentor', 'student']
    const failures: string[] = []
    for (const persona of personas) {
      try {
        await loginAs(page, persona)
        await expect(page).toHaveURL(/\/dashboard/)
      } catch (error) {
        failures.push(`${persona} (${emailFor(persona)}): ${(error as Error).message.split('\n')[0]}`)
      }
    }
    expect(failures, `accounts that could not sign in:\n${failures.join('\n')}`).toEqual([])
  })
})
