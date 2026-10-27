import { test, expect, type Page } from '@playwright/test'
import { loginAs, submitAndReload, SEED } from './support'

/**
 * E2E for who hears about, and can find, a document.
 *
 * Which rows the DATABASE returns to which persona is RLS, proved on real Postgres by
 * scripts/test-rls.sh; mock mode has no RLS. What only a real upload -> real read proves here is the
 * reach the application adds on top: a tutor uploads through the real form, and the co-tutor, the
 * mentor and the student each find (or correctly do not find) it in their notifications; the mentor
 * also finds it on their dashboard and on the mentee's page.
 *
 * Cast: Tarun and Tessa teach Maths, Sara is its student, Maya mentors Sara.
 */

async function upload(page: Page, title: string, visibility: 'Whole class' | 'Staff only') {
  await page.goto(`/classroom/${SEED.math}/classwork`, { waitUntil: 'networkidle' })
  const form = page.locator('form:has-text("Upload a document")')
  await form.getByPlaceholder('e.g. Term 1 Question Paper').fill(title)
  await form.getByLabel('Visibility').selectOption({ label: visibility })
  await form.locator('input[type=file]').setInputFiles({
    name: 'reach.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]),
  })
  await form.getByRole('button', { name: 'Upload document' }).click()
  await page.getByText(title).first().waitFor({ timeout: 20000 })
}

async function notificationsText(page: Page, email: string): Promise<string> {
  await loginAs(page, email)
  await page.goto('/notifications', { waitUntil: 'networkidle' })
  return page.locator('main').innerText()
}

test('an upload reaches the co-tutor, the mentor and the student - and a staff-only one never the student', async ({
  page,
}) => {
  // Stamped, so a retry or a repeat run on the same mock database never finds the last one's titles.
  const stamp = Date.now()
  const shared = `REACH whole class ${stamp}`
  const staffOnly = `REACH staff only ${stamp}`

  await loginAs(page, 'tutor@mock.test')
  await upload(page, shared, 'Whole class')
  await upload(page, staffOnly, 'Staff only')

  const uploader = await notificationsText(page, 'tutor@mock.test')
  expect(uploader, 'the uploader is not told about their own upload').not.toContain(shared)

  const coTutor = await notificationsText(page, 'tutormentor@mock.test')
  expect(coTutor).toContain(shared)
  expect(coTutor).toContain(staffOnly)

  const mentor = await notificationsText(page, 'mentor@mock.test')
  expect(mentor).toContain(shared)
  expect(mentor).toContain(staffOnly)

  const student = await notificationsText(page, 'student@mock.test')
  expect(student).toContain(shared)
  expect(student, 'a staff-only document must not surface to the student, even as a notification').not.toContain(
    staffOnly,
  )

  // The mentor can also find both without waiting for a notification: on the mentee's page ...
  await loginAs(page, 'mentor@mock.test')
  await page.goto(`/students/${SEED.sara}`, { waitUntil: 'networkidle' })
  const panel = page.locator('section#documents')
  await expect(panel.getByText(shared, { exact: true })).toBeVisible()
  await expect(panel.getByText(staffOnly, { exact: true })).toBeVisible()
  await expect(
    panel
      .locator('li')
      .filter({ has: page.getByRole('link', { name: staffOnly, exact: true }) })
      .getByText('Staff only', { exact: true }),
  ).toBeVisible()

  // ... and on their dashboard.
  await page.goto('/dashboard', { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: 'Recent uploads' })).toBeVisible()
})

/** POST/PATCH/DELETE a JSON call from inside the signed-in browser, so the session cookie rides along. */
async function api(page: Page, method: string, path: string, body?: unknown) {
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

test('a cancellation reaches the co-tutor, the mentor and the student, and the attendance page flags the date', async ({
  page,
}) => {
  const stamp = Date.now()
  const title = `REACH Maths cancelled ${stamp}`
  // A date of its own for every run, so neither another spec's session nor an earlier run's
  // cancellation on the mock database is the one the page finds first.
  const day = new Date(Date.UTC(2031, 0, 1) + (stamp % 3000) * 86_400_000).toISOString().slice(0, 10)
  const date = day
  const quietDate = new Date(Date.parse(`${day}T00:00:00Z`) + 3001 * 86_400_000).toISOString().slice(0, 10)

  await loginAs(page, 'tutor@mock.test')
  const created = await api(page, 'POST', '/api/events', {
    title,
    event_date: date,
    kind: 'cancellation',
    class_id: SEED.math,
  })
  expect(created.status, 'the tutor may cancel their own class').toBe(201)

  const uploader = await notificationsText(page, 'tutor@mock.test')
  expect(uploader, 'the person who cancelled is not told').not.toContain(title)
  for (const email of ['tutormentor@mock.test', 'mentor@mock.test', 'student@mock.test']) {
    expect(await notificationsText(page, email), `${email} hears about the cancellation`).toContain(
      `Class cancelled: ${title}`,
    )
  }

  await loginAs(page, 'tutor@mock.test')
  await page.goto(`/classroom/${SEED.math}/attendance?date=${date}`, { waitUntil: 'networkidle' })
  await expect(page.getByText(/the calendar says this class was cancelled on this date/i)).toBeVisible()
  await expect(page.getByText(title)).toBeVisible()

  // The same page on a date with no cancellation carries no warning.
  await page.goto(`/classroom/${SEED.math}/attendance?date=${quietDate}`, { waitUntil: 'networkidle' })
  await expect(page.getByText(/the calendar says this class was cancelled/i)).toHaveCount(0)
})

test('an event moved and then removed is told to the co-tutor, the mentor and the student, not the one who changed it', async ({
  page,
}) => {
  const stamp = Date.now()
  const title = `REACH Quiz ${stamp}`

  await loginAs(page, 'tutor@mock.test')
  const created = await api(page, 'POST', '/api/events', {
    title,
    event_date: '2031-06-01',
    kind: 'event',
    class_id: SEED.math,
  })
  expect(created.status).toBe(201)
  const id = (created.data as { id: string }).id

  // A new date is something people plan around; a description is not.
  expect((await api(page, 'PATCH', `/api/events/${id}`, { description: 'Bring a calculator' })).status).toBe(200)
  expect((await api(page, 'PATCH', `/api/events/${id}`, { event_date: '2031-06-03' })).status).toBe(200)
  expect((await api(page, 'DELETE', `/api/events/${id}`)).status).toBe(200)

  const author = await notificationsText(page, 'tutor@mock.test')
  expect(author, 'the person who made the changes is told nothing').not.toContain(title)

  for (const email of ['tutormentor@mock.test', 'mentor@mock.test', 'student@mock.test']) {
    const text = await notificationsText(page, email)
    expect(text, `${email}: told of the new event`).toContain(`New event: ${title}`)
    expect(text, `${email}: told the date moved`).toContain(`Event changed: ${title}`)
    expect(text, `${email}: told it was removed`).toContain(`Event removed: ${title}`)
    // The description-only edit added nothing: exactly one "changed" notice for this title.
    expect(text.split(`Event changed: ${title}`).length - 1, `${email}: one change notice`).toBe(1)
  }
})

test('a mentor who mutes the routine "present" notice still hears about an absence', async ({ page }) => {
  // Dates of their own, so earlier runs' attendance on the shared mock database cannot answer for these.
  const stamp = Date.now()
  const day = (offset: number) =>
    new Date(Date.UTC(2032, 0, 1) + ((stamp % 3000) + offset) * 86_400_000).toISOString().slice(0, 10)
  const before = day(0)
  const after = day(3001)
  const MUTED = 'Attendance: mentee marked present'

  const mark = async (date: string, status: 'Present' | 'Absent') => {
    await loginAs(page, 'tutor@mock.test')
    await page.goto(`/classroom/${SEED.math}/attendance?date=${date}`, { waitUntil: 'networkidle' })
    await page.getByRole('group', { name: 'Attendance for Sara Student' }).getByRole('button', { name: status }).click()
    await submitAndReload(page, () =>
      page
        .getByRole('button', { name: /Save attendance/ })
        .first()
        .click(),
    )
  }

  await test.step('start from the default: the mentor wants the routine notice', async () => {
    // The mock database outlives a run, so a retry (or an earlier attempt) may have left it muted.
    await loginAs(page, 'mentor@mock.test')
    await page.goto('/settings', { waitUntil: 'networkidle' })
    const form = page.getByRole('form', { name: 'Notification settings' })
    if (!(await form.getByLabel(MUTED).isChecked())) {
      await form.getByLabel(MUTED).check()
      await form.getByRole('button', { name: 'Save notification settings' }).click()
      await expect(page.getByText('Notification settings saved.')).toBeVisible()
    }
    await expect(form.getByLabel(MUTED)).toBeChecked()
  })

  await test.step('control: before muting, a present mark reaches the mentor', async () => {
    await mark(before, 'Present')
    const text = await notificationsText(page, 'mentor@mock.test')
    expect(text).toContain('Attendance recorded for Sara Student: present')
    expect(text).toContain(before)
  })

  await test.step('the mentor turns the routine notice off in their settings', async () => {
    const form = page.getByRole('form', { name: 'Notification settings' })
    await page.goto('/settings', { waitUntil: 'networkidle' })
    const box = form.getByLabel(MUTED)
    await expect(box, 'on by default').toBeChecked()
    await box.uncheck()
    await form.getByRole('button', { name: 'Save notification settings' }).click()
    await expect(page.getByText('Notification settings saved.')).toBeVisible()
    await expect(form.getByLabel(MUTED), 'the choice is remembered').not.toBeChecked()
    // Account, sign-in and fee notices are not on offer: they are never optional.
    await expect(form.getByLabel(/security|account|finance/i)).toHaveCount(0)
  })

  await test.step('now present is silent, and an absence is not', async () => {
    await mark(after, 'Present')
    await mark(after, 'Absent')
    const text = await notificationsText(page, 'mentor@mock.test')
    expect(text, 'the absence still arrives').toContain('Attendance recorded for Sara Student: absent')
    expect(text.split(after).length - 1, 'one notice for this date: the present one was muted').toBe(1)
  })
})
