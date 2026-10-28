import { test, expect, type Page } from '@playwright/test'
import { loginAs, submitAndReload, attemptName, SEED } from './support'

/**
 * E2E for who is told when classwork, posts, documents, sessions and classes change - and, as
 * much, that they are told when it is an EDIT or a WITHDRAWAL that happened.
 *
 * Several of these notices once depended on comparing the row the service had read with the new
 * value AFTER saving it. The mock store updates the row it hands back in place, so every edit read as
 * "nothing changed" and nobody was told; Postgres would not have done that, which is why it hid.
 * Mock mode is exactly what this suite runs on, so this is the layer that holds those notices in
 * place. The unit tests (in-place-store-notices.test.ts) pin the logic; here the real forms drive it
 * and each person's real feed is read back.
 *
 * Cast: Tarun teaches Maths, Sara is its student, Maya mentors Sara, Tessa teaches it too.
 */

/** The text of a person's notification feed, newest first. */
async function feedOf(page: Page, email: string): Promise<string> {
  await loginAs(page, email, { clearCookies: true })
  await page.goto('/notifications', { waitUntil: 'networkidle' })
  return page.locator('main').innerText()
}

/** The card of one assignment on the classwork page: each carries its own id, so it cannot be confused with a neighbour. */
function assignmentCard(page: Page, title: string) {
  return page.locator('[id^="assignment-"]').filter({ has: page.getByRole('heading', { name: title }) })
}

/** The card for an item on a class page, found by its heading and narrowed to the one holding its controls. */
function cardFor(page: Page, title: string, control: string) {
  return page
    .locator('div')
    .filter({ has: page.getByRole('heading', { name: title }) })
    .filter({ has: page.getByRole('button', { name: control }) })
    .last()
}

test('a post that is edited and then withdrawn tells the class both times, and not its author', async ({
  page,
}, testInfo) => {
  const title = attemptName('Journey post', testInfo)

  await loginAs(page, 'tutor@mock.test')
  await page.goto(`/classroom/${SEED.math}`, { waitUntil: 'networkidle' })
  await page.getByPlaceholder('Title').first().fill(title)
  await page.getByPlaceholder('Share something with your class...').fill('First wording')
  await submitAndReload(page, () => page.getByRole('button', { name: 'Post', exact: true }).click())
  await expect(page.getByRole('heading', { name: title })).toBeVisible()

  // Edit the words, then withdraw it.
  await cardFor(page, title, 'Archive').locator('summary', { hasText: 'Edit' }).click()
  await cardFor(page, title, 'Archive').locator('textarea').first().fill('Second wording')
  await submitAndReload(page, () => cardFor(page, title, 'Save').getByRole('button', { name: 'Save' }).click())
  await submitAndReload(page, async () => {
    await cardFor(page, title, 'Archive').getByRole('button', { name: 'Archive' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Archive', exact: true }).click()
  })

  for (const email of ['student@mock.test', 'mentor@mock.test', 'tutormentor@mock.test']) {
    const feed = await feedOf(page, email)
    expect(feed, `${email}: new`).toContain(`New announcement: ${title}`)
    expect(feed, `${email}: edited`).toContain(`Announcement updated: ${title}`)
    expect(feed, `${email}: withdrawn`).toContain(`Announcement withdrawn: ${title}`)
  }
  // The author is never told about their own post.
  expect(await feedOf(page, 'tutor@mock.test')).not.toContain(title)
})

test('an assignment whose deadline moves, and which is then withdrawn, tells the class', async ({ page }, testInfo) => {
  const title = attemptName('Journey homework', testInfo)

  await loginAs(page, 'tutor@mock.test')
  await page.goto(`/classroom/${SEED.math}/classwork`, { waitUntil: 'networkidle' })
  await page.getByPlaceholder('e.g. Chapter 4 worksheet').fill(title)
  await page.getByPlaceholder('e.g. 20').fill('20')
  await page.locator('input[type=datetime-local]').first().fill('2031-03-15T10:00')
  await submitAndReload(page, () => page.getByRole('button', { name: 'Create', exact: true }).click())
  await expect(page.getByRole('heading', { name: title })).toBeVisible()

  const card = assignmentCard(page, title)
  await card.getByRole('button', { name: 'Edit', exact: true }).click()
  await card.locator('input[type=datetime-local]').fill('2031-03-22T10:00')
  await submitAndReload(page, () => card.getByRole('button', { name: 'Save', exact: true }).click())
  await submitAndReload(page, async () => {
    await assignmentCard(page, title).getByRole('button', { name: 'Archive', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Archive', exact: true }).click()
  })

  for (const email of ['student@mock.test', 'mentor@mock.test']) {
    const feed = await feedOf(page, email)
    expect(feed, `${email}: new`).toContain(`New assignment: ${title}`)
    expect(feed, `${email}: due date`).toContain(`Due date changed: ${title}`)
    expect(feed, `${email}: withdrawn`).toContain(`Assignment withdrawn: ${title}`)
  }
})

test('reopening graded work for resubmission tells the student and their mentor', async ({ page }) => {
  await loginAs(page, 'tutor@mock.test')
  await page.goto(`/assignments/${SEED.asgMath}`, { waitUntil: 'networkidle' })

  // Sara's seeded submission may or may not be graded by now, depending on which specs ran: grade it
  // if it is not, so there is a mark to clear.
  const reopen = page.getByRole('button', { name: 'Reopen for resubmission' })
  if ((await reopen.count()) === 0) {
    await page.locator('main input[type=number]').first().fill('8')
    await submitAndReload(page, () => page.getByRole('button', { name: 'Save mark' }).first().click())
  }
  await submitAndReload(page, async () => {
    await page.getByRole('button', { name: 'Reopen for resubmission' }).first().click()
    await page.getByRole('dialog').getByRole('button', { name: 'Reopen', exact: true }).click()
  })

  expect(await feedOf(page, 'student@mock.test')).toContain('Your work was reopened for resubmission')
  expect(await feedOf(page, 'mentor@mock.test')).toContain("Sara Student's work was reopened for resubmission")
})

test('removing a document tells the class it is gone', async ({ page }, testInfo) => {
  const title = attemptName('Journey document', testInfo)

  await loginAs(page, 'tutor@mock.test')
  await page.goto(`/classroom/${SEED.math}/classwork`, { waitUntil: 'networkidle' })
  const form = page.locator('form:has-text("Upload a document")')
  await form.getByPlaceholder('e.g. Term 1 Question Paper').fill(title)
  await form.locator('input[type=file]').setInputFiles({
    name: 'journey.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]),
  })
  await form.getByRole('button', { name: 'Upload document' }).click()
  await page.getByText(title).first().waitFor({ timeout: 20000 })

  await submitAndReload(page, async () => {
    await page.locator('li').filter({ hasText: title }).getByRole('button', { name: 'Remove' }).first().click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click()
  })

  expect(await feedOf(page, 'student@mock.test')).toContain(`Document removed: ${title}`)
})

test('archiving a class and restoring it tells its students, tutors and mentors both times', async ({ page }) => {
  await loginAs(page, 'admin@mock.test')
  await page.goto(`/classroom/${SEED.science}/people`, { waitUntil: 'networkidle' })
  await submitAndReload(page, async () => {
    await page.getByRole('button', { name: /^Archive class/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Archive', exact: true }).click()
  })
  await submitAndReload(page, async () => {
    await page.getByRole('button', { name: /^Restore class/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Restore', exact: true }).click()
  })

  for (const email of ['student@mock.test', 'mentor@mock.test', 'tutor@mock.test']) {
    const feed = await feedOf(page, email)
    expect(feed, `${email}: archived`).toContain('A class was archived')
    expect(feed, `${email}: restored`).toContain('A class was restored')
  }
})

test('tutors and students can open their own finance documents without an override', async ({ page }) => {
  // Issuing a pay slip or a receipt tells its recipient and links to the page, so the page has to open.
  await loginAs(page, 'tutor@mock.test')
  await page.getByRole('link', { name: 'Pay slips' }).click()
  await expect(page).toHaveURL(/\/payslips/)
  await expect(page.getByRole('heading', { name: 'My pay slips' })).toBeVisible()

  await loginAs(page, 'student@mock.test', { clearCookies: true })
  await page.getByRole('link', { name: 'Receipts' }).click()
  await expect(page).toHaveURL(/\/receipts/)
  await expect(page.getByRole('heading', { name: 'My receipts' })).toBeVisible()

  // Each only their own kind: a tutor is not billed.
  await loginAs(page, 'tutor@mock.test', { clearCookies: true })
  await page.goto('/receipts')
  await expect(page).not.toHaveURL(/\/receipts$/)
})
