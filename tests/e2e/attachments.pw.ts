import { test, expect, type Page } from '@playwright/test'
import { attemptName, loginAs, SEED } from './support'

/**
 * Custodial attachment round-trip against the real upload + download routes in MOCK
 * mode: the file's bytes go to the (in-memory mock) academy Drive and stream back
 * through the app - never a public URL. The multipart POST runs INSIDE the browser
 * so the session cookie is attached automatically (a Node request context has no
 * cookie jar). Fine-grained READ authorization is RLS, verified on real
 * Postgres by scripts/test-rls.sh; what MOCK mode still proves here is the
 * round-trip and the app-layer write gates.
 */

// Owned by student@mock.test and ACTIVE + UNGRADED (on the open "Chapter 6 practice"
// assignment), so it still accepts work: attaching to a submission is gated on the same
// active + ungraded + open rules as recordSubmission, so the round-trip needs an open
// one - the student's other seeded submissions are graded and correctly reject attaches.
const STUDENT_SUBMISSION = 'fa000000-0000-4000-8000-000000000003'

async function uploadTo(page: Page, owner: string, ownerId: string) {
  return page.evaluate(
    async ({ owner, ownerId }) => {
      const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25]) // %PDF-1.7..
      const form = new FormData()
      form.append('file', new File([pdf], 'e2e.pdf', { type: 'application/pdf' }))
      form.append('owner', owner)
      form.append('ownerId', ownerId)
      const res = await fetch('/api/attachments', { method: 'POST', body: form })
      const json = await res.json().catch(() => null)
      return { status: res.status, id: json?.data?.id ?? null }
    },
    { owner, ownerId },
  )
}

test('custodial round-trip: student uploads to their submission, then it streams back', async ({ page }) => {
  await loginAs(page, 'student@mock.test')

  const uploaded = await uploadTo(page, 'submission', STUDENT_SUBMISSION)
  expect(uploaded.status, 'upload should be 201 Created').toBe(201)
  expect(uploaded.id).toBeTruthy()

  const download = await page.evaluate(async (id) => {
    const res = await fetch(`/api/attachments/${id}/download`)
    const buf = new Uint8Array(await res.arrayBuffer())
    return { status: res.status, first4: [...buf.slice(0, 4)], disposition: res.headers.get('content-disposition') }
  }, uploaded.id as string)

  expect(download.status).toBe(200)
  // The very bytes we uploaded streamed back through the app (%PDF magic).
  expect(download.first4).toEqual([0x25, 0x50, 0x44, 0x46])
  expect(download.disposition).toContain('e2e.pdf')
})

test('a tutor posts an announcement with a file; it renders and streams back', async ({ page }, testInfo) => {
  const title = attemptName('E2E Handout Post', testInfo)
  await loginAs(page, 'tutor@mock.test')
  await page.goto(`/classroom/${SEED.math}`)

  // Compose a plain announcement (no meeting URL) with a custodial file via the real
  // StreamComposer: the post is created, then the file is uploaded to it.
  const composer = page.locator('form:has-text("Post to the class")')
  await composer.getByPlaceholder('Title').fill(title)
  await composer.getByPlaceholder('Share something with your class...').fill('See the attached worksheet')
  await composer.getByText('Attachments & scheduling').click()
  await composer.locator('input[type=file]').setInputFiles({
    name: 'handout.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]),
  })
  // No submitAndReload: the composer create-then-attaches, then router.refresh()es,
  // so the attachment appears without a manual reload racing the upload.
  await composer.getByRole('button', { name: 'Post' }).click()

  const card = page.locator(`li:has-text("${title}")`).first()
  await expect(card.getByText('handout.pdf')).toBeVisible({ timeout: 15000 })

  // The Download link points at the access-checked streaming route; the bytes we
  // uploaded stream back through the app (%PDF magic), never a public URL.
  const href = await card.getByRole('link', { name: 'Download' }).getAttribute('href')
  const download = await page.evaluate(async (u) => {
    const res = await fetch(u)
    const buf = new Uint8Array(await res.arrayBuffer())
    return { status: res.status, first4: [...buf.slice(0, 4)] }
  }, href!)
  expect(download.status).toBe(200)
  expect(download.first4).toEqual([0x25, 0x50, 0x44, 0x46])
})

test("a student cannot attach to another student's submission (403)", async ({ page }) => {
  await loginAs(page, 'student2@mock.test')
  const { status } = await uploadTo(page, 'submission', STUDENT_SUBMISSION)
  expect(status).toBe(403)
})

test('reconcile cron: fails closed without the secret, keeps a live attachment with it', async ({ page }) => {
  await loginAs(page, 'student@mock.test')
  const uploaded = await uploadTo(page, 'submission', STUDENT_SUBMISSION)
  expect(uploaded.status).toBe(201)

  // No CRON_SECRET -> 401 (the endpoint is public-prefixed but self-guards).
  const unauth = await page.evaluate(async () => (await fetch('/api/cron/reconcile-attachments')).status)
  expect(unauth).toBe(401)

  // Authorized run returns a result and must NOT reclaim the just-uploaded ACTIVE file.
  const run = await page.evaluate(async () => {
    const res = await fetch('/api/cron/reconcile-attachments', { headers: { Authorization: 'Bearer mock-cron' } })
    return { status: res.status }
  })
  expect(run.status).toBe(200)

  const stillThere = await page.evaluate(
    async (id) => (await fetch(`/api/attachments/${id}/download`)).status,
    uploaded.id as string,
  )
  expect(stillThere, 'a live attachment survives reconciliation').toBe(200)
})

test('an unauthenticated upload is rejected, not stored', async ({ page }) => {
  await page.goto('/api/dev/logout', { waitUntil: 'domcontentloaded' }).catch(() => null)
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  const { status } = await uploadTo(page, 'submission', STUDENT_SUBMISSION)
  expect(status, 'no session -> 401, never 201').toBe(401)
})
