import { test, expect } from '@playwright/test'
import { attemptName, loginAs } from './support'

/**
 * After a submit, the Add-user form must still describe itself truthfully.
 *
 * React resets a form once its action completes: the uncontrolled inputs clear, and the Role
 * `<select>` goes back to its first option. `role` is React state and survives that - so without
 * the reset in AddUserForm the dropdown reads "Student" while the form still renders the fields
 * for whatever was just submitted, and the next submit posts a role the admin cannot see.
 *
 * Measured, not assumed: with that reset removed this spec reports
 * `selectValue: 'student', classVisible: false` on both paths, and fails.
 *
 * `class_level` is the discriminator because it is the ONLY student-only field - `country` and
 * `phone` render in both the student and the tutor/mentor branches, so they prove nothing. This
 * spec also cannot use `submitAndReload`: a reload re-renders from scratch and hides the very
 * mismatch it is looking for.
 */
test('the Add-user form agrees with itself after a submit', async ({ page }, testInfo) => {
  await loginAs(page, 'admin@mock.test')
  await page.goto('/admin/users')

  const add = page.locator('form', { has: page.getByRole('button', { name: 'Add user' }) })
  const roleSelect = add.locator('select[name=role]')
  const studentOnlyField = add.locator('input[name=class_level]')
  const email = attemptName('form-state', testInfo).replace(' ', '-') + '@mock.test'

  const dropdownAgreesWithFields = async () => {
    const role = await roleSelect.inputValue()
    await expect(studentOnlyField, `role reads "${role}", so the student-only field must match`).toBeVisible({
      visible: role === 'student',
    })
  }

  // A completed add: the form clears for the next person, so the role clears with it.
  await roleSelect.selectOption('tutor')
  await add.locator('input[name=email]').fill(email)
  await add.locator('input[name=full_name]').fill('Form State')
  await add.getByRole('button', { name: 'Add user' }).click()
  await expect(page.getByText(/setup code/i).first()).toBeVisible({ timeout: 15000 })
  await dropdownAgreesWithFields()

  // A refused add - the same email twice. React clears the form on this path too, so the role
  // belongs back at its default here as well.
  await roleSelect.selectOption('tutor')
  await add.locator('input[name=email]').fill(email)
  await add.getByRole('button', { name: 'Add user' }).click()
  await expect(page.getByText(/already exists/i).first()).toBeVisible({ timeout: 15000 })
  await dropdownAgreesWithFields()
})
