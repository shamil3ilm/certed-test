import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './support'

async function pickRecipient(page: Page, name: string) {
  const search = page.getByRole('searchbox', { name: 'To (pick one for a direct message, or several for a group)' })
  await search.fill(name)
  await page.getByRole('button', { name: new RegExp(`${name}.*(Selected|Tap to add)`) }).click()
  await search.fill('')
}

// End-to-end: an event (a new message) generates a notification the recipient sees.
// A tutor messages one of their students (a valid recipient edge); admins are out
// of scope for DMs by default, so the sender here is the tutor.
test('NOTIFICATIONS -- a student is notified of a new message', async ({ page }) => {
  await loginAs(page, 'tutor@mock.test')
  await page.goto('/messages')
  await pickRecipient(page, 'Sara Student')
  await page.getByRole('textbox', { name: 'Opening message' }).fill('Please check your homework')
  const start = page.getByRole('button', { name: 'Start', exact: true })
  await expect(start).toBeEnabled()
  await start.click()
  await page.waitForURL(/\/messages\/[0-9a-f-]{36}/)

  // The student logs in and finds the notification in their feed.
  await loginAs(page, 'student@mock.test', { clearCookies: true })
  await page.goto('/notifications')
  // Earlier tests in the suite may have messaged this student too, so assert at
  // least one "New message from ..." notification is present rather than exactly one.
  await expect(page.getByText(/New message from/).first()).toBeVisible()

  // Mark-all-read clears the list's unread state.
  await page.getByRole('button', { name: 'Mark all read' }).click()
  await expect(page.getByRole('button', { name: 'Mark all read' })).toHaveCount(0)
})
