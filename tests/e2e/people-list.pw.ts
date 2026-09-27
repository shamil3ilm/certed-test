import { test, expect } from '@playwright/test'
import { loginAs } from './support'

// The Users hub used to split accounts across Students / Tutors & mentors / Admins
// tabs. They are merged into one searchable "People" list, narrowed by a role strip, so an
// admin never has to guess a person's role to find them. "Mentor assignments" stays
// separate (it maps mentors<->students, not accounts).
test.describe('admin People list', () => {
  test('two tabs, a role strip that narrows the list, and legacy tab links still resolve', async ({ page }) => {
    await loginAs(page, 'admin@mock.test')
    await page.goto('/admin/users')

    // The account tabs collapsed to People + Mentor assignments.
    const tabs = page.locator('nav.border-b').getByRole('link')
    await expect(tabs.filter({ hasText: 'People' })).toHaveCount(1)
    await expect(tabs.filter({ hasText: 'Mentor assignments' })).toHaveCount(1)

    // One tab per account role. 'staff' (tutors AND mentors) is deliberately absent: a mentor
    // who also tutors would sit under two tabs at once. It stays a working URL below.
    const strip = page.getByRole('navigation', { name: 'Filter people by role' })
    await expect(strip.getByRole('link')).toHaveText(['All roles', 'Students', 'Tutors', 'Mentors', 'Admins'])
    await expect(strip.getByRole('link', { name: 'All roles' })).toHaveAttribute('aria-current', 'page')

    // Narrowing to Students is a click, and the tab marks itself current.
    await strip.getByRole('link', { name: 'Students' }).click()
    await expect(page).toHaveURL(/[?&]role=student\b/)
    await expect(strip.getByRole('link', { name: 'Students' })).toHaveAttribute('aria-current', 'page')

    // The role travels with a search, so narrowing twice does not silently widen back to
    // everyone - the hidden field in the filter bar is what carries it.
    await page.getByPlaceholder(/name or email/i).fill('zzz-no-such-person')
    await page.getByRole('button', { name: /apply/i }).click()
    await expect(page).toHaveURL(/[?&]role=student\b/)
    await expect(page).toHaveURL(/[?&]q=zzz-no-such-person\b/)

    // A bookmarked legacy ?tab=tutors lands on People pre-filtered to academic staff. That
    // filter has no tab of its own, so no tab claims to be current.
    await page.goto('/admin/users?tab=tutors')
    await expect(page).toHaveURL(/tab=tutors/)
    await expect(strip.getByRole('link', { name: 'Tutors' })).toBeVisible()
    await expect(strip.locator('[aria-current="page"]')).toHaveCount(0)

    // Mentor assignments is still its own view - no People role strip there.
    await page.goto('/admin/users?tab=mentors')
    await expect(page.getByRole('navigation', { name: 'Filter people by role' })).toHaveCount(0)
  })
})
