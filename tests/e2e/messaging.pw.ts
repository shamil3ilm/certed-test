import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './support'

async function pickRecipients(page: Page, names: string[]) {
  await page
    .getByRole('button', { name: /new chat|start new chat/i })
    .first()
    .click()
  const search = page.getByRole('searchbox', { name: 'To (pick one for a direct message, or several for a group)' })
  for (const name of names) {
    await search.fill(name)
    await page.getByRole('button', { name: new RegExp(`${name}.*(Selected|Tap to add)`) }).click()
  }
  await search.fill('')
}

// End-to-end coverage for the in-app messaging UI: the composer -> thread ->
// inbox flow (direct and group), and the /messages/[id] access boundary (a
// non-participant must not read someone else's thread). Runs against the
// production build in MOCK mode (seed reset before the run). Recipient policy +
// service-layer rules are unit-tested; these exercise the wired pages.
//
// Actor is a TUTOR, not an admin: the recipient policy scopes DMs to direct
// contacts (tutor <-> the students they teach), and admins are intentionally out
// of scope by default. Tarun teaches Sara and Sam, so they are his valid recipients.

test('MESSAGING -- a tutor composes a direct message, opens the thread, and finds it in the inbox', async ({
  page,
}) => {
  await loginAs(page, 'tutor@mock.test')

  // Compose a new direct conversation with one of the tutor's students.
  await page.goto('/messages')
  await pickRecipients(page, ['Sara Student'])
  const start = page.getByRole('button', { name: 'Start', exact: true })
  await expect(start).toBeEnabled()
  await start.click()

  // Redirected into the thread; send the first message from the thread itself.
  await page.waitForURL(/\/messages\/[0-9a-f-]{36}/)
  const convId = page.url().split('/messages/')[1].split(/[/?#]/)[0]
  await page.getByRole('textbox', { name: 'Message' }).fill('E2E direct hello')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('E2E direct hello').first()).toBeVisible()

  // The conversation is now listed in the inbox, titled with the other party.
  await page.goto('/messages')
  const row = page.locator(`a[href="/messages/${convId}"]`)
  await expect(row).toBeVisible()
  await expect(row).toContainText('Sara Student')
})

test('MESSAGING -- a tutor starts a group thread auto-titled from its participants', async ({ page }) => {
  await loginAs(page, 'tutor@mock.test')

  // Selecting more than one recipient starts a group conversation.
  await page.goto('/messages')
  await pickRecipients(page, ['Sara Student', 'Sam Student'])
  const startGroup = page.getByRole('button', { name: 'Start group' })
  await expect(startGroup).toBeEnabled()
  await startGroup.click()

  await page.waitForURL(/\/messages\/[0-9a-f-]{36}/)
  // The thread is titled by the other participants (no explicit group title set).
  await expect(page.getByRole('heading', { name: /Sara Student/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Sam Student/ })).toBeVisible()
  await page.getByRole('textbox', { name: 'Message' }).fill('E2E group kickoff')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('E2E group kickoff').first()).toBeVisible()
})

test('MESSAGING -- a non-participant cannot read a thread they are not in', async ({ page }) => {
  // The tutor opens a conversation with Sam Student; Sara Student - another of the
  // tutor's students, but NOT a participant of this thread - must not read it.
  await loginAs(page, 'tutor@mock.test')
  await page.goto('/messages')
  await pickRecipients(page, ['Sam Student'])
  const start = page.getByRole('button', { name: 'Start', exact: true })
  await expect(start).toBeEnabled()
  await start.click()
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
