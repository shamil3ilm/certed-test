import { describe, it, expect } from 'vitest'
import { getCapabilities, hasCapability, isAdminTier, resolveCapabilities } from '@/lib/capabilities'
import type { Profile } from '@/lib/auth/profile'

const profile = (role: Profile['role']) => ({ id: 'p', email: 'e@x.c', role, status: 'active' }) as Profile
const persona = (persona_name: string) => ({ persona_name })

describe('capabilities model', () => {
  it('grants each base role its distinguishing capability', () => {
    expect(hasCapability(profile('admin'), 'viewFinance')).toBe(true)
    expect(hasCapability(profile('admin'), 'manageAdminTier')).toBe(true)
    expect(hasCapability(profile('sub_admin'), 'manageUsers')).toBe(true)
    expect(hasCapability(profile('sub_admin'), 'viewFinance')).toBe(false)
    expect(hasCapability(profile('tutor'), 'viewPayslips')).toBe(true)
    expect(hasCapability(profile('student'), 'viewReceipts')).toBe(true)
    expect(hasCapability(profile('student'), 'viewGrading')).toBe(false)
  })

  it('manageClassContent (announcements/resources/meet-links/attendance) is admin + tutor only', () => {
    expect(hasCapability(profile('admin'), 'manageClassContent')).toBe(true)
    expect(hasCapability(profile('tutor'), 'manageClassContent')).toBe(true)
    expect(hasCapability(profile('sub_admin'), 'manageClassContent')).toBe(false)
    expect(hasCapability(profile('student'), 'manageClassContent')).toBe(false)
  })

  it('every base role can enter the dashboard and messages', () => {
    for (const role of ['admin', 'sub_admin', 'tutor', 'student'] as const) {
      expect(hasCapability(profile(role), 'viewDashboard')).toBe(true)
      expect(hasCapability(profile(role), 'viewMessages')).toBe(true)
    }
  })

  it('a plain tutor has no mentee access; it is gained only via the mentor persona', () => {
    // Matrix rule: a tutor should not gain mentee access unless also assigned mentor.
    expect(hasCapability(profile('tutor'), 'viewMentees')).toBe(false)
    const caps = getCapabilities([persona('tutor'), persona('mentor')])
    expect(caps.has('viewMentees')).toBe(true) // only from the mentor persona
    expect(caps.has('viewPayslips')).toBe(true) // from tutor
    expect(caps.has('viewDashboard')).toBe(true)
  })

  it('mentor persona carries only student-supervision caps, never teaching', () => {
    expect(hasCapability([persona('mentor')], 'viewMentees')).toBe(true)
    expect(hasCapability([persona('mentor')], 'viewDashboard')).toBe(true)
    expect(hasCapability([persona('mentor')], 'viewMessages')).toBe(true)
    // Matrix rule: mentor must never gain class/teaching power from the assignment alone.
    expect(hasCapability([persona('mentor')], 'viewClasses')).toBe(false)
    expect(hasCapability([persona('mentor')], 'manageClassContent')).toBe(false)
    expect(hasCapability([persona('mentor')], 'viewGrading')).toBe(false)
    expect(hasCapability([persona('mentor')], 'viewFinance')).toBe(false)
  })

  it('mentor is an independent role: pastoral oversight, never teaching', () => {
    // A dedicated mentor account (role `mentor`, may not be a tutor) gets only
    // supervision caps from its role — teaching comes solely from a tutor persona.
    expect(hasCapability(profile('mentor'), 'viewMentees')).toBe(true)
    expect(hasCapability(profile('mentor'), 'viewDashboard')).toBe(true)
    expect(hasCapability(profile('mentor'), 'viewMessages')).toBe(true)
    expect(hasCapability(profile('mentor'), 'manageClassContent')).toBe(false)
    expect(hasCapability(profile('mentor'), 'viewGrading')).toBe(false)
    expect(hasCapability(profile('mentor'), 'viewPayslips')).toBe(false)
  })

  it('reserved-but-unwired personas advertise no capabilities (fail-closed)', () => {
    for (const name of ['guardian', 'finance_operator', 'assistant', 'executive']) {
      const caps = getCapabilities([persona(name)])
      expect(caps.size, `${name} must advertise nothing until it is wired end to end`).toBe(0)
    }
  })

  it('isAdminTier is admin-only', () => {
    expect(isAdminTier(profile('admin'))).toBe(true)
    expect(isAdminTier(profile('sub_admin'))).toBe(false)
    expect(isAdminTier(profile('tutor'))).toBe(false)
    expect(isAdminTier([persona('admin')])).toBe(true)
    expect(isAdminTier([persona('finance_operator')])).toBe(false)
  })
})

describe('resolveCapabilities (persona baseline + overrides)', () => {
  it('baseline only: personas confer their defaults; every source is the persona', () => {
    const r = resolveCapabilities({ personas: [persona('tutor')], overrides: [] })
    expect(r.allowed.has('manageClassContent')).toBe(true)
    expect(r.allowed.has('viewFinance')).toBe(false)
    expect(r.denied.size).toBe(0)
    expect(r.sourceByCapability.get('manageClassContent')).toBe('persona')
  })

  it('explicit allow: a sub_admin can be granted viewFinance it never had', () => {
    const r = resolveCapabilities({
      personas: [persona('sub_admin')],
      overrides: [{ capability: 'viewFinance', effect: 'allow' }],
    })
    expect(r.allowed.has('viewFinance')).toBe(true)
    expect(r.sourceByCapability.get('viewFinance')).toBe('override_allow')
  })

  it('explicit deny: a tutor can lose a baseline capability (viewMessages)', () => {
    const r = resolveCapabilities({
      personas: [persona('tutor')],
      overrides: [{ capability: 'viewMessages', effect: 'deny' }],
    })
    expect(r.allowed.has('viewMessages')).toBe(false)
    expect(r.denied.has('viewMessages')).toBe(true)
    expect(r.sourceByCapability.get('viewMessages')).toBe('override_deny')
  })

  it('conflict: deny beats allow for the same capability', () => {
    const r = resolveCapabilities({
      personas: [persona('sub_admin')],
      overrides: [
        { capability: 'viewFinance', effect: 'allow' },
        { capability: 'viewFinance', effect: 'deny' },
      ],
    })
    expect(r.allowed.has('viewFinance')).toBe(false)
    expect(r.denied.has('viewFinance')).toBe(true)
    expect(r.sourceByCapability.get('viewFinance')).toBe('override_deny')
  })

  it('hard rule: manageAdminTier is never override-grantable to a non-admin', () => {
    const r = resolveCapabilities({
      personas: [persona('sub_admin')],
      overrides: [{ capability: 'manageAdminTier', effect: 'allow' }],
    })
    expect(r.allowed.has('manageAdminTier')).toBe(false)
  })

  it('hard rule: an admin keeps manageAdminTier even against a deny override', () => {
    const r = resolveCapabilities({
      personas: [persona('admin')],
      overrides: [{ capability: 'manageAdminTier', effect: 'deny' }],
    })
    expect(r.allowed.has('manageAdminTier')).toBe(true)
    expect(r.denied.has('manageAdminTier')).toBe(false)
  })
})
