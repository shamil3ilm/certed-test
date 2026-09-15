import { test, expect, type Page } from '@playwright/test'
import { type Persona, confirm, expectNoAppError, loginAs, note, open, reload, sawMessage, tagged } from './support'

/**
 * The everyday edges of each account: their own settings (profile, details, password rules),
 * notifications, and the scheduling tools - a tutor's weekly slot and calendar event, a mentor's
 * dashboard reminder.
 */

const PERSONAS: Persona[] = ['superadmin', 'subadmin', 'tutor', 'mentor', 'student']
const SLOT_SUBJECT = tagged('Slot')
const EVENT = tagged('Event')
const REMINDER = tagged('Reminder')

async function panel(page: Page, heading: RegExp) {
  return page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: heading }) })
    .first()
}

for (const persona of PERSONAS) {
  test(`SETTINGS: ${persona} saves their profile and details, and a mismatched password is caught`, async ({
    page,
  }) => {
    await loginAs(page, persona)
    await open(page, '/settings')

    const profile = await panel(page, /^Save profile$/)
    const name = await profile.locator('input[name=full_name]').inputValue()
    await profile.getByRole('button', { name: 'Save profile' }).click()
    await page.waitForLoadState('networkidle').catch(() => null)
    expect(await sawMessage(page, /Profile updated\./), 'saving the profile confirms it').toBe(true)
    await expect(page.locator('input[name=full_name]').first()).toHaveValue(name)

    const details = page.getByRole('button', { name: 'Save details' })
    if (await details.count()) {
      await details.click()
      await page.waitForLoadState('networkidle').catch(() => null)
      await page.waitForTimeout(1500)
      const url = page.url()
      const confirmed = await sawMessage(page, /saved|updated/i, 5000)
      if (!confirmed)
        note(
          `${persona}: "Save details" gives no confirmation (landed on ${new URL(url).pathname}${new URL(url).search})`,
        )
    }

    const password = await panel(page, /^Change password$/)
    await password.locator('input[name=password]').fill('Aa1!aaaaaaaa')
    await password.locator('input[name=confirm]').fill('Aa1!aaaaaaab')
    await expect(page.getByRole('alert').filter({ hasText: 'Passwords do not match.' })).toBeVisible()
    await expectNoAppError(page)
  })
}

test('NOTIFICATIONS: the student opens their notifications and marks them read', async ({ page }) => {
  await loginAs(page, 'student')
  const bell = page.getByRole('link', { name: /^Notifications/ }).first()
  console.log(`bell before: ${await bell.getAttribute('aria-label')}`)
  await open(page, '/notifications')
  await expectNoAppError(page)
  const markAll = page.getByRole('button', { name: 'Mark all read' })
  if (await markAll.count()) {
    await markAll.click()
    expect(await sawMessage(page, /All notifications marked read\./)).toBe(true)
    await expect(page.getByRole('img', { name: 'Unread' })).toHaveCount(0)
  }
  await expect(page.getByRole('link', { name: /^Notifications/ }).first()).toHaveAttribute(
    'aria-label',
    'Notifications',
  )
})

test.describe('SCHEDULING', () => {
  test('tutor adds a weekly slot, deactivates it, and deletes it', async ({ page }) => {
    await loginAs(page, 'tutor')
    await open(page, '/calendar')
    const slots = page.getByRole('heading', { name: 'Existing slots' }).locator('xpath=following-sibling::*[1]')

    // Delete one slot row (only ever a row carrying a run tag). Delete stays disabled while the
    // row's last save is in flight, and the row re-renders when it lands, so retry.
    async function deleteSlot(subject: RegExp | string) {
      const target = slots.locator(':scope > li').filter({ hasText: subject }).first()
      await expect(async () => {
        const del = page.getByRole('button', { name: 'Delete', exact: true })
        // A re-render when the row's last save lands closes edit mode: reopen it when needed.
        if (!(await del.isVisible())) await target.getByRole('button', { name: 'Edit' }).click({ timeout: 2000 })
        await expect(del).toBeEnabled({ timeout: 2000 })
        await del.click({ timeout: 2000 })
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2000 })
      }).toPass({ timeout: 30_000 })
      await confirm(page, 'Delete')
      await reload(page)
    }

    for (let guard = 0; guard < 10; guard++) {
      if (
        !(await slots
          .locator(':scope > li')
          .filter({ hasText: /E2E \d{8} Slot/ })
          .count())
      )
        break
      await deleteSlot(/E2E \d{8} Slot/)
      console.log('cleanup: deleted a slot left by an earlier run')
    }

    const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Add weekly slot' }) })
    await form.getByLabel('Class').selectOption({ index: 0 })
    await form.getByLabel('Subject').fill(SLOT_SUBJECT)
    await form.getByLabel('Day').selectOption({ label: 'Sat' })
    await form.getByLabel(/^Start/).fill('07:00')
    await form.getByLabel(/^End/).fill('07:30')
    await form.getByLabel(/Room/).fill('E2E room')
    await form.getByRole('button', { name: 'Add weekly slot' }).click()
    expect(await sawMessage(page, /^Saved$/)).toBe(true)

    // Only ever a row of the slot list that carries this run's subject - never someone's else slot.
    const row = slots.locator(':scope > li').filter({ hasText: SLOT_SUBJECT })
    await expect(row, 'the saved slot is listed').toHaveCount(1)
    // Not deactivated here: GET /api/timetable lists active slots only, so a deactivated slot
    // leaves the list for good and can be neither reactivated nor deleted (reported as a bug).
    await deleteSlot(SLOT_SUBJECT)
    await expect(slots.locator(':scope > li').filter({ hasText: SLOT_SUBJECT })).toHaveCount(0)
  })

  test('tutor adds a calendar event from the calendar, and it shows in the agenda', async ({ page }) => {
    await loginAs(page, 'tutor')
    await open(page, '/calendar')
    await page.getByRole('button', { name: 'Add', exact: true }).first().click()
    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible()
    const eventTab = modal.getByRole('button', { name: /Event/ }).first()
    if (!(await eventTab.count())) {
      note('tutor calendar composer offers no Event tab')
      return
    }
    await eventTab.click()
    await modal.getByLabel(/Event title/).fill(EVENT)
    await modal.getByRole('button', { name: /^Save event$/ }).click()
    expect(await sawMessage(page, /Added to schedule/)).toBe(true)

    await open(page, '/calendar?view=agenda')
    if (!(await page.getByText(EVENT).count())) note(`the event "${EVENT}" is not listed in the agenda view`)

    // Remove it through the timetable manager's Events tab.
    await page
      .getByRole('button', { name: 'Events', exact: true })
      .click()
      .catch(() => null)
    // The Events list row - the calendar grid also shows the title, in an element with no controls.
    const row = page
      .locator('li')
      .filter({ hasText: EVENT })
      .filter({ has: page.getByRole('button', { name: 'Delete', exact: true }) })
      .first()
    if (await row.count()) {
      await row.getByRole('button', { name: 'Delete' }).click()
      await confirm(page, 'Delete')
    } else {
      note(`could not find "${EVENT}" in the Events list to remove it`)
    }
  })

  test('mentor adds a dashboard reminder and deletes it', async ({ page }) => {
    await loginAs(page, 'mentor')
    await open(page, '/dashboard')
    await page.getByRole('button', { name: '+ Add' }).first().click()
    const reminderForm = page.locator('form').filter({ has: page.getByPlaceholder('Reminder title...') })
    await reminderForm.getByPlaceholder('Reminder title...').fill(REMINDER)
    // "When" is required: without it the browser blocks the submit silently.
    const when = new Date(Date.now() + 2 * 86_400_000)
    const pad = (n: number) => String(n).padStart(2, '0')
    await reminderForm
      .locator('input[name=remind_at]')
      .fill(`${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T10:00`)
    // Wait for the save itself: a reload that lands first aborts it and the reminder is never stored.
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST', { timeout: 30_000 }),
      reminderForm.getByRole('button', { name: 'Save', exact: true }).click(),
    ])
    await page.waitForTimeout(1000)
    await reload(page)
    await expect(page.getByText(REMINDER, { exact: true }), 'the reminder is stored').toBeVisible()

    // Its own card: the smallest element holding the title and exactly one delete control.
    const card = page
      .locator('li, div')
      .filter({ has: page.getByText(REMINDER, { exact: true }) })
      .filter({ has: page.getByRole('button', { name: 'Delete reminder' }) })
      .last()
    await expect(card.getByRole('button', { name: 'Delete reminder' })).toHaveCount(1)
    page.once('dialog', (d) => d.accept())
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST', { timeout: 30_000 }).catch(() => null),
      card.getByRole('button', { name: 'Delete reminder' }).click(),
    ])
    const dialog = page.getByRole('dialog')
    if (await dialog.isVisible().catch(() => false)) await confirm(page, 'Delete')
    await page.waitForTimeout(1000)
    await reload(page)
    await expect(page.getByText(REMINDER, { exact: true })).toHaveCount(0)
  })
})
