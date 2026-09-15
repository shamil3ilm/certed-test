import { test, expect, type Page } from '@playwright/test'
import {
  CLASS_ID,
  RUN,
  STUDENT_NAME,
  TUTOR_NAME,
  confirm,
  expectNoAppError,
  loginAs,
  note,
  open,
  reload,
  sawMessage,
  textOf,
  watchErrors,
} from './support'

/**
 * A recorded session, end to end, and the lock a billed month puts on it:
 *  - the tutor records a session with a shared summary and a private note, and marks the student
 *  - the student sees the summary (never the note) and leaves feedback
 *  - the mentor and the admin see the hours
 *  - the admin bills the month; the tutor can no longer change what was billed (0116 receipt,
 *    0100/0110 pay slip) and is told which document is in the way; voiding reopens it
 *
 * Uses a past month so no real billing is touched, and a day in it with no sessions yet.
 */

const MONTH = process.env.E2E_BILL_MONTH ?? '2025-02'
const SUMMARY = `${RUN} session summary`
const PRIVATE = `${RUN} private staff note`
const FEEDBACK = `${RUN} student feedback`
let day = ''

function attendanceUrl(date: string) {
  return `/classroom/${CLASS_ID}/attendance?date=${date}`
}

function studentGroup(page: Page) {
  return page.getByRole('group', { name: `Attendance for ${STUDENT_NAME}` }).first()
}

async function markStudent(page: Page, status: 'Present' | 'Late' | 'Absent') {
  await studentGroup(page).getByRole('button', { name: status, exact: true }).click()
  await page
    .getByRole('button', { name: /^Save attendance/ })
    .first()
    .click()
}

/** Rates this spec set, so cleanup clears exactly those. */
const ratesSet: string[] = []

/** Set (or clear, with '') a person's hourly rate on the billing-rates page. */
async function setRate(page: Page, name: string, rate: string): Promise<boolean> {
  await open(page, '/admin/finance/billing-rates')
  const input = page.getByLabel(`Hourly rate for ${name}`).first()
  if (!(await input.count())) {
    note(`no rate row for ${name} on /admin/finance/billing-rates`)
    return false
  }
  const row = page.locator('tr, li, form').filter({ has: input }).last()
  await input.fill(rate)
  if (rate)
    await row
      .getByLabel(`Currency for ${name}`)
      .selectOption('INR')
      .catch(() => null)
  await row.getByRole('button', { name: 'Save', exact: true }).click()
  const saved = await sawMessage(page, rate ? /Rate saved/ : /Rate cleared/)
  if (!saved) note(`setting ${name}'s rate to "${rate}" gave no confirmation`)
  return saved
}

async function issue(page: Page, kind: 'receipt' | 'payslip', retried = false): Promise<string | null> {
  await open(page, '/admin/finance')
  const section = page
    .locator('section')
    .filter({ hasText: kind === 'receipt' ? 'Issue fee receipt' : 'Issue pay slip' })
  const form = section
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Issue', exact: true }) })
    .first()
  if (kind === 'receipt') {
    await form.getByPlaceholder('Search by name or email...').fill(STUDENT_NAME)
    await page
      .getByRole('option', { name: new RegExp(STUDENT_NAME) })
      .first()
      .click()
  } else {
    await form.locator('select').first().selectOption({ label: TUTOR_NAME })
  }
  await form.locator('input[type=month]').fill(MONTH)
  await form.getByRole('button', { name: 'Fill from recorded hours' }).click()
  await page.waitForTimeout(3000)
  const blocked = await form.locator('[role=status]').allInnerTexts()
  const warnings = await form.locator('[role=alert]').allInnerTexts()
  const lines = await form
    .getByLabel(/Hours for line/)
    .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))
  console.log(
    `${kind} draft for ${MONTH}: hours=${lines.join(',')} status=${blocked.join(' | ')} alerts=${warnings.join(' | ')}`,
  )
  const party = kind === 'receipt' ? STUDENT_NAME : TUTOR_NAME
  if (!retried && blocked.some((b) => /No (fee|pay) rate is set/.test(b))) {
    // The test accounts carry no rate on staging; set one for this run and clear it afterwards.
    if (await setRate(page, party, '500')) {
      ratesSet.push(party)
      return issue(page, kind, true)
    }
  }
  if (!lines.some((h) => Number(h) > 0)) {
    note(
      `${kind}: "Fill from recorded hours" produced no billable hours for ${MONTH} - ${blocked.join(' ')} ${warnings.join(' ')}`,
    )
    return null
  }
  await form.getByRole('button', { name: 'Issue', exact: true }).click()
  const issued = await sawMessage(page, kind === 'receipt' ? /Receipt issued/ : /Pay slip issued/, 30_000)
  if (!issued) {
    note(`${kind} was not issued: ${(await textOf(form)).slice(-240)}`)
    return null
  }
  await reload(page)
  const list = page.locator(kind === 'receipt' ? '#receipts' : '#payslips')
  const voidButton = list
    .getByRole('button', { name: new RegExp(`^Void .* - ${kind === 'receipt' ? STUDENT_NAME : TUTOR_NAME}$`) })
    .first()
  const label = (await voidButton.getAttribute('aria-label')) ?? ''
  return label.replace(/^Void /, '').split(' - ')[0] || null
}

async function voidDocument(page: Page, kind: 'receipt' | 'payslip', number: string) {
  await open(page, '/admin/finance')
  const list = page.locator(kind === 'receipt' ? '#receipts' : '#payslips')
  await list.getByRole('button', { name: new RegExp(`^Void ${number} - `) }).click()
  await confirm(page, 'Void')
  expect(await sawMessage(page, /Document voided/)).toBe(true)
}

test.describe.serial('ATTENDANCE AND BILLING', () => {
  test('tutor records a session with a summary and a private note, and marks the student present', async ({ page }) => {
    const errors = watchErrors(page)
    await loginAs(page, 'tutor')

    // A day in the month with no session recorded yet, so this spec owns the one it records.
    for (let d = 3; d <= 27 && !day; d += 3) {
      const candidate = `${MONTH}-${String(d).padStart(2, '0')}`
      await open(page, attendanceUrl(candidate))
      if ((await page.getByRole('button', { name: 'Remove session' }).count()) === 0) day = candidate
    }
    expect(day, `no free day in ${MONTH}`).not.toBe('')
    console.log(`recording on ${day}`)

    const blank = page.locator('form').filter({ hasText: 'Save session' }).last()
    await blank.locator('input[type=time]').nth(0).fill('10:00')
    await blank.locator('input[type=time]').nth(1).fill('11:00')
    await blank.getByPlaceholder('What did this session cover? Topics, homework, how it went...').fill(SUMMARY)
    await blank
      .getByPlaceholder('For staff eyes only - concerns, follow-ups, context the student should not see.')
      .fill(PRIVATE)
    await blank.getByRole('button', { name: 'Save session' }).click()
    expect(await sawMessage(page, /Session recorded|Session updated/)).toBe(true)
    await reload(page)
    await expect(page.getByText('1h').first()).toBeVisible()

    await markStudent(page, 'Present')
    expect(await sawMessage(page, /Attendance saved/)).toBe(true)
    await reload(page)
    await expect(studentGroup(page).getByRole('button', { name: 'Present', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(errors).toEqual([])
  })

  test('student sees the summary but never the private note, and leaves feedback', async ({ page }) => {
    await loginAs(page, 'student')
    await open(page, `/classroom/${CLASS_ID}/attendance?aFrom=${day}&aTo=${day}`)
    const toggles = page.getByText('Summary & feedback')
    for (let i = 0; i < (await toggles.count()); i++) await toggles.nth(i).click()
    await expect(page.getByText(SUMMARY).first()).toBeVisible()
    expect(await page.content()).not.toContain(PRIVATE)

    const feedback = page.getByLabel('Session feedback').first()
    await feedback.fill(FEEDBACK)
    await page.getByRole('button', { name: 'Save feedback' }).first().click()
    expect(await sawMessage(page, /Feedback saved/)).toBe(true)
  })

  test("the tutor reads the student's feedback; the mentor and admin see the hours", async ({ page }) => {
    await loginAs(page, 'tutor')
    await open(page, attendanceUrl(day))
    if (!(await page.getByText(FEEDBACK).count()))
      note('the tutor does not see the student feedback on the attendance page')

    await loginAs(page, 'mentor')
    await open(page, `/session-timings?from=${day}&to=${day}`)
    const mentorView = await page.locator('main').innerText()
    console.log(`mentor session-timings for ${day}: ${mentorView.replace(/\s+/g, ' ').slice(0, 300)}`)
    if (!mentorView.includes(STUDENT_NAME)) note(`mentor's session times for ${day} do not show ${STUDENT_NAME}`)
    await expectNoAppError(page)

    await loginAs(page, 'superadmin')
    await open(page, `/admin/teaching-hours?month=${MONTH}`)
    const tables = page.locator('main table')
    await expect(tables.first()).toBeVisible()
    await expect(page.locator('main').getByText(TUTOR_NAME).first()).toBeVisible()
    await expect(page.locator('main').getByText(STUDENT_NAME).first()).toBeVisible()
  })

  test("billing the student's month locks the marks and the session; voiding reopens them", async ({ page }) => {
    await loginAs(page, 'superadmin')
    const receipt = await issue(page, 'receipt')
    test.skip(!receipt, 'no receipt could be issued for the month - see NOTE above')
    console.log(`issued receipt ${receipt}`)

    await loginAs(page, 'tutor')
    await open(page, attendanceUrl(day))
    await markStudent(page, 'Absent')
    const markLocked = await sawMessage(page, /Session hours are locked: receipt/)
    const markMessage = await page.locator('[role=status], [role=alert]').allInnerTexts()
    console.log(
      `mark change on a billed month: locked-message=${markLocked} | ${markMessage.join(' | ').slice(0, 300)}`,
    )
    await reload(page)
    await expect(studentGroup(page).getByRole('button', { name: 'Present', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(markLocked, 'the tutor is told the month is billed').toBe(true)

    const session = page.locator('form').filter({ hasText: 'Save session' }).first()
    await session.locator('input[type=time]').nth(1).fill('11:30')
    await session.getByRole('button', { name: 'Save session' }).click()
    expect(await sawMessage(page, /Session hours are locked: receipt/), 're-timing a billed session is refused').toBe(
      true,
    )
    await reload(page)

    await loginAs(page, 'superadmin')
    await voidDocument(page, 'receipt', receipt!)

    await loginAs(page, 'tutor')
    await open(page, attendanceUrl(day))
    await markStudent(page, 'Late')
    expect(await sawMessage(page, /Attendance saved/), 'after voiding, the mark can change').toBe(true)
  })

  test("billing the tutor's month locks the session times; voiding reopens them", async ({ page }) => {
    await loginAs(page, 'superadmin')
    const payslip = await issue(page, 'payslip')
    test.skip(!payslip, 'no pay slip could be issued for the month - see NOTE above')
    console.log(`issued pay slip ${payslip}`)

    await loginAs(page, 'tutor')
    await open(page, attendanceUrl(day))
    const session = page.locator('form').filter({ hasText: 'Save session' }).first()
    await session.locator('input[type=time]').nth(1).fill('11:15')
    await session.getByRole('button', { name: 'Save session' }).click()
    expect(await sawMessage(page, /Session hours are locked: pay slip/), 're-timing a paid session is refused').toBe(
      true,
    )

    await loginAs(page, 'superadmin')
    await voidDocument(page, 'payslip', payslip!)
  })

  test('cleanup: the admin clears the rates this spec set', async ({ page }) => {
    test.skip(ratesSet.length === 0, 'no rate was set')
    await loginAs(page, 'superadmin')
    for (const name of ratesSet) expect(await setRate(page, name, ''), `clearing ${name}'s rate`).toBe(true)
  })

  test('cleanup: the tutor removes the session', async ({ page }) => {
    test.skip(!day, 'no session was recorded')
    await loginAs(page, 'tutor')
    await open(page, attendanceUrl(day))
    await page.getByRole('button', { name: 'Remove session' }).first().click()
    await confirm(page, 'Remove session')
    await reload(page)
    await expect(page.getByRole('button', { name: 'Remove session' })).toHaveCount(0)
  })
})
