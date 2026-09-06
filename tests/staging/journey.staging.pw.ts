import { test, expect, type Page } from '@playwright/test'
import { loginAs, settle, type Persona } from './support'

/**
 * Full top-to-bottom walk of the DEPLOYED app, once per persona, from that persona's own
 * point of view.
 *
 * The route list is NOT hard-coded. Each journey reads the persona's OWN navigation out of
 * the rendered page and visits exactly what that persona is offered - which is the only
 * honest definition of "their POV", and avoids inventing routes. (A previous pass asserted
 * against an assumed list and reported `/assignments` as broken; it simply is not a route.)
 *
 * READ-ONLY. Staging holds real data other people are using: this navigates, reads and
 * reports. It never submits a form, and never creates, edits or deletes anything.
 */

type PageReport = {
  path: string
  ok: boolean
  chars: number
  heading: string | null
  errors: string[]
  note: string
}

/** Links the persona's own sidebar/nav offers, in the order they are presented. */
async function navDestinations(page: Page): Promise<string[]> {
  const hrefs = await page
    .locator('nav a[href^="/"]')
    .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href') ?? ''))
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of hrefs) {
    const path = raw.split('#')[0].split('?')[0]
    if (!path || path === '/' || seen.has(path)) continue
    seen.add(path)
    out.push(path)
  }
  return out
}

async function visitAndReport(page: Page, path: string, errors: string[]): Promise<PageReport> {
  const before = errors.length
  await page.goto(path, { waitUntil: 'domcontentloaded' }).catch(() => null)
  await settle(page)

  const landed = new URL(page.url()).pathname
  const body = (
    await page
      .locator('body')
      .innerText()
      .catch(() => '')
  ).trim()
  const heading = await page
    .locator('h1, h2')
    .first()
    .innerText()
    .catch(() => null)
  const lower = body.toLowerCase()

  const redirected = landed !== path
  const crashed =
    lower.includes('application error') || lower.includes('internal server error') || lower.includes('unhandled')
  // Match the app's OWN not-found page, not just Next's built-in string. This check was
  // originally `this page could not be found` alone, and it passed a page whose heading
  // read "Not found" with the body "This page doesn't exist, or you don't have access to
  // it." - i.e. it marked the one real defect in the walk as ok. A too-narrow health check
  // is worse than none: it reports green over the thing it was written to catch.
  const notFound =
    lower.includes('this page could not be found') ||
    lower.includes("doesn't exist, or you don't have access") ||
    (heading ?? '').trim().toLowerCase() === 'not found'
  const stuck = await page
    .locator('.animate-pulse')
    .first()
    .isVisible()
    .catch(() => false)

  const note = crashed
    ? 'CRASHED'
    : notFound
      ? '404'
      : stuck
        ? 'STUCK ON SKELETON'
        : redirected
          ? `redirected -> ${landed}`
          : body.length < 60
            ? 'NEARLY EMPTY'
            : 'ok'

  return {
    path,
    ok: !crashed && !notFound && !stuck && body.length >= 60,
    chars: body.length,
    heading: heading?.split('\n')[0]?.slice(0, 60) ?? null,
    errors: errors.slice(before),
    note,
  }
}

const PERSONAS: Persona[] = ['superadmin', 'subadmin', 'tutor', 'mentor', 'student']

for (const persona of PERSONAS) {
  test(`JOURNEY: ${persona} walks their whole app`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => {
      if (m.type() !== 'error') return
      const t = m.text()
      if (/favicon|third-party cookie|React DevTools/i.test(t)) return
      errors.push(`console: ${t}`)
    })
    page.on('response', (r) => {
      if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`)
    })

    await loginAs(page, persona)
    await settle(page)

    const nav = await navDestinations(page)
    console.log(`\n===== ${persona.toUpperCase()} =====`)
    console.log(`nav offers ${nav.length}: ${nav.join(', ')}`)

    const reports: PageReport[] = []
    for (const path of nav) {
      reports.push(await visitAndReport(page, path, errors))
    }

    // Follow ONE detail link per section, so the walk reaches past the index pages into
    // the records a persona actually spends their time in.
    const detailSeeds = ['/classroom', '/students', '/messages', '/admin/users'].filter((p) => nav.includes(p))
    for (const seed of detailSeeds) {
      await page.goto(seed, { waitUntil: 'domcontentloaded' }).catch(() => null)
      await settle(page)
      const href = await page
        .locator(`main a[href^="${seed}/"], a[href^="${seed}/"]`)
        .first()
        .getAttribute('href')
        .catch(() => null)
      if (href) reports.push(await visitAndReport(page, href.split('?')[0], errors))
    }

    for (const r of reports) {
      const flag = r.ok ? '  ' : '!!'
      console.log(
        `${flag} ${r.path.padEnd(34)} ${String(r.chars).padStart(6)}ch  ${r.note.padEnd(24)} ${r.heading ?? ''}`,
      )
    }
    const broken = reports.filter((r) => !r.ok && !r.note.startsWith('redirected'))
    const uniqueErrors = [...new Set(errors)]
    if (uniqueErrors.length) console.log(`  ERRORS: ${uniqueErrors.slice(0, 6).join(' | ')}`)
    console.log(`  -> ${reports.length} pages, ${broken.length} broken, ${uniqueErrors.length} runtime errors`)

    expect(
      broken.map((b) => `${b.path} (${b.note})`),
      `${persona} hit broken pages`,
    ).toEqual([])
    expect(uniqueErrors, `${persona} hit runtime errors`).toEqual([])
  })
}
