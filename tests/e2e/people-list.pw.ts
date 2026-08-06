import { test, expect } from '@playwright/test'
import { loginAs } from './support'

// The Users hub used to split accounts across Students / Tutors & mentors / Admins
// tabs. They are merged into one searchable "People" list with a Role filter, so an
// admin never has to guess a person's role to find them. "Mentor assignments" stays
// separate (it maps mentors<->students, not accounts).
test.describe('admin People list', () => {
  test('two tabs, a role filter that narrows the list, and legacy tab links still resolve', async ({ page }) => {
    await loginAs(page, 'admin@mock.test')
    await page.goto('/admin/users')

    // The account tabs collapsed to People + Mentor assignments.
    const tabs = page.locator('nav.border-b').getByRole('link')
    await expect(tabs.filter({ hasText: 'People' })).toHaveCount(1)
    await expect(tabs.filter({ hasText: 'Mentor assignments' })).toHaveCount(1)
    await expect(tabs.filter({ hasText: /^Students$/ })).toHaveCount(0)
    await expect(tabs.filter({ hasText: 'Tutors & mentors' })).toHaveCount(0)

    // The Role filter carries the five options. Scope to the filter FORM (the one
    // with the hidden `tab` field) so it isn't confused with the Add-user form's
    // own role select.
    const roleFilter = 'form:has(input[name="tab"]) select[name="role"]'
    const role = page.locator(roleFilter)
    await expect(role).toBeVisible()
    await expect(role.locator('option')).toHaveText([
      'All roles',
      'Tutors & mentors',
      'Students',
      'Tutors',
      'Mentors',
      'Admins',
    ])

    // Narrowing to Students filters the URL + list.
    await role.selectOption('student')
    await page.getByRole('button', { name: /apply/i }).click()
    await expect(page).toHaveURL(/[?&]role=student\b/)
    await expect(page.locator(roleFilter)).toHaveValue('student')

    // A bookmarked legacy ?tab=tutors lands on People pre-filtered to academic staff.
    await page.goto('/admin/users?tab=tutors')
    await expect(page.locator(roleFilter)).toHaveValue('staff')

    // Mentor assignments is still its own view — no People filter bar there.
    await page.goto('/admin/users?tab=mentors')
    await expect(page.locator(roleFilter)).toHaveCount(0)
  })
})
