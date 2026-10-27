import { test, expect, type Page } from '@playwright/test'
import { loginAs, SEED } from './support'

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
