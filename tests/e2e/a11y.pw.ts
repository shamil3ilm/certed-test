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

/**
 * Open a page, and REFUSE to audit one the server never rendered.
 *
 * axe measures whatever is in the browser, and a server that failed to boot still returns a
 * document - an error page. That page has no `<title>` and no `lang` attribute, so scanning
 * it reports `document-title` and `html-has-lang` as SERIOUS violations. Six of those once
 * arrived at once, across all five marketing pages and the login screen, and read as an
 * accessibility regression; the cause was a missing `.next/server/middleware-manifest.json`
 * - the webserver had not started.
 *
 * A guard that fails dishonestly is worse than no guard: it sends the reader hunting a
 * defect that was never there, and it does so in the vocabulary of the thing being guarded,
 * which is what makes it convincing. Checking the status first makes a dead server fail AS
 * a dead server.
 */
async function open(page: Page, url: string): Promise<void> {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' })
  const status = response?.status() ?? 0
  expect(
    status,
    `${url} returned HTTP ${status || '(no response)'}, so there is no rendered page to audit. ` +
      "Any axe violations below would be the error page's, not the app's - check the " +
      '[WebServer] output for a build or boot failure before believing an a11y regression.',
  ).toBeLessThan(400)
}

async function seriousViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).disableRules(BASELINED_RULES).analyze()
  return violations
    .filter((v) => v.impact != null && BLOCKING.has(v.impact))
    .map((v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s)) - ${v.helpUrl}`)
}

test.describe('accessibility - no serious/critical WCAG 2 A/AA violations', () => {
  for (const path of ['/', '/about', '/classes', '/contact', '/blogs']) {
    test(`marketing ${path}`, async ({ page }) => {
      await open(page, `${MARKETING}${path}`)
      const found = await seriousViolations(page)
      expect(found, found.join('\n')).toEqual([])
    })
  }

  test('the gate refuses to audit a page the server did not render', async ({ page }) => {
    // Keeps `open` honest. Forced rather than provoked through the app: an unknown path is
    // redirected to a real page and answers 200, which proves nothing. Fulfilling the
    // response directly reproduces the case that actually misled us - an error STATUS
    // carrying a document with no <title>, which axe scores as a serious violation.
    await page.route('**/guard-probe', (route) =>
      route.fulfill({ status: 503, contentType: 'text/html', body: '<html><body>boom</body></html>' }),
    )
    await expect(open(page, `${MARKETING}/guard-probe`)).rejects.toThrow(/returned HTTP 503/)
  })

  test('portal login', async ({ page }) => {
    await open(page, `${PORTAL}/login`)
    const found = await seriousViolations(page)
    expect(found, found.join('\n')).toEqual([])
  })

  test('portal dashboard (authenticated)', async ({ page }) => {
    await loginAs(page, 'admin@mock.test')
    await open(page, `${PORTAL}/dashboard`)
    const found = await seriousViolations(page)
    expect(found, found.join('\n')).toEqual([])
  })
})
