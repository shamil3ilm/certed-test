import { test, expect } from '@playwright/test'
import { SEED, loginAs, attemptName } from './support'

/**
 * Adding a subject from the Classes page, in the dialog, without leaving it.
 *
 * The CTA was a plain link to the student directory, so the only way to create a class was to
 * find the student first. This covers the create it replaces: the dialog opens, the add lands,
 * and the new class is in the list behind it.
 *
 * The action returns STATE rather than redirecting (the rest of class-actions.ts redirects to
 * ?error=1), precisely so the dialog survives its own result - so the assertions below are as
 * much about the dialog still being there as about the row that was written.
 */
test('ADMIN -- add a subject from the Classes page, in a dialog, and see the class appear', async ({
  page,
}, testInfo) => {
  // Unique per ATTEMPT: the mock database is reset once per run, not between retries, and a
  // student takes a subject in at most one live class - so a hard-coded name would make a
  // retry fail on "already takes", reporting the retry instead of the real failure.
  const subject = attemptName('E2E Astronomy', testInfo)

  await loginAs(page, 'admin@mock.test')
  await page.goto('/classroom')

  // The button opens a dialog. It used to navigate, which is the whole point of this spec.
  await page.getByRole('button', { name: 'Add a subject' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  // Student, Subject and Tutor - the three the class is made of. The student is chosen BY
  // VALUE and the tutor BY LABEL-independent value for the same reason journeys.pw.ts does:
  // the option text carries the person's role ("Tarun Tutor - Tutor"), which is presentation.
  await dialog.locator('select[name=student_id]').selectOption(SEED.sara)
  await dialog.locator('input[name=subject]').fill(subject)
  await dialog.locator('select[name=tutor_id]').selectOption(SEED.tutor)
  await dialog.getByRole('button', { name: 'Add subject' }).click()

  // The success line names the student AND the subject, because it is the created class's own
  // name. role=status is the AlertBanner's success tone.
  await expect(dialog.getByRole('status')).toContainText(subject)
  await expect(dialog.getByRole('status')).toContainText('Sara Student')

  // Still open, and ready for the next one: an admin setting up a timetable adds several in a
  // row, so only the subject field clears and the student stays selected.
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('input[name=subject]')).toHaveValue('')
  await expect(dialog.locator('select[name=student_id]')).toHaveValue(SEED.sara)

  // Close it and the class is in the list underneath. Reloaded rather than trusted to the
  // action's own revalidation, which this mock/host setup does not refresh reliably (the
  // reason support.ts has submitAndReload at all).
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.reload()

  const group = page.getByRole('group').filter({ hasText: 'Sara Student' }).first()
  await group.locator('summary').click()
  // A RegExp, not the bare string: the card's accessible name carries its status and tutor
  // line too, and `name` as a string matches the WHOLE name.
  await expect(group.getByRole('link', { name: new RegExp(subject) })).toBeVisible()

  // Enrolling is something its people have to hear: the student that they were added, their mentor that
  // their mentee was, and the tutor that they now teach it. It used to say nothing at all.
  for (const [email, notice] of [
    ['student@mock.test', 'You were added to a class'],
    ['mentor@mock.test', 'Sara Student was added to a class'],
    ['tutor@mock.test', 'You were assigned to a class'],
  ] as const) {
    await loginAs(page, email, { clearCookies: true })
    await page.goto('/notifications', { waitUntil: 'networkidle' })
    await expect(page.getByText(notice).first(), `${email} should hear: ${notice}`).toBeVisible()
  }
})
