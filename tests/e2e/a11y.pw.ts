import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { loginAs } from './support'

/**
 * Automated accessibility gate. Runs axe-core against representative pages and fails on
 * any SERIOUS or CRITICAL WCAG 2.0/2.1 A/AA violation - the impact levels that actually
 * block a user of assistive tech. (Minor/moderate are surfaced in the report but not
 * failed, so the gate can be introduced without a big-bang cleanup; tighten later.)
 *
 * BASELINED_RULES holds rules with PRE-EXISTING violations that are tracked as a follow-up
 * rather than blocking this gate's introduction. It is currently EMPTY: `color-contrast`
 * used to sit here for the muted-text palette, whose `text-slate-400` (2.56:1 on white)
 * failed AA everywhere it carried real text. That palette is now `text-slate-600`
 * (>=6.9:1 on every surface the app paints), so the rule is enforced. Note slate-500 is
 * NOT a safe substitute: it drops to 4.34:1 on `bg-slate-100` and fails there. Keep
 * `text-slate-400` for `placeholder:` only - a placeholder that reads as dark as a real
 * value is its own usability problem, and axe does not treat it as body text.
 */

const MARKETING = 'http://localhost:3101'
const PORTAL = 'http://localhost:3100'
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const BLOCKING = new Set(['serious', 'critical'])
const BASELINED_RULES: string[] = []

async function seriousViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).disableRules(BASELINED_RULES).analyze()
  return violations
    .filter((v) => v.impact != null && BLOCKING.has(v.impact))
    .map((v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s)) - ${v.helpUrl}`)
}

test.describe('accessibility - no serious/critical WCAG 2 A/AA violations', () => {
  for (const path of ['/', '/about', '/classes', '/contact', '/blogs']) {
    test(`marketing ${path}`, async ({ page }) => {
      await page.goto(`${MARKETING}${path}`, { waitUntil: 'domcontentloaded' })
      const found = await seriousViolations(page)
      expect(found, found.join('\n')).toEqual([])
    })
  }

  test('portal login', async ({ page }) => {
    await page.goto(`${PORTAL}/login`, { waitUntil: 'domcontentloaded' })
    const found = await seriousViolations(page)
    expect(found, found.join('\n')).toEqual([])
  })

  test('portal dashboard (authenticated)', async ({ page }) => {
    await loginAs(page, 'admin@mock.test')
    await page.goto(`${PORTAL}/dashboard`, { waitUntil: 'domcontentloaded' })
    const found = await seriousViolations(page)
    expect(found, found.join('\n')).toEqual([])
  })
})
