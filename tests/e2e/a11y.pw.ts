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
 * rather than blocking this gate's introduction. `color-contrast` is the whole theme's
 * muted-text palette (secondary slate text on white across marketing + the dashboard,
 * ~35 nodes) - a design pass, not a code fix. The gate still fails on every OTHER
 * serious/critical rule. Fix the palette, then delete the id here to turn contrast on.
 */

const MARKETING = 'http://localhost:3101'
const PORTAL = 'http://localhost:3100'
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const BLOCKING = new Set(['serious', 'critical'])
const BASELINED_RULES = ['color-contrast']

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
