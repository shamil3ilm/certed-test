import { test, expect } from '@playwright/test'
import { loginAs } from './support'

// End-to-end coverage for the in-app messaging UI: the composer -> thread ->
// inbox flow (direct and group), and the /messages/[id] access boundary (a
// non-participant must not read someone else's thread). Runs against the
// production build in MOCK mode (seed reset before the run). Recipient policy +
// service-layer rules are unit-tested; these exercise the wired pages.

test('MESSAGING -- admin composes a direct message, opens the thread, and finds it in the inbox', async ({ page }) => {
  await loginAs(page, 'admin@mock.test')

  // Compose a new direct conversation with the tutor via the "New message" form.
  await page.goto('/messages')
  await page.selectOption('select[name=recipient_ids]', { label: 'Tarun Tutor' })
  await page.fill('input[name=body]', 'E2E direct hello')
  await page.getByRole('button', { name: 'Start', exact: true }).click()

  // Redirected into the thread, the message we just sent is rendered.
  await page.waitForURL(/\/messages\/[0-9a-f-]{36}/)
  const convId = page.url().split('/messages/')[1].split(/[/?#]/)[0]
  await expect(page.getByText('E2E direct hello')).toBeVisible()

  // The conversation is now listed in the inbox, titled with the other party.
  await page.goto('/messages')
  const row = page.locator(`a[href="/messages/${convId}"]`)
  await expect(row).toBeVisible()
  await expect(row).toContainText('Tarun Tutor')
})

test('MESSAGING -- admin starts a group thread auto-titled from its participants', async ({ page }) => {
  await loginAs(page, 'admin@mock.test')

  // Selecting more than one recipient starts a group conversation.
  await page.goto('/messages')
  await page.selectOption('select[name=recipient_ids]', [{ label: 'Tarun Tutor' }, { label: 'Sam Student' }])
  await page.fill('input[name=body]', 'E2E group kickoff')
  await page.getByRole('button', { name: 'Start group' }).click()

  await page.waitForURL(/\/messages\/[0-9a-f-]{36}/)
  await expect(page.getByText('E2E group kickoff')).toBeVisible()
  // The thread is titled by the other participants (no explicit group title set).
  await expect(page.getByRole('heading', { name: /Tarun Tutor/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Sam Student/ })).toBeVisible()
})

test('MESSAGING -- a non-participant cannot read a thread they are not in', async ({ page }) => {
  // Admin opens a conversation with Sam Student; Sara Student is not a participant.
  await loginAs(page, 'admin@mock.test')
  await page.goto('/messages')
  await page.selectOption('select[name=recipient_ids]', { label: 'Sam Student' })
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.waitForURL(/\/messages\/[0-9a-f-]{36}/)
  const convId = page.url().split('/messages/')[1].split(/[/?#]/)[0]

  // Re-login as the excluded student and try to open the thread directly. The
  // service-layer participant check (assertParticipant) rejects her, so the page
  // renders its Not Found state instead of the conversation - she never sees the
  // thread's header or composer. (We assert the observable outcome, not resp
  // .status(): notFound() here yields a 200 body rather than a 404 because the
  // portal shell - the async PortalHeader - streams before the page's notFound()
  // fires. That HTTP-status quirk is a Next.js streaming artifact; the access
  // boundary itself is what matters and is what this asserts.)
  await loginAs(page, 'student@mock.test', { clearCookies: true })
  await page.goto(`/messages/${convId}`)
  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to messages' })).toHaveCount(0)
})
