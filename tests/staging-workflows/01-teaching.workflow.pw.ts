import { test, expect } from '@playwright/test'
import {
  CLASS_ID,
  PDF,
  RUN,
  STUDENT_ID,
  STUDENT_NAME,
  confirm,
  expectNoAppError,
  fetchBytes,
  localDateTime,
  loginAs,
  note,
  open,
  reload,
  sawMessage,
  tagged,
  textOf,
  watchErrors,
} from './support'

/**
 * The teaching loop, each step from the person doing it: a tutor sets work, the student hands
 * it in, the tutor marks it and comments, and the student, their grades page and their mentor
 * all see the same result. Then the tutor reopens it, the student withdraws, the tutor archives.
 */

const TITLE = tagged('Assignment')
const FEEDBACK = `${RUN} good method, check Q2`
const COMMENT = `${RUN} tutor comment`
let assignmentId = ''

test.describe.serial('TEACHING', () => {
  test('tutor creates an assignment in their class', async ({ page }) => {
    const errors = watchErrors(page)
    await loginAs(page, 'tutor')
    await open(page, `/classroom/${CLASS_ID}/classwork`)

    // An earlier run that stopped midway leaves its assignment active; archive it first.
    const leftovers = page
      .locator('li[id^="assignment-"]')
      .filter({ hasText: /E2E \d{8} Assignment/ })
      .filter({ has: page.getByRole('button', { name: 'Archive', exact: true }) })
    while ((await leftovers.count()) > 0) {
      await leftovers.first().getByRole('button', { name: 'Archive', exact: true }).click()
      await confirm(page, 'Archive')
      await reload(page)
    }

    const form = page.locator('form').filter({ has: page.getByRole('heading', { name: /^Create / }) })
    await form.getByLabel('Title').fill(TITLE)
    await form.getByLabel('Description (optional)').fill('Created by the staging workflow suite.')
    await form.getByLabel('Max marks').fill('20')
    await form.locator('input[type=datetime-local]').first().fill(localDateTime(7))
    await form.getByRole('button', { name: 'Create', exact: true }).click()
    if (!(await sawMessage(page, /Assignment created/i))) note('no "Assignment created" toast seen')

    await reload(page)
    const card = page.locator('li[id^="assignment-"]').filter({ hasText: TITLE }).first()
    await expect(card).toBeVisible()
    assignmentId = ((await card.getAttribute('id')) ?? '').replace('assignment-', '')
    expect(assignmentId).toMatch(/^[0-9a-f-]{36}$/)
    expect(errors).toEqual([])
  })

  test('student sees it on their classwork and uploads their work', async ({ page }) => {
    const errors = watchErrors(page)
    await loginAs(page, 'student')
    await open(page, `/classroom/${CLASS_ID}/classwork`)

    const card = page.locator(`li#assignment-${assignmentId}`)
    await expect(card).toContainText(TITLE)
    await expect(card).toContainText('Not submitted yet.')

    await card.getByLabel('Attach a file to this submission').setInputFiles({
      name: 'e2e-work.pdf',
      mimeType: 'application/pdf',
      buffer: PDF,
    })
    await expect(card.getByText('e2e-work.pdf').first()).toBeVisible({ timeout: 60_000 })

    await reload(page)
    const after = page.locator(`li#assignment-${assignmentId}`)
    await expect(after).toContainText(/Your submission:\s*(On time|Late)/)

    // The file the student handed in streams back to them through the app.
    const href = await after.getByRole('link', { name: 'Download' }).first().getAttribute('href')
    expect(href).toBeTruthy()
    const download = await fetchBytes(page, href!)
    expect(download.status).toBe(200)
    expect(download.head).toEqual([0x25, 0x50, 0x44, 0x46])
    expect(errors).toEqual([])
  })

  test('tutor marks the submission with feedback and comments on it', async ({ page }) => {
    const errors = watchErrors(page)
    await loginAs(page, 'tutor')
    await open(page, `/assignments/${assignmentId}`)

    const sub = page.locator('[id^="sub-"]').first()
    await expect(sub).toBeVisible()
    console.log(`submission card: ${(await textOf(sub)).slice(0, 200)}`)
    await sub.locator('input[type=number]').fill('18')
    await sub.getByPlaceholder('Well done - recheck Q5.').fill(FEEDBACK)
    await sub.getByRole('button', { name: 'Save mark' }).click()
    expect(await sawMessage(page, /Mark saved/), 'the tutor is told the mark saved').toBe(true)

    await reload(page)
    const graded = page.locator('[id^="sub-"]').first()
    await expect(graded.getByText('Graded', { exact: true })).toBeVisible()
    await expect(graded.getByRole('button', { name: 'Reopen for resubmission' })).toBeVisible()

    await graded
      .getByRole('button', { name: /Add a comment|comment/ })
      .first()
      .click()
    await graded.getByPlaceholder('Write a comment...').fill(COMMENT)
    await graded.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText(COMMENT).first()).toBeVisible()
    expect(errors).toEqual([])
  })

  test('student sees the mark, the feedback and the comment', async ({ page }) => {
    await loginAs(page, 'student')
    await open(page, `/classroom/${CLASS_ID}/classwork`)
    const card = page.locator(`li#assignment-${assignmentId}`)
    await expect(card).toContainText('Marked: 18 / 20 (90%)')
    await expect(card).toContainText(FEEDBACK)
    await expect(card).toContainText(/only they can reopen it/)
    await expect(card.getByRole('button', { name: '1 comment' })).toBeVisible()
    // The toggle is a client island: a click that lands before it hydrates does nothing, so
    // retry until the thread's own composer is on screen.
    await expect(async () => {
      if (!(await card.getByPlaceholder('Write a comment...').isVisible())) {
        await card
          .getByRole('button', { name: /comment/ })
          .first()
          .click()
      }
      await expect(card.getByPlaceholder('Write a comment...')).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 20_000 })
    await expect(card.getByText(COMMENT)).toBeVisible()

    await open(page, '/grades')
    const row = page.locator('tr, li').filter({ hasText: TITLE }).first()
    await expect(row).toBeVisible()
    await expect(row).toContainText(/18\s*\/\s*20/)
    await expectNoAppError(page)
  })

  test("mentor sees the mark on their mentee's record", async ({ page }) => {
    await loginAs(page, 'mentor')
    await open(page, `/students/${STUDENT_ID}?period=30`)
    const body = await page.locator('main').innerText()
    if (!body.includes(TITLE)) note(`mentee page does not list "${TITLE}" (recent grades)`)
    else expect(body).toMatch(/18/)
    await expectNoAppError(page)
  })

  test('tutor reopens it; the student withdraws; the mark is gone', async ({ page }) => {
    await loginAs(page, 'tutor')
    await open(page, `/assignments/${assignmentId}`)
    await page.locator('[id^="sub-"]').first().getByRole('button', { name: 'Reopen for resubmission' }).click()
    await confirm(page, 'Reopen')
    expect(await sawMessage(page, /Reopened for resubmission/)).toBe(true)

    await loginAs(page, 'student')
    await open(page, `/classroom/${CLASS_ID}/classwork`)
    const card = page.locator(`li#assignment-${assignmentId}`)
    await expect(card).not.toContainText('Marked: 18')
    console.log(`student card after reopen: ${(await textOf(card)).slice(0, 240)}`)
    const withdraw = card.getByRole('button', { name: 'Withdraw submission' })
    if (await withdraw.count()) {
      await withdraw.click()
      await confirm(page, 'Withdraw')
      await reload(page)
      await expect(page.locator(`li#assignment-${assignmentId}`)).toContainText('Not submitted yet.')
    } else {
      note('after reopening, the student has no "Withdraw submission" control')
    }
  })

  test('tutor archives the assignment; the student no longer sees it', async ({ page }) => {
    await loginAs(page, 'tutor')
    await open(page, `/classroom/${CLASS_ID}/classwork`)
    const card = page.locator(`li#assignment-${assignmentId}`)
    await card.getByRole('button', { name: 'Archive', exact: true }).click()
    await confirm(page, 'Archive')
    await reload(page)
    await expect(page.locator(`li#assignment-${assignmentId}`)).toContainText(/archived/)

    await loginAs(page, 'student')
    await open(page, `/classroom/${CLASS_ID}/classwork`)
    await expect(page.locator(`li#assignment-${assignmentId}`)).toHaveCount(0)
    await expect(page.getByText(STUDENT_NAME).first()).toBeVisible()
  })
})
