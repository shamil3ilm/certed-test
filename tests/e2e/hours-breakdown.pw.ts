import { test, expect, type Page } from '@playwright/test'
import { loginAs, openTimesAndNotes, sessionForm, submitAndReload, SEED } from './support'

/**
 * E2E for the hours breakdown: a session has a TYPE, an exam can be monitored by someone other
 * than the tutor, and each persona sees the right slice of the result - including a mentor's
 * full view of a mentee.
 *
 * The unit tests (hours-breakdown.test.ts, session-kind.test.ts) pin the arithmetic and the
 * rules. What only a real write -> real read proves is that the form actually sends the type and
 * the monitor, that they survive the round trip, and that every page reads them back - so this
 * records a regular class, a demo and an exam through the real form, marks attendance, and reads
 * the numbers off the real pages.
 *
 * It works on a day of its own. The mock database is shared by every spec in the run, and many
 * of them treat "the first session on today's page" as theirs; sessions recorded here would
 * silently become that session. Recording is also idempotent, because the database is reset once
 * per run, not per retry. Assertions are about the relationship between what was recorded and
 * what is reported, never an absolute total.
 */

const DAY = '2026-03-10'
const MONTH = '2026-03'
const ATTENDANCE = `/classroom/${SEED.math}/attendance?date=${DAY}`
const MONITOR = 'Maya Mentor'

function parseHours(text: string): number {
  const hours = /(\d+)h/.exec(text)
  const minutes = /(\d+)m/.exec(text)
  return (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0)
}

/** The figure printed in the stat card with this label (the line beneath its name). */
function stat(page: Page, label: string) {
  return page.locator('p', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::p[1]')
}

/** Record one session through the blank form at the foot of the attendance page. */
async function recordSession(
  page: Page,
  opts: { kind: 'regular' | 'demo' | 'exam'; start: string; end: string; monitor?: string },
) {
  // With sessions already on the day, the blank form is folded behind this disclosure.
  const another = page.locator('summary', { hasText: 'Record another session' })
  if ((await another.count()) > 0) await another.click()
  const form = page.locator('form').filter({ hasText: 'Save session' }).last()
  await form.getByLabel('Session type').selectOption(opts.kind)
  if (opts.monitor) await form.getByLabel('Monitored by').selectOption({ label: opts.monitor })
  const times = form.locator('input[type="time"]')
  await times.nth(0).fill(opts.start)
  await times.nth(1).fill(opts.end)
  await submitAndReload(page, () => form.getByRole('button', { name: 'Save session' }).click())
}

test('an admin records a regular class, a demo and an exam monitored by someone else, and marks the student present', async ({
  page,
}) => {
  await loginAs(page, 'admin@mock.test')
  await page.goto(ATTENDANCE)

  // The monitor choice exists only for an exam - a regular session has no such field.
  const probe = page.locator('form').filter({ hasText: 'Save session' }).last()
  await expect(probe.getByLabel('Monitored by')).toHaveCount(0)

  await test.step('record the three sessions', async () => {
    if ((await page.locator('article').count()) === 0) {
      await recordSession(page, { kind: 'regular', start: '10:00', end: '11:00' })
    }
    const demos = page.locator('article').filter({ has: page.locator('header').getByText('Demo', { exact: true }) })
    if ((await demos.count()) === 0) await recordSession(page, { kind: 'demo', start: '06:00', end: '06:30' })
    const exams = page.locator('article').filter({ hasText: `monitored by ${MONITOR}` })
    if ((await exams.count()) === 0) {
      await recordSession(page, { kind: 'exam', start: '06:45', end: '07:45', monitor: MONITOR })
    }
    // The session's own card says what it was and who monitored it.
    await expect(
      page
        .locator('article')
        .filter({ hasText: `monitored by ${MONITOR}` })
        .first(),
    ).toContainText('Exam')
    await expect(
      page
        .locator('article')
        .filter({ has: page.locator('header').getByText('Demo', { exact: true }) })
        .first(),
    ).toBeVisible()
  })

  await test.step('mark the student present in each, so there are hours to receive', async () => {
    const rosters = await page.getByRole('button', { name: 'Mark all present' }).count()
    expect(rosters, 'one roster per recorded session').toBeGreaterThanOrEqual(3)
    for (let i = 0; i < rosters; i++) {
      await page.getByRole('button', { name: 'Mark all present' }).nth(i).click()
      await submitAndReload(page, () =>
        page
          .getByRole('button', { name: /Save attendance/ })
          .nth(i)
          .click(),
      )
    }
  })

  await test.step('Class hours credits the exam to its monitor and keeps demo apart', async () => {
    await page.goto(`/admin/teaching-hours?month=${MONTH}`)
    const worked = page.getByRole('table', { name: 'Hours worked, by tutor and mentor' })
    await expect(worked).toBeVisible()

    // Columns: name, Sessions, Regular, Exam, Demo, Working.
    const monitorRow = worked.locator('tbody tr', { hasText: MONITOR })
    await expect(monitorRow).toHaveCount(1)
    expect(parseHours(await monitorRow.locator('td').nth(3).innerText()), 'monitor Exam').toBeGreaterThanOrEqual(60)
    expect(parseHours(await monitorRow.locator('td').last().innerText()), 'monitor Working').toBeGreaterThanOrEqual(60)

    // The demo belongs to whichever tutor the class's session was recorded against - an admin
    // recording it gets the class's first assigned tutor - so find the row rather than name one.
    // That tutor's Working is regular + exam: the demo is in its own column and not added in.
    const rows = worked.locator('tbody tr')
    let demoRows = 0
    for (let i = 0; i < (await rows.count()); i++) {
      const cells = rows.nth(i).locator('td')
      const demo = parseHours(await cells.nth(4).innerText())
      if (demo < 30) continue
      demoRows += 1
      const regular = parseHours(await cells.nth(2).innerText())
      const exam = parseHours(await cells.nth(3).innerText())
      expect(parseHours(await cells.last().innerText()), 'Working excludes demo').toBe(regular + exam)
    }
    expect(demoRows, 'exactly one person is credited the demo').toBe(1)

    // The student side keeps the three kinds apart, per student.
    const received = page.getByRole('table', { name: 'Hours received, by student' })
    const sara = received.locator('tbody tr', { hasText: 'Sara Student' })
    await expect(sara).toHaveCount(1)
    expect(parseHours(await sara.locator('td').nth(1).innerText()), 'Sara Regular').toBeGreaterThanOrEqual(60)
    expect(parseHours(await sara.locator('td').nth(2).innerText()), 'Sara Demo').toBeGreaterThanOrEqual(30)
    expect(parseHours(await sara.locator('td').nth(3).innerText()), 'Sara Exam').toBeGreaterThanOrEqual(60)
  })

  await test.step('the Session times list says which sessions were a demo or an exam', async () => {
    await page.goto(`/session-timings?student=${SEED.sara}&from=${DAY}&to=${DAY}`)
    await expect(page.getByRole('columnheader', { name: 'Type' })).toBeVisible()
    await expect(page.getByText(`Monitored by ${MONITOR}`).first()).toBeVisible()
  })
})

test('a tutor can record an exam but is not offered a different monitor - that is an admin act', async ({ page }) => {
  await loginAs(page, 'tutor@mock.test')
  await page.goto(ATTENDANCE)
  const another = page.locator('summary', { hasText: 'Record another session' })
  if ((await another.count()) > 0) await another.click()
  const form = page.locator('form').filter({ hasText: 'Save session' }).last()
  await form.getByLabel('Session type').selectOption('exam')
  // No choice of monitor, and the reason is on the page rather than in a refusal after saving.
  await expect(form.getByLabel('Monitored by')).toHaveCount(0)
  await expect(form.getByText('An admin records it if someone else monitored.')).toBeVisible()
})

test('a mentor sees what they monitored, and a full breakdown of each mentee', async ({ page }) => {
  await loginAs(page, 'mentor@mock.test')

  await test.step('their own work: the exam they monitored, as working time, with the student', async () => {
    await page.goto(`/my-hours?month=${MONTH}`)
    await expect(page.getByRole('heading', { name: 'My hours' })).toBeVisible()
    expect(parseHours(await stat(page, 'Working hours').innerText())).toBeGreaterThanOrEqual(60)
    expect(parseHours(await stat(page, 'Exam monitoring').innerText())).toBeGreaterThanOrEqual(60)
    const ledger = page.getByRole('table', { name: 'Sessions this month' })
    await expect(ledger.locator('tbody tr', { hasText: 'You monitored it' }).first()).toContainText('Sara Student')
  })

  await test.step('a roll-up of their mentees, one row each', async () => {
    const mentees = page.getByRole('table', { name: 'Hours received, by mentee' })
    await expect(mentees).toBeVisible()
    const sara = mentees.locator('tbody tr', { hasText: 'Sara Student' })
    await expect(sara).toHaveCount(1)
    expect(parseHours(await sara.locator('td').nth(3).innerText()), 'Sara Exam').toBeGreaterThanOrEqual(60)
    // Another mentee is listed too, whatever they received.
    await expect(mentees.locator('tbody tr', { hasText: 'Sam Student' })).toHaveCount(1)
  })

  await test.step('opening a mentee gives the full breakdown: kinds, tutors, monitor, every session', async () => {
    await page.getByRole('link', { name: 'Sara Student' }).first().click()
    await expect(page).toHaveURL(new RegExp(`/students/${SEED.sara}`))
    const hours = page.locator('#hours')
    await expect(hours.getByText('Exams monitored by').first()).toBeVisible()
    await expect(hours.getByRole('table', { name: 'Hours received, by mentee' })).toHaveCount(0)

    const ledger = hours.getByRole('table', { name: 'Sessions this month' })
    await expect(ledger).toBeVisible()
    // The regular class, the demo and the exam are all listed, with the exam's monitor named.
    await expect(ledger.locator('tbody tr', { hasText: 'Demo' }).first()).toBeVisible()
    await expect(ledger.locator('tbody tr', { hasText: `Monitored by ${MONITOR}` }).first()).toContainText('Exam')
    expect(await ledger.locator('tbody tr').count()).toBeGreaterThanOrEqual(3)
    // Attendance is part of the record.
    await expect(ledger.getByText('Present').first()).toBeVisible()
  })
})

test('a student sees their own hours by kind, and every session behind them', async ({ page }) => {
  await loginAs(page, 'student@mock.test')
  await page.getByRole('link', { name: 'My hours' }).first().click()
  await expect(page).toHaveURL(/\/my-hours/)
  await page.goto(`/my-hours?month=${MONTH}`)
  await expect(page.getByRole('heading', { name: 'My hours' })).toBeVisible()

  // Hours RECEIVED, with the three kinds as separate figures.
  expect(parseHours(await stat(page, 'Regular').innerText())).toBeGreaterThanOrEqual(60)
  expect(parseHours(await stat(page, 'Demo').innerText())).toBeGreaterThanOrEqual(30)
  expect(parseHours(await stat(page, 'Exam').innerText())).toBeGreaterThanOrEqual(60)
  await expect(page.getByText('Exams monitored by').first()).toBeVisible()

  const ledger = page.getByRole('table', { name: 'Sessions this month' })
  await expect(ledger.locator('tbody tr', { hasText: `Monitored by ${MONITOR}` }).first()).toBeVisible()

  // A student has no mentees, and is not shown anyone else's.
  await expect(page.getByRole('table', { name: 'Hours received, by mentee' })).toHaveCount(0)
})

test('an admin is not offered My hours - Class hours is the whole-academy view', async ({ page }) => {
  await loginAs(page, 'admin@mock.test')
  await expect(page.getByRole('link', { name: 'My hours' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Class hours' }).first()).toBeVisible()
})

test('an admin opens one person month session by session, and a mentor reads the class summary on the mentee page', async ({
  page,
}) => {
  const summary = `Covered fractions ${Date.now()}`

  await test.step('a summary is written on one of the day`s sessions', async () => {
    await loginAs(page, 'admin@mock.test')
    await page.goto(ATTENDANCE)
    await openTimesAndNotes(page, 0)
    const form = sessionForm(page, 0)
    await form.getByLabel(/Session summary/).fill(summary)
    await submitAndReload(page, () => form.getByRole('button', { name: 'Save session' }).click())
    await openTimesAndNotes(page, 0)
    await expect(sessionForm(page, 0).getByLabel(/Session summary/)).toHaveValue(summary)
  })

  await test.step('Class hours opens the monitor`s month in full', async () => {
    await page.goto(`/admin/teaching-hours?month=${MONTH}`)
    await page
      .getByRole('table', { name: 'Hours worked, by tutor and mentor' })
      .getByRole('link', { name: MONITOR })
      .click()
    await expect(page).toHaveURL(/\/admin\/teaching-hours\/person\//)
    await expect(page.getByRole('heading', { name: MONITOR })).toBeVisible()
    const ledger = page.getByRole('table', { name: 'Sessions this month' })
    await expect(ledger.locator('tbody tr', { hasText: 'Sara Student' }).first()).toBeVisible()
  })

  await test.step('the mentor reads that summary under the session on the mentee page', async () => {
    await loginAs(page, 'mentor@mock.test')
    await page.goto(`/students/${SEED.sara}?hoursMonth=${MONTH}`)
    await expect(page.locator('#hours').getByText(summary)).toBeVisible()
  })

  await test.step('and the student reads it too', async () => {
    await loginAs(page, 'student@mock.test')
    await page.goto(`/my-hours?month=${MONTH}`)
    await expect(page.getByText(summary)).toBeVisible()
  })
})

test('the calendar shows the sessions that were held, for staff and for the student who attended', async ({ page }) => {
  // The three sessions the first test recorded on 10 March: a regular class, a demo and an exam.
  // Each is either the timetable slot it filled (a "... held" item) or an item of its own - never lost.
  const held = async () => {
    const res = await page.evaluate(async (month) => {
      const r = await fetch(`/api/calendar?from=${month}-01&to=${month}-31`)
      return (await r.json()).data.items as Array<{ title: string; held?: boolean; source: string; start: string }>
    }, MONTH)
    return res.filter((i) => i.held && i.start.startsWith(DAY))
  }

  await loginAs(page, 'admin@mock.test')
  const admin = await held()
  expect(admin.length, 'regular, demo and exam are all on the calendar').toBeGreaterThanOrEqual(3)
  expect(admin.some((i) => /\(exam\)|held$/.test(i.title))).toBe(true)

  await loginAs(page, 'student@mock.test')
  const student = await held()
  expect(student.length, 'Sara attended all three').toBeGreaterThanOrEqual(3)

  await page.goto(`/calendar`, { waitUntil: 'networkidle' })
  await expect(page.getByRole('button', { name: /Held session/ })).toBeVisible()
})
