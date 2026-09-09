import { test, expect, type Page } from '@playwright/test'
import { SEED, loginAs } from './support'

// Live responsiveness sweep: load every reachable page, as every persona, at a
// spread of device widths, and assert the page body never scrolls horizontally.
// When it does, name the widest offending elements so the fix is obvious.

const WIDTHS = [320, 375, 430, 768, 1280] // tiny phone -> phone -> large phone -> tablet -> desktop

const PAGES: Record<string, string[]> = {
  admin: [
    '/dashboard',
    '/classroom',
    `/classroom/${SEED.math}`,
    `/classroom/${SEED.math}/classwork`,
    `/classroom/${SEED.math}/attendance`,
    `/classroom/${SEED.math}/people`,
    '/calendar',
    '/admin/users',
    `/admin/users/${SEED.sara}`, // student detail: the multi-tutor Subjects panel
    '/admin/messaging',
    '/admin/finance',
    '/settings',
    `/assignments/${SEED.asgMath}`,
  ],
  tutor: [
    // A PLAIN tutor (mentors nobody) has no viewMentees, so /students is NOT a
    // tutor route - it belongs to the mentor sweep below. Keeping it here would
    // just redirect to /dashboard and misrepresent the tutor production path.
    '/dashboard',
    '/classroom',
    `/classroom/${SEED.math}`,
    `/classroom/${SEED.math}/classwork`,
    `/classroom/${SEED.math}/attendance`,
    `/classroom/${SEED.math}/people`,
    '/calendar',
    '/payslips',
    '/settings',
    `/assignments/${SEED.asgMath}`,
  ],
  // A DEDICATED mentor (role mentor, teaches nothing) holds only viewDashboard,
  // viewMessages and viewMentees - no classes/calendar/payslips (those would redirect).
  mentor: ['/dashboard', '/messages', '/students', `/students/${SEED.sara}`, '/session-timings', '/settings'],
  student: [
    '/dashboard',
    '/classroom',
    `/classroom/${SEED.math}`,
    `/classroom/${SEED.math}/classwork`,
    `/classroom/${SEED.math}/attendance`,
    `/classroom/${SEED.math}/people`,
    '/receipts',
    '/calendar',
    '/settings',
  ],
}

/**
 * Measure horizontal overflow ONCE THE LAYOUT HAS SETTLED.
 *
 * This used to be a bare read after `waitForTimeout(120)`, which made the sweep flaky: the
 * page is navigated with `domcontentloaded`, so a measurement can land before webfonts have
 * swapped in and before the last layout pass - and a fixed 120ms is a guess that gets
 * thinner the more workers are competing for the machine. A mid-layout read reports overflow
 * no real reader would ever see, and it fails a DIFFERENT page each time, which is what made
 * it look random.
 *
 * So wait for the things that actually change metrics - fonts - and then require two
 * consecutive animation frames to agree before believing the number. Bounded, so a genuinely
 * unstable page (an animation) still returns rather than hanging.
 */
async function measure(page: Page) {
  // Some of these paths redirect after `domcontentloaded` (a persona reaching a route it
  // does not hold, which bounces to /dashboard). Settling across frames means we are still
  // inside page.evaluate when that lands, and the execution context is torn out from under
  // us. That is not a layout problem, so retry and measure the page the reader ACTUALLY ends
  // up on rather than failing the sweep.
  for (let attempt = 0; ; attempt++) {
    try {
      return await measureOnce(page)
    } catch (error) {
      if (attempt >= 2 || !String(error).includes('Execution context was destroyed')) throw error
      await page.waitForLoadState('domcontentloaded').catch(() => null)
    }
  }
}

async function measureOnce(page: Page) {
  return page.evaluate(async () => {
    await document.fonts.ready
    const width = () => document.documentElement.scrollWidth - window.innerWidth
    const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    let previous = width()
    for (let i = 0; i < 30; i++) {
      await nextFrame()
      const current = width()
      if (current === previous) break
      previous = current
    }
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
        // No sleep: measure() waits for fonts and a stable frame pair itself.
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
