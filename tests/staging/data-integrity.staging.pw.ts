import { test, expect } from '@playwright/test'
import { loginAs, settle } from './support'

/**
 * Logical / data-consistency checks against REAL staging data. These are the defects a
 * green functional suite still misses: a page that renders perfectly while showing a
 * number that cannot be true, a column that is always blank, or a filter boundary that
 * silently returns the wrong page.
 *
 * READ-ONLY. Several assertions are reported rather than failed where staging data is
 * simply sparse - the console lines are the deliverable.
 */

test('DATA: teaching-hours renders per-tutor rows, not an unattributed lump', async ({ page }) => {
  await loginAs(page, 'superadmin')
  await page.goto('/admin/teaching-hours', { waitUntil: 'domcontentloaded' })
  await settle(page)
  const body = await page.locator('body').innerText()

  const unassigned = (body.match(/Unassigned/g) ?? []).length
  console.log(`teaching-hours: "Unassigned" appears ${unassigned}x`)
  console.log(`teaching-hours excerpt:\n${body.slice(0, 700)}`)

  // Hours that cannot be attributed to a tutor cannot be paid to one.
  expect(unassigned, 'teaching hours attributed to "Unassigned" cannot drive per-tutor pay').toBe(0)
})

test('DATA: session-timings shows a subject and a tutor on every row', async ({ page }) => {
  await loginAs(page, 'mentor')
  await page.goto('/session-timings', { waitUntil: 'domcontentloaded' })
  await settle(page)
  const rows = page.locator('tbody tr')
  const n = await rows.count()
  console.log(`session-timings rows: ${n}`)

  const blanks: string[] = []
  for (let i = 0; i < Math.min(n, 15); i++) {
    const cells = await rows.nth(i).locator('td').allInnerTexts()
    const empty = cells.map((c, idx) => (c.trim() === '' || c.trim() === '-' ? idx : -1)).filter((x) => x >= 0)
    if (empty.length) blanks.push(`row ${i}: empty cells at ${empty.join(',')} | ${cells.join(' ~ ')}`)
  }
  if (blanks.length) console.log(`BLANK CELLS:\n  ${blanks.join('\n  ')}`)
  else console.log('no blank cells in the sampled rows')
})

test('DATA-LOGIC: no student entry time falls outside its session window', async ({ page }) => {
  await loginAs(page, 'mentor')
  await page.goto('/session-timings', { waitUntil: 'domcontentloaded' })
  await settle(page)
  const rows = page.locator('tbody tr')
  const n = await rows.count()

  const suspicious: string[] = []
  for (let i = 0; i < Math.min(n, 20); i++) {
    const text = (await rows.nth(i).innerText()).replace(/\s+/g, ' ')
    // Collect every HH:MM on the row; an entry hours before the session start is the
    // shape of the bad rows found earlier (02:45 against a 13:31-17:40 session).
    const times = [...text.matchAll(/\b(\d{1,2}):(\d{2})\b/g)].map((m) => Number(m[1]) * 60 + Number(m[2]))
    if (times.length >= 3) {
      const [entry, ...window] = times
      const start = Math.min(...window)
      if (entry < start - 60) suspicious.push(`row ${i}: ${text.slice(0, 160)}`)
    }
  }
  if (suspicious.length) console.log(`ENTRY OUTSIDE WINDOW:\n  ${suspicious.join('\n  ')}`)
  else console.log('no entry time far outside its session window in the sampled rows')
})

test('DATA-UX: the finance summary tiles read as sentences, not run-together fragments', async ({ page }) => {
  await loginAs(page, 'superadmin')
  await page.goto('/admin/finance', { waitUntil: 'domcontentloaded' })
  await settle(page)
  const body = await page.locator('body').innerText()
  console.log(`finance excerpt:\n${body.slice(0, 600)}`)

  // The earlier defect rendered as "900.00 in - 400.00 View out details": a value and a
  // link colliding into one unreadable line.
  const collided = /\bin\s*[-–]\s*[₹$]?[\d,.]+\s*View\b/i.test(body)
  expect(collided, 'a finance tile is rendering its value and its link as one run-on string').toBe(false)
})

test('DATA-EDGE: an out-of-range page number does not break the list', async ({ page }) => {
  await loginAs(page, 'superadmin')
  for (const q of ['?page=999999', '?page=0', '?page=-1', '?page=abc']) {
    await page.goto(`/admin/users${q}`, { waitUntil: 'domcontentloaded' }).catch(() => null)
    await settle(page)
    const body = (await page.locator('body').innerText()).toLowerCase()
    console.log(`/admin/users${q} -> ${body.length} chars`)
    expect(body, `${q} produced an error page`).not.toContain('application error')
    expect(body, `${q} leaked an internal error`).not.toContain('invalid input syntax')
    expect(body.length, `${q} rendered nothing`).toBeGreaterThan(50)
  }
})

test('DATA-EDGE: a hostile search string is treated as text, not as a pattern or script', async ({ page }) => {
  await loginAs(page, 'superadmin')
  const dialogs: string[] = []
  page.on('dialog', (d) => {
    dialogs.push(d.message())
    void d.dismiss()
  })
  for (const q of ['%25', "'; drop table profiles;--", '<script>alert(1)</script>', '%_%']) {
    await page.goto(`/admin/users?q=${encodeURIComponent(q)}`, { waitUntil: 'domcontentloaded' }).catch(() => null)
    await settle(page)
    const body = (await page.locator('body').innerText()).toLowerCase()
    console.log(`search ${JSON.stringify(q)} -> ${body.length} chars`)
    expect(body).not.toContain('application error')
    expect(body).not.toContain('invalid input syntax')
  }
  expect(dialogs, 'a search string executed as script').toHaveLength(0)
})

test('DATA-UX: an empty list explains itself rather than showing a bare void', async ({ page }) => {
  await loginAs(page, 'superadmin')
  // A search that matches nothing must still tell the user what happened.
  await page.goto('/admin/users?q=zzz-no-such-person-zzz', { waitUntil: 'domcontentloaded' })
  await settle(page)
  const body = await page.locator('body').innerText()
  const hasEmptyCopy = /no .*(found|yet|match)|nothing|empty/i.test(body)
  console.log(`empty-search copy present: ${hasEmptyCopy}`)
  expect(hasEmptyCopy, 'an empty result set showed no explanatory copy').toBe(true)
})

test('DATA: the notification counter matches what the notifications page lists', async ({ page }) => {
  await loginAs(page, 'student')
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  await settle(page)
  const badge = await page
    .getByRole('link', { name: /notifications/i })
    .first()
    .textContent()
    .catch(() => null)
  const claimed = Number((badge ?? '').match(/\d+/)?.[0] ?? '0')

  await page.goto('/notifications', { waitUntil: 'domcontentloaded' })
  await settle(page)
  const body = await page.locator('body').innerText()
  console.log(`header claims ${claimed} unread; notifications page has ${body.trim().length} chars`)
  // A badge promising unread items must lead to a page that actually has them.
  if (claimed > 0) {
    expect(body.trim().length, 'the unread badge led to an empty notifications page').toBeGreaterThan(80)
  }
})
