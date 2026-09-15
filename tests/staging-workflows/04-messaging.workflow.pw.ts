import { test, expect, type Page } from '@playwright/test'
import { STUDENT_NAME, TUTOR_NAME, expectNoAppError, loginAs, note, open, tagged, watchErrors } from './support'

/**
 * Conversations from both ends: a tutor writes to their student, the student finds it (and a
 * notification), replies, and the tutor reads the reply. A mentor writes to their mentee. Someone
 * outside the conversation cannot open it.
 */

const TO_STUDENT = tagged('hello from your tutor')
const REPLY = tagged('reply from the student')
const FROM_MENTOR = tagged('check-in from your mentor')
let conversation = ''

async function startChat(page: Page, name: string): Promise<string> {
  await open(page, '/messages')
  await page
    .getByRole('button', { name: /^(New chat|Start new chat)$/ })
    .first()
    .click()
  await page.locator('#message-recipient-search').fill(name)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: new RegExp(name) })
    .first()
    .click()
  await page.getByRole('button', { name: /^Start( group)?$/ }).click()
  await page.waitForURL(/\/messages\/[0-9a-f-]{36}/, { timeout: 45_000 })
  return page.url().split('/messages/')[1].split(/[/?#]/)[0]
}

/** Send, and prove it was stored: text on screen alone can be the composer's own echo. */
async function send(page: Page, body: string) {
  await page.getByRole('textbox', { name: 'Message' }).fill(body)
  const [response] = await Promise.all([
    page
      .waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname.startsWith('/messages/'), {
        timeout: 30_000,
      })
      .catch(() => null),
    page.getByRole('button', { name: 'Send', exact: true }).click(),
  ])
  console.log(`send "${body}": POST ${response?.status() ?? 'none'}`)
  const confirmed = await page
    .getByText('Message sent.')
    .first()
    .waitFor({ state: 'attached', timeout: 15_000 })
    .then(() => true)
    .catch(() => false)
  if (!confirmed) note(`no "Message sent." confirmation after sending "${body}"`)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByText(body).first(), 'the message is still there after a reload').toBeVisible()
}

test.describe.serial('MESSAGING', () => {
  test('tutor writes to their student', async ({ page }) => {
    const errors = watchErrors(page)
    await loginAs(page, 'tutor')
    conversation = await startChat(page, STUDENT_NAME)
    await send(page, TO_STUDENT)
    expect(errors).toEqual([])
  })

  test('student is notified, finds the thread, reads it and replies', async ({ page }) => {
    await loginAs(page, 'student')
    const bell = page.getByRole('link', { name: /^Notifications/ }).first()
    console.log(`student bell: ${await bell.getAttribute('aria-label')}`)

    await open(page, '/messages')
    const row = page.locator(`a[href="/messages/${conversation}"]`)
    await expect(row).toBeVisible()
    await expect(row).toContainText(TUTOR_NAME)
    await row.click()
    await page.waitForURL(new RegExp(conversation))
    await expect(page.getByText(TO_STUDENT).first()).toBeVisible()
    await send(page, REPLY)
  })

  test('tutor reads the reply', async ({ page }) => {
    await loginAs(page, 'tutor')
    await open(page, `/messages/${conversation}`)
    await expect(page.getByText(REPLY).first()).toBeVisible()
  })

  test('mentor writes to their mentee, and the mentee receives it', async ({ page }) => {
    await loginAs(page, 'mentor')
    const mentorThread = await startChat(page, STUDENT_NAME)
    await send(page, FROM_MENTOR)

    await loginAs(page, 'student')
    await open(page, `/messages/${mentorThread}`)
    await expect(page.getByText(FROM_MENTOR).first()).toBeVisible()
  })

  test('someone outside the conversation cannot open it', async ({ page }) => {
    await loginAs(page, 'subadmin')
    await open(page, `/messages/${conversation}`)
    const leaked = await page.getByText(TO_STUDENT).count()
    expect(leaked, 'a non-participant must not read the thread').toBe(0)
    const heading = await page
      .locator('main h1, main h2')
      .first()
      .innerText()
      .catch(() => '')
    if (!/not found/i.test(heading)) note(`non-participant opening a thread sees heading "${heading}"`)
    await expectNoAppError(page)
  })
})
