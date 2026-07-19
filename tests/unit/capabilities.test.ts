import { describe, it, expect } from 'vitest'
import { getCapabilities, hasCapability, isAdminTier } from '@/lib/capabilities'
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

  it('every base role can enter the dashboard and messages', () => {
    for (const role of ['admin', 'sub_admin', 'tutor', 'student'] as const) {
      expect(hasCapability(profile(role), 'viewDashboard')).toBe(true)
      expect(hasCapability(profile(role), 'viewMessages')).toBe(true)
    }
  })

  it('aggregates capabilities across a multi-persona actor (tutor + scoped mentor)', () => {
    const caps = getCapabilities([persona('tutor'), persona('mentor')])
    expect(caps.has('viewMentees')).toBe(true) // mentor + tutor both carry it
    expect(caps.has('viewPayslips')).toBe(true) // from tutor
    expect(caps.has('viewDashboard')).toBe(true)
  })

  it('mentor persona carries only its own (scoped) capabilities', () => {
    expect(hasCapability([persona('mentor')], 'viewMentees')).toBe(true)
    expect(hasCapability([persona('mentor')], 'viewDashboard')).toBe(true)
    expect(hasCapability([persona('mentor')], 'viewFinance')).toBe(false)
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
