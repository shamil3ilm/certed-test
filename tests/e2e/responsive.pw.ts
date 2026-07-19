import { test, expect, type Page } from '@playwright/test'
import { SEED, loginAs } from './support'

// Live responsiveness sweep: load every reachable page, as every persona, at a
// spread of device widths, and assert the page body never scrolls horizontally.
// When it does, name the widest offending elements so the fix is obvious.

const WIDTHS = [320, 375, 430, 768, 1280] // tiny phone -> phone -> large phone -> tablet -> desktop

const PAGES: Record<string, string[]> = {
  admin: [
    '/dashboard', '/classroom', `/classroom/${SEED.math}`, `/classroom/${SEED.math}/classwork`,
    `/classroom/${SEED.math}/attendance`, `/classroom/${SEED.math}/people`, '/calendar',
    '/admin/users', '/admin/finance', '/settings', `/assignments/${SEED.asgMath}`,
  ],
  tutor: [
    '/dashboard', '/classroom', `/classroom/${SEED.math}`, `/classroom/${SEED.math}/classwork`,
    `/classroom/${SEED.math}/attendance`, `/classroom/${SEED.math}/people`, '/calendar',
    '/students', '/payslips', '/settings', `/assignments/${SEED.asgMath}`,
  ],
  mentor: ['/dashboard', '/classroom', '/students', `/students/${SEED.sara}`, '/calendar', '/payslips', '/settings'],
  student: [
    '/dashboard', '/classroom', `/classroom/${SEED.math}`, `/classroom/${SEED.math}/classwork`,
    `/classroom/${SEED.math}/attendance`, `/classroom/${SEED.math}/people`, '/receipts',
    '/calendar', '/settings',
  ],
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const inner = window.innerWidth
    const overflow = document.documentElement.scrollWidth - inner
    let offenders: string[] = []
    if (overflow > 2) {
      offenders = Array.from(document.body.querySelectorAll('*'))
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter((x) => x.r.right > inner + 2 && x.r.width > 0 && x.r.height > 0)
        .sort((a, b) => b.r.right - a.r.right)
        .slice(0, 4)
        .map((x) => {
          const cls = typeof x.el.className === 'string' ? x.el.className : ''
          const sel = cls.split(/\s+/).filter(Boolean).slice(0, 3).join('.')
          return `${x.el.tagName.toLowerCase()}${sel ? '.' + sel : ''} (right=${Math.round(x.r.right)}, w=${Math.round(x.r.width)})`
        })
    }
    return { overflow, inner, offenders }
  })
}

for (const [role, paths] of Object.entries(PAGES)) {
  test(`responsive -- ${role} has no horizontal overflow`, async ({ page }) => {
    test.setTimeout(300000)
    await loginAs(page, `${role}@mock.test`)

    const failures: string[] = []
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 880 })
      for (const path of paths) {
        await page.goto(path, { waitUntil: 'domcontentloaded' }).catch(() => null)
        await page.waitForTimeout(120) // let layout settle
        const { overflow, offenders } = await measure(page)
        if (overflow > 2) {
          failures.push(`${path} @ ${w}px  -> +${overflow}px  [${offenders.join('  |  ')}]`)
        }
      }
    }
    if (failures.length) console.log(`\n===== [${role}] HORIZONTAL OVERFLOW =====\n${failures.join('\n')}\n`)
    expect(failures, `${role}: pages that scroll sideways`).toEqual([])
  })
}
