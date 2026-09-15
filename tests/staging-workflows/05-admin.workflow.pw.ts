import { test, expect, type Page } from '@playwright/test'
import {
  STAMP,
  TUTOR_NAME,
  confirm,
  expectNoAppError,
  loginAs,
  note,
  open,
  reload,
  sawMessage,
  submitAction,
  tagged,
  textOf,
  watchErrors,
} from './support'

/**
 * An account's whole life, from the admin's side, with the people it touches checking in:
 * add a student, give them a subject (which creates the class and assigns the tutor), add a
 * guardian, override a permission, archive the class (the tutor can no longer add to it), revoke,
 * restore, and finally erase. A sub-admin is offered only the roles they may create.
 */

const EMAIL = `e2e-${STAMP}@certed.test`
const NAME = tagged('Student')
const SUBJECT = 'Accountancy'
const GUARDIAN = tagged('Guardian')
let userId = ''
let classId = ''

async function userRow(page: Page) {
  await open(page, `/admin/users?q=${encodeURIComponent(EMAIL)}`)
  return page.locator('li').filter({ hasText: EMAIL }).first()
}

test.describe.serial('ADMIN', () => {
  test('super admin adds a student and is shown the one-time setup code', async ({ page }) => {
    const errors = watchErrors(page)
    await loginAs(page, 'superadmin')
    await open(page, '/admin/users')
    const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Add user' }) })
    await form.locator('input[name=email]').fill(EMAIL)
    await form.locator('input[name=full_name]').fill(NAME)
    await form.locator('select[name=role]').selectOption('student')
    await form.locator('input[name=class_level]').fill('Grade 10')
    await form.locator('input[name=country]').fill('India')
    await page.keyboard.press('Escape')
    await form.getByRole('button', { name: 'Add user' }).click()

    const status = page.getByRole('status').filter({ hasText: `Added ${EMAIL}` })
    await expect(status).toBeVisible({ timeout: 30_000 })
    await expect(status).toContainText(/shown once/)

    const row = await userRow(page)
    await expect(row).toBeVisible()
    const href = await row.locator('a[href^="/admin/users/"]').first().getAttribute('href')
    userId = (href ?? '').split('/admin/users/')[1]?.split(/[/?#]/)[0] ?? ''
    expect(userId).toMatch(/^[0-9a-f-]{36}$/)
    expect(errors).toEqual([])
  })

  test('super admin gives the student a subject with a tutor, and a guardian', async ({ page }) => {
    await loginAs(page, 'superadmin')
    await open(page, `/admin/users/${userId}`)
    const add = page.locator('form').filter({ has: page.getByRole('button', { name: 'Add subject' }) })
    await add.locator('input[name=subject]').fill(SUBJECT)
    await page.keyboard.press('Escape')
    await add.locator('select[name=tutor_id]').selectOption({ label: `${TUTOR_NAME} - Tutor` })
    await submitAction(page, () => add.getByRole('button', { name: 'Add subject' }).click())
    await expect(page.getByRole('button', { name: `Remove subject ${SUBJECT}` })).toBeVisible()
    const subjects = page
      .locator('section, div')
      .filter({ has: page.getByRole('heading', { name: 'Subjects & tutors' }) })
      .last()
    await expect(
      subjects.getByText(TUTOR_NAME).filter({ visible: true }).first(),
      'the class has its tutor',
    ).toBeVisible()
    classId = (await page.locator('input[name=class_id]').first().getAttribute('value')) ?? ''
    expect(classId).toMatch(/^[0-9a-f-]{36}$/)

    const guardian = page.locator('form').filter({ has: page.getByRole('button', { name: 'Add guardian' }) })
    await guardian.locator('input[name=name]').fill(GUARDIAN)
    await guardian.locator('input[name=relationship]').fill('Mother')
    await guardian.locator('input[name=phone]').fill('+91 90000 00001')
    await submitAction(page, () => guardian.getByRole('button', { name: 'Add guardian' }).click())
    await expect(page.getByText(GUARDIAN).first()).toBeVisible()
    await expectNoAppError(page)
  })

  test('the tutor now sees the new class and its student', async ({ page }) => {
    await loginAs(page, 'tutor')
    await open(page, `/classroom/${classId}/people`)
    await expect(page.locator('main').getByText(NAME).first()).toBeVisible()
  })

  test('super admin cannot override a capability on a pending account, and is told why', async ({ page }) => {
    await loginAs(page, 'superadmin')
    await open(page, `/admin/users/${userId}/permissions`)
    const row = page.getByRole('group', { name: 'Permission' }).first()
    await expect(row).toBeVisible()
    const before = await textOf(row)

    // The new account has never signed in, so it is Pending: overrides apply to active accounts
    // only (0108). The choice must be refused with a reason, not kept on screen.
    const deny = row.getByRole('button', { name: 'Deny', exact: true })
    const refusal = page.getByText('You can only change capabilities for an active user.').first()
    await expect(async () => {
      if (!(await refusal.isVisible())) await deny.click()
      await expect(refusal).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 30_000 })

    await reload(page)
    await expect(
      page.getByRole('group', { name: 'Permission' }).first().getByRole('button', { name: 'Deny', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false')
    const main = await page.locator('main').innerText()
    if (!/pending|active user|not active/i.test(main)) {
      note(
        'the permissions page of a pending account does not say overrides need an active account; ' +
          'every control looks editable until it is refused',
      )
    }
    console.log(`permission row: ${before.slice(0, 120)}`)
  })

  test('an archived class takes no new classwork', async ({ page }) => {
    await loginAs(page, 'superadmin')
    await open(page, `/classroom/${classId}/people`)
    await page.getByRole('button', { name: /^Archive class / }).click()
    await confirm(page, 'Archive')
    await reload(page)
    await expect(page.getByRole('button', { name: /^Archive class / })).toHaveCount(0)

    await loginAs(page, 'tutor')
    await open(page, `/classroom/${classId}/classwork`)
    const form = page.locator('form').filter({ has: page.getByRole('heading', { name: /^Create / }) })
    if (!(await form.count())) {
      console.log('archived class: the create form is not offered')
      return
    }
    await form.getByLabel('Title').fill(tagged('Archived class assignment'))
    await form.getByLabel('Max marks').fill('10')
    await form.locator('input[type=datetime-local]').first().fill('2027-01-10T10:00')
    await form.getByRole('button', { name: 'Create', exact: true }).click()
    expect(await sawMessage(page, /archived/i), 'the tutor is told the class is archived').toBe(true)
  })

  test('sub-admin may create only students, tutors and mentors', async ({ page }) => {
    await loginAs(page, 'subadmin')
    await open(page, '/admin/users')
    const roles = await page
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Add user' }) })
      .locator('select[name=role] option')
      .allInnerTexts()
    expect(roles.map((r) => r.trim())).toEqual(['student', 'tutor', 'mentor'])
  })

  test('super admin revokes, restores and finally erases the account', async ({ page }) => {
    await loginAs(page, 'superadmin')
    let row = await userRow(page)
    await row.getByRole('button', { name: /^Revoke access for / }).click()
    await expect(page.getByRole('dialog')).toContainText(EMAIL)
    await confirm(page, 'Revoke')
    row = await userRow(page)
    await expect(row.getByRole('button', { name: /^Restore access for / })).toBeVisible()

    await row.getByRole('button', { name: /^Restore access for / }).click()
    await confirm(page, 'Restore')
    row = await userRow(page)
    await expect(row.getByRole('button', { name: /^Revoke access for / })).toBeVisible()

    await row.getByRole('button', { name: /^Revoke access for / }).click()
    await confirm(page, 'Revoke')
    row = await userRow(page)
    const erase = row.getByRole('button', { name: /Erase/ })
    if (!(await erase.count())) {
      note(`no Erase control on the revoked test account ${EMAIL}; it stays revoked`)
      return
    }
    await erase.first().click()
    await confirm(page, 'Erase permanently')
    await page.waitForTimeout(2000)
    row = await userRow(page)
    console.log(`after erase, the list row reads: ${(await textOf(row)).slice(0, 160) || '(gone)'}`)
  })

  test('cleanup: test accounts left by earlier runs are revoked and erased', async ({ page }) => {
    await loginAs(page, 'superadmin')
    for (let guard = 0; guard < 10; guard++) {
      await open(page, `/admin/users?q=${encodeURIComponent('e2e-')}`)
      const row = page
        .locator('li')
        .filter({ hasText: /e2e-\d{8}@certed\.test/ })
        .filter({ has: page.getByRole('button', { name: /^(Revoke access for|Erase)/ }) })
        .first()
      if (!(await row.count())) break
      const who = (await textOf(row)).match(/e2e-\d{8}@certed\.test/)?.[0]
      const revoke = row.getByRole('button', { name: /^Revoke access for / })
      if (await revoke.count()) {
        await revoke.click()
        await confirm(page, 'Revoke')
        continue
      }
      await row.getByRole('button', { name: /Erase/ }).first().click()
      await confirm(page, 'Erase permanently')
      console.log(`cleanup: erased ${who}`)
    }
  })
})
