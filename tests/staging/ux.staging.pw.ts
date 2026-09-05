import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { loginAs, settle, expectHealthyPage, type Persona } from './support'

/**
 * UI/UX quality on the DEPLOYED app: does every persona's landing surface actually render,
 * stay inside the viewport, avoid runtime errors, and meet the same a11y bar the local
 * gate enforces?
 *
 * READ-ONLY: navigation and inspection only.
 */

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const BLOCKING = new Set(['serious', 'critical'])

// Real static routes only. `/assignments` is NOT one: only `/assignments/[id]` exists,
// nothing links to the bare path, so its 404 is correct rather than a defect.
const ROUTES_FOR: Record<Persona, string[]> = {
  superadmin: [
    '/dashboard',
    '/admin/users',
    '/admin/finance',
    '/admin/history',
    '/classroom',
    '/calendar',
    '/messages',
    '/notifications',
    '/settings',
  ],
  subadmin: [
    '/dashboard',
    '/admin/users',
    '/admin/teaching-hours',
    '/classroom',
    '/calendar',
    '/messages',
    '/settings',
  ],
  tutor: [
    '/dashboard',
    '/classroom',
    '/grading',
    '/calendar',
    '/documents',
    '/messages',
    '/notifications',
    '/settings',
  ],
  mentor: ['/dashboard', '/students', '/session-timings', '/calendar', '/messages', '/settings'],
  student: [
    '/dashboard',
    '/classroom',
    '/grades',
    '/calendar',
    '/documents',
    '/messages',
    '/notifications',
    '/settings',
  ],
}

/** Runtime errors the browser reported while the page was open. */
function collectPageErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    // Ignore noise we cannot act on from a deployed target.
    if (/favicon|third-party cookie|Download the React DevTools/i.test(t)) return
    errors.push(`console: ${t}`)
  })
  return errors
}

for (const persona of Object.keys(ROUTES_FOR) as Persona[]) {
  test(`UX: ${persona} - every landing page renders, fits the viewport, and throws nothing`, async ({ page }) => {
    const errors = collectPageErrors(page)
    await loginAs(page, persona)

    const overflow: string[] = []
    const blank: string[] = []
    const stuck: string[] = []

    for (const route of ROUTES_FOR[persona]) {
      await page.goto(route, { waitUntil: 'domcontentloaded' }).catch(() => null)
      await settle(page)

      // A page that never resolves its skeleton is, to the user, a broken page.
      if (
        await page
          .locator('.animate-pulse')
          .first()
          .isVisible()
          .catch(() => false)
      )
        stuck.push(route)

      const text = (
        await page
          .locator('body')
          .innerText()
          .catch(() => '')
      ).trim()
      if (text.length < 50) blank.push(`${route} (${text.length} chars)`)

      // Horizontal overflow: the body must never be wider than the viewport.
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 })
        await page.waitForTimeout(250)
        const over = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        if (over > 2) overflow.push(`${route} @${width}px overflows by ${over}px`)
      }
      await page.setViewportSize({ width: 1280, height: 900 })
    }

    console.log(
      `[${persona}] overflow=${overflow.length} blank=${blank.length} stuck=${stuck.length} errors=${errors.length}`,
    )
    if (overflow.length) console.log(`  OVERFLOW: ${overflow.join(' | ')}`)
    if (blank.length) console.log(`  BLANK: ${blank.join(' | ')}`)
    if (stuck.length) console.log(`  STUCK SKELETON: ${stuck.join(' | ')}`)
    if (errors.length) console.log(`  ERRORS: ${[...new Set(errors)].slice(0, 5).join(' | ')}`)

    expect(blank, `pages rendered no content: ${blank.join(', ')}`).toEqual([])
    expect(stuck, `pages never finished loading: ${stuck.join(', ')}`).toEqual([])
    expect(overflow, `horizontal overflow: ${overflow.join(', ')}`).toEqual([])
    expect([...new Set(errors)], `runtime errors: ${[...new Set(errors)].join(' | ')}`).toEqual([])
  })
}

test('UX-A11Y: the signed-in dashboard has no serious/critical WCAG violations', async ({ page }) => {
  await loginAs(page, 'student')
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  await settle(page)
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze()
  const blocking = results.violations.filter((v) => BLOCKING.has(String(v.impact)))
  for (const v of blocking) console.log(`A11Y ${v.impact} ${v.id}: ${v.nodes.length} node(s) - ${v.help}`)
  expect(
    blocking.map((v) => v.id),
    'serious/critical a11y violations on /dashboard',
  ).toEqual([])
})

test('UX-A11Y: the public login page has no serious/critical WCAG violations', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await settle(page)
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze()
  const blocking = results.violations.filter((v) => BLOCKING.has(String(v.impact)))
  for (const v of blocking) console.log(`A11Y ${v.impact} ${v.id}: ${v.nodes.length} node(s) - ${v.help}`)
  expect(
    blocking.map((v) => v.id),
    'serious/critical a11y violations on /login',
  ).toEqual([])
})

test('UX-EDGE: an unknown URL returns a real not-found page, not a blank or a crash', async ({ page }) => {
  await loginAs(page, 'student')
  await page.goto('/this-route-does-not-exist-e2e', { waitUntil: 'domcontentloaded' }).catch(() => null)
  await settle(page)
  const body = await page.locator('body').innerText()
  console.log(`unknown URL rendered ${body.trim().length} chars`)
  expect(body.trim().length, 'a 404 must still render something helpful').toBeGreaterThan(20)
  expect(body.toLowerCase()).not.toContain('application error')
})

test('UX: every page carries a document title', async ({ page }) => {
  await loginAs(page, 'student')
  const missing: string[] = []
  for (const route of ['/dashboard', '/classroom', '/grades', '/calendar', '/settings']) {
    await page.goto(route, { waitUntil: 'domcontentloaded' }).catch(() => null)
    await settle(page)
    const title = (await page.title()).trim()
    if (!title || title.length < 3) missing.push(`${route} -> "${title}"`)
  }
  expect(missing, `routes without a usable <title>: ${missing.join(', ')}`).toEqual([])
})

test('UX: the marketing site renders and links to the app', async ({ page }) => {
  const marketing = process.env.STAGING_MARKETING_URL ?? 'https://staging.certedacademia.com'
  await page.goto(marketing, { waitUntil: 'domcontentloaded' })
  await settle(page)
  await expectHealthyPage(page)
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  console.log(`marketing overflow: ${over}px; title="${await page.title()}"`)
  expect(over, 'marketing site overflows horizontally').toBeLessThanOrEqual(2)
})
