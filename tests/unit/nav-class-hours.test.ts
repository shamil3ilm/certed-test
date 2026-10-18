import { describe, expect, it } from 'vitest'
import { isNavItemActive, navFor } from '@/app/(prt)/nav'
import { getBaseCapabilities, type Capability } from '@/lib/capabilities'

/**
 * Class hours is one destination with two tabs at two URLs: the monthly totals
 * (/admin/teaching-hours, manageClasses) and the session record they are computed from
 * (/session-timings, viewMentees). These pin what that costs nobody: the nav collapses to one
 * item only for a reader who holds both, and an override that splits the two capabilities
 * still leaves each holder an item for what they can open.
 */

const base = (personas: string[]) => new Set(getBaseCapabilities(personas.map((persona_name) => ({ persona_name }))))
const without = (caps: Set<Capability>, cap: Capability) => new Set([...caps].filter((c) => c !== cap))
const item = (caps: ReadonlySet<Capability>, href: string) => navFor(caps).find((i) => i.href === href)

describe('Class hours as one destination', () => {
  it('gives an admin one Class hours item, not a separate Session times', () => {
    const caps = base(['admin'])
    expect(item(caps, '/admin/teaching-hours')?.label).toBe('Class hours')
    expect(item(caps, '/session-timings')).toBeUndefined()
  })

  it('keeps Class hours highlighted on the Sessions tab, and on the totals themselves', () => {
    const classHours = item(base(['admin']), '/admin/teaching-hours')!
    expect(isNavItemActive(classHours, '/admin/teaching-hours')).toBe(true)
    expect(isNavItemActive(classHours, '/session-timings')).toBe(true)
    expect(isNavItemActive(classHours, '/session-timings/anything')).toBe(true)
    // A prefix that merely starts the same is a different route, not this destination.
    expect(isNavItemActive(classHours, '/session-timings-archive')).toBe(false)
    expect(isNavItemActive(classHours, '/admin/users')).toBe(false)
  })

  it('leaves a mentor exactly as they were: Session times, no Class hours', () => {
    const caps = base(['mentor'])
    expect(item(caps, '/session-timings')?.label).toBe('Session times')
    expect(item(caps, '/admin/teaching-hours')).toBeUndefined()
  })

  it('keeps Session times for someone whose manageClasses is overridden away', () => {
    // They can still open /session-timings, and Class hours is gone - so it must not be
    // hidden on the assumption that the other item covers it.
    const caps = without(base(['sub_admin']), 'manageClasses')
    expect(item(caps, '/session-timings')?.label).toBe('Session times')
    expect(item(caps, '/admin/teaching-hours')).toBeUndefined()
  })

  it('keeps Class hours for someone whose viewMentees is overridden away', () => {
    const caps = without(base(['sub_admin']), 'viewMentees')
    expect(item(caps, '/admin/teaching-hours')?.label).toBe('Class hours')
    expect(item(caps, '/session-timings')).toBeUndefined()
  })
})

describe('isNavItemActive without alsoActiveOn', () => {
  it('matches its own route and what sits beneath it, nothing else', () => {
    const users = { href: '/admin/users', label: 'Users', group: 'admin' as const }
    expect(isNavItemActive(users, '/admin/users')).toBe(true)
    expect(isNavItemActive(users, '/admin/users/abc/permissions')).toBe(true)
    expect(isNavItemActive(users, '/admin/users-export')).toBe(false)
    expect(isNavItemActive(users, '/session-timings')).toBe(false)
  })
})
