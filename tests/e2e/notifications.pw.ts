import { test, expect } from '@playwright/test'
import { loginAs } from './support'

// End-to-end: an event (a new message) generates a notification the recipient sees.
test('NOTIFICATIONS -- a student is notified of a new message', async ({ page }) => {
  await loginAs(page, 'admin@mock.test')
  await page.goto('/messages')
  await page.selectOption('select[name=recipient_ids]', { label: 'Sara Student' })
  await page.fill('input[name=body]', 'Please check your homework')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.waitForURL(/\/messages\/[0-9a-f-]{36}/)

  // The excluded student logs in and finds the notification in their feed.
  await loginAs(page, 'student@mock.test', { clearCookies: true })
  await page.goto('/notifications')
  await expect(page.getByText(/New message from/)).toBeVisible()

  // Mark-all-read clears the list's unread state.
  await page.getByRole('button', { name: 'Mark all read' }).click()
  await expect(page.getByRole('button', { name: 'Mark all read' })).toHaveCount(0)
})
