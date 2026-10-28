import { test, expect } from '@playwright/test'
import { loginAs, attemptName, SEED } from './support'

/**
 * A tutor sets a reminder for a student from the class People page. The student is told at once and
 * finds it on their dashboard, marked as assigned - nothing else could create one before this form.
 */
test('a tutor assigns a student a reminder, and the student is told and sees it', async ({ page }, testInfo) => {
  const title = attemptName('Hand in the lab write-up', testInfo)

  await loginAs(page, 'tutor@mock.test')
  await page.goto(`/classroom/${SEED.math}/people`)

  // One form per student in the class; Sara is the one this spec writes for.
  const sara = page.locator('li', { has: page.getByText('Sara Student', { exact: true }) }).first()
  await sara.getByText('Assign a reminder').click()
  await sara.getByRole('textbox', { name: 'Reminder title' }).fill(title)
  await sara.getByLabel('Remind at').fill('2030-01-15T09:00')
  await sara.getByRole('button', { name: 'Assign reminder' }).click()
  await expect(page.getByText('Reminder assigned to Sara Student')).toBeVisible()

  await loginAs(page, 'student@mock.test', { clearCookies: true })

  await page.goto('/notifications')
  await expect(page.getByText(`Reminder assigned: ${title}`).first()).toBeVisible()

  await page.goto('/dashboard')
  const row = page.locator('li', { hasText: title })
  await expect(row.first()).toBeVisible()
  await expect(row.first().getByText('Assigned')).toBeVisible()
})

test('a mentor assigns their mentee a reminder from the mentee page', async ({ page }, testInfo) => {
  const title = attemptName('Read the next chapter', testInfo)

  await loginAs(page, 'mentor@mock.test')
  await page.goto(`/students/${SEED.sara}`)

  const panel = page.locator('#reminders')
  await panel.getByText('Assign a reminder').click()
  await panel.getByRole('textbox', { name: 'Reminder title' }).fill(title)
  await panel.getByLabel('Remind at').fill('2030-02-01T10:00')
  await panel.getByRole('button', { name: 'Assign reminder' }).click()
  await expect(page.getByText('Reminder assigned to Sara Student')).toBeVisible()

  await loginAs(page, 'student@mock.test', { clearCookies: true })
  await page.goto('/notifications')
  await expect(page.getByText(`Reminder assigned: ${title}`).first()).toBeVisible()
})
