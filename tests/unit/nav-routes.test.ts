import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { navFor } from '@/app/(prt)/nav'
import { ALL_CAPABILITIES } from '@/lib/capabilities'

/**
 * Dead-route guardrail: every item the nav can show must resolve to a real page
 * file. This fails the build if a nav entry points at a deleted/renamed route
 * (or a route is deleted without pruning its nav entry) — the exact drift that
 * left redirect-only stubs and stale links around. Passing the full capability
 * set exercises every nav rule.
 */
const allCaps = new Set(ALL_CAPABILITIES)

describe('nav dead-route guardrail', () => {
  const items = navFor(allCaps)

  it('nav is non-empty for an all-capability actor', () => {
    expect(items.length).toBeGreaterThan(0)
  })

  it('labels /students by authority — Mentoring for the admin oversight view (viewUsers), Mentees for a mentor', () => {
    // Admin tier holds viewUsers: /students is a whole-academy mentor-oversight list.
    expect(navFor(allCaps).find((item) => item.href === '/students')?.label).toBe('Mentoring')
    // A mentor (viewMentees, no admin Users hub): /students is their own mentees.
    const mentorCaps = new Set([...ALL_CAPABILITIES].filter((c) => c !== 'viewUsers'))
    expect(navFor(mentorCaps).find((item) => item.href === '/students')?.label).toBe('Mentees')
  })

  it('collapses self-service finance items when the finance hub is present', () => {
    const hrefs = navFor(allCaps).map((item) => item.href)
    expect(hrefs).toContain('/admin/finance')
    expect(hrefs).not.toContain('/payslips')
    expect(hrefs).not.toContain('/receipts')
  })

  it.each(navFor(allCaps))('nav item "$label" ($href) maps to a real page.tsx', ({ href }) => {
    const pagePath = path.join(process.cwd(), 'src', 'app', '(prt)', href, 'page.tsx')
    expect(existsSync(pagePath), `${href} -> ${pagePath} does not exist`).toBe(true)
  })
})
