import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './support'

async function pickRecipient(page: Page, name: string) {
  await page
    .getByRole('button', { name: /new chat|start new chat/i })
    .first()
    .click()
  const search = page.getByRole('searchbox', { name: 'To (pick one for a direct message, or several for a group)' })
  await search.fill(name)
  await page
    .getByRole('button', { name: new RegExp(name) })
    .first()
    .click()
  await search.fill('')
}

// End-to-end: an event (a new message) generates a notification the recipient sees.
// A tutor messages one of their students (a valid recipient edge); admins are out
// of scope for DMs by default, so the sender here is the tutor.
test('NOTIFICATIONS -- a student is notified of a new message', async ({ page }) => {
  await loginAs(page, 'tutor@mock.test')
  await page.goto('/messages')
  await pickRecipient(page, 'Sara Student')
  const start = page.getByRole('button', { name: 'Start', exact: true })
  await expect(start).toBeEnabled()
  await start.click()
  await page.waitForURL(/\/messages\/[0-9a-f-]{36}/)
  // A second message follows, so that opening ONE notification below still leaves something
  // unread for the mark-all-read assertion at the end - that control only renders while unread
  // remain. Each send waits for the composer to clear before the next one is typed: filling it
  // while the previous send is still in flight loses the text and the message never arrives.
  const composer = page.getByRole('textbox', { name: 'Message' })
  for (const body of ['Please check your homework', 'And bring your workbook']) {
    await expect(composer).toHaveValue('')
    await composer.fill(body)
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText(body).first()).toBeVisible()
  }

  // The student logs in and finds the notification in their feed.
  await loginAs(page, 'student@mock.test', { clearCookies: true })
  await page.goto('/notifications')
  // Earlier tests in the suite may have messaged this student too, so assert at
  // least one "New message from ..." notification is present rather than exactly one.
  await expect(page.getByText(/New message from/).first()).toBeVisible()

  // Opening ONE notification marks THAT one read and follows where it points. Before this,
  // every row was a plain link: it navigated and left the notification unread, so the badge
  // only ever cleared via mark-all-read.
  await page.goto('/notifications?state=unread')
  const unread = page.locator('ul li form button')
  const before = await unread.count()
  expect(before, 'the messages above should have produced unread notifications').toBeGreaterThan(1)
  await unread.first().click()
  // It should land on the conversation the notification is about, not back on the list.
  await expect(page).toHaveURL(/\/messages\//)

  // Asserted by COUNT, not by matching the row's text: both messages above produce a
  // notification titled "New message from Tarun Tutor", so a text filter would still match the
  // one that is legitimately still unread.
  await page.goto('/notifications?state=unread')
  await expect(
    page.locator('ul li form button'),
    'opening a notification must take exactly one row out of the unread list',
  ).toHaveCount(before - 1)

  // Mark-all-read clears what is left.
  await page.getByRole('button', { name: 'Mark all read' }).click()
  await expect(page.getByRole('button', { name: 'Mark all read' })).toHaveCount(0)
})
