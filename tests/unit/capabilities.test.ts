import { describe, it, expect } from 'vitest'
import { getCapabilities, hasCapability, isAdminTier, resolveCapabilities } from '@/lib/capabilities'
import type { Profile } from '@/lib/auth/profile'

const profile = (role: Profile['role']) => ({ id: 'p', email: 'e@x.c', role, status: 'active' }) as Profile
const persona = (persona_name: string) => ({ persona_name })

describe('capabilities model', () => {
  it('grants each base role its distinguishing capability', () => {
    expect(hasCapability(profile('admin'), 'viewFinance')).toBe(true)
    expect(hasCapability(profile('admin'), 'manageAdminTier')).toBe(true)
    expect(hasCapability(profile('admin'), 'viewPayslips')).toBe(true)
    expect(hasCapability(profile('admin'), 'viewReceipts')).toBe(true)
    expect(hasCapability(profile('sub_admin'), 'manageUsers')).toBe(true)
    expect(hasCapability(profile('sub_admin'), 'viewCalendar')).toBe(true)
    expect(hasCapability(profile('sub_admin'), 'viewFinance')).toBe(false)
    expect(hasCapability(profile('tutor'), 'viewPayslips')).toBe(false)
    expect(hasCapability(profile('student'), 'viewReceipts')).toBe(false)
    expect(hasCapability(profile('student'), 'viewGrading')).toBe(false)
  })

  it('manageClassContent (announcements/resources/meet-links) is admin + tutor + sub_admin', () => {
    expect(hasCapability(profile('admin'), 'manageClassContent')).toBe(true)
    expect(hasCapability(profile('tutor'), 'manageClassContent')).toBe(true)
    expect(hasCapability(profile('sub_admin'), 'manageClassContent')).toBe(true)
    expect(hasCapability(profile('student'), 'manageClassContent')).toBe(false)
  })

  it('manageAttendance (marks + session times) is admin + sub_admin + tutor + mentor, not student', () => {
    expect(hasCapability(profile('admin'), 'manageAttendance')).toBe(true)
    expect(hasCapability(profile('sub_admin'), 'manageAttendance')).toBe(true)
    expect(hasCapability(profile('tutor'), 'manageAttendance')).toBe(true)
    // A dedicated mentor can correct attendance/session times for a mentee's class.
    expect(hasCapability(profile('mentor'), 'manageAttendance')).toBe(true)
    expect(hasCapability(profile('student'), 'manageAttendance')).toBe(false)
  })

  it('manageClasses (whole-class lifecycle + teaching staff) is admin + sub_admin only', () => {
    expect(hasCapability(profile('admin'), 'manageClasses')).toBe(true)
    expect(hasCapability(profile('sub_admin'), 'manageClasses')).toBe(true)
    expect(hasCapability(profile('tutor'), 'manageClasses')).toBe(false)
    expect(hasCapability(profile('mentor'), 'manageClasses')).toBe(false)
    expect(hasCapability(profile('student'), 'manageClasses')).toBe(false)
  })

  it('sub_admin is an operational admin: class management + mentoring, no finance/audit/admin-tier', () => {
    const sa = profile('sub_admin')
    for (const cap of [
      'viewClasses',
      'manageClasses',
      'manageCalendar',
      'viewGrading',
      'manageMentorships',
      'viewMentees',
    ] as const) {
      expect(hasCapability(sa, cap), `sub_admin should hold ${cap}`).toBe(true)
    }
    for (const cap of ['viewFinance', 'viewHistory', 'manageAdminTier', 'viewPayslips', 'viewReceipts'] as const) {
      expect(hasCapability(sa, cap), `sub_admin should NOT hold ${cap}`).toBe(false)
    }
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
    expect(caps.has('viewPayslips')).toBe(false)
    expect(caps.has('viewDashboard')).toBe(true)
  })

  it('mentor persona carries pastoral oversight PLUS read-only class/grading context', () => {
    expect(hasCapability([persona('mentor')], 'viewMentees')).toBe(true)
    expect(hasCapability([persona('mentor')], 'viewDashboard')).toBe(true)
    expect(hasCapability([persona('mentor')], 'viewMessages')).toBe(true)
    expect(hasCapability([persona('mentor')], 'viewCalendar')).toBe(true)
    // A mentor is an OVERSIGHT persona: it can SEE its mentees' classes and
    // grading context and EDIT attendance (marks + session times) to fix recording
    // issues, but the other write-side class powers (manage content / manage
    // calendar) belong to the tutor persona. A mentor who also teaches must hold
    // the tutor persona (or an explicit override) to gain them.
    expect(hasCapability([persona('mentor')], 'viewClasses')).toBe(true)
    expect(hasCapability([persona('mentor')], 'viewGrading')).toBe(true)
    expect(hasCapability([persona('mentor')], 'manageAttendance')).toBe(true)
    expect(hasCapability([persona('mentor')], 'manageClassContent')).toBe(false)
    expect(hasCapability([persona('mentor')], 'manageCalendar')).toBe(false)
    // Still NOT an admin-tier / finance role.
    expect(hasCapability([persona('mentor')], 'viewFinance')).toBe(false)
    expect(hasCapability([persona('mentor')], 'manageAdminTier')).toBe(false)
  })

  it('mentor role advertises pastoral oversight plus read-only class/grading context', () => {
    // A dedicated mentor account (role `mentor`) is an oversight persona: it can
    // SEE its mentees' classes and grading context, but holds no write-side
    // teaching powers (those come from the tutor persona) and no finance/admin-tier.
    expect(hasCapability(profile('mentor'), 'viewMentees')).toBe(true)
    expect(hasCapability(profile('mentor'), 'viewDashboard')).toBe(true)
    expect(hasCapability(profile('mentor'), 'viewMessages')).toBe(true)
    expect(hasCapability(profile('mentor'), 'viewCalendar')).toBe(true)
    expect(hasCapability(profile('mentor'), 'viewClasses')).toBe(true)
    expect(hasCapability(profile('mentor'), 'viewGrading')).toBe(true)
    expect(hasCapability(profile('mentor'), 'manageAttendance')).toBe(true)
    expect(hasCapability(profile('mentor'), 'manageClassContent')).toBe(false)
    expect(hasCapability(profile('mentor'), 'manageCalendar')).toBe(false)
    expect(hasCapability(profile('mentor'), 'viewPayslips')).toBe(false)
    expect(hasCapability(profile('mentor'), 'manageAdminTier')).toBe(false)
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
