import { describe, it, expect } from 'vitest'
import { getCapabilities, hasCapability, isAdminTier } from '@/lib/capabilities'

const p = (role: string, status = 'active') =>
  ({ id: '1', email: 'a@b.c', full_name: null, role, status, class_level: null }) as any

describe('capabilities', () => {
  it('gives sub-admin user-management capabilities without admin-tier capability', () => {
    const subAdmin = p('sub_admin')
    expect(hasCapability(subAdmin, 'manageUsers')).toBe(true)
    expect(hasCapability(subAdmin, 'viewFinance')).toBe(false)
    expect(isAdminTier(subAdmin)).toBe(false)
  })

  it('gives admin finance and admin-tier capabilities', () => {
    const admin = p('admin')
    expect(hasCapability(admin, 'viewFinance')).toBe(true)
    expect(isAdminTier(admin)).toBe(true)
  })

  it('keeps student capabilities narrow', () => {
    const student = p('student')
    expect(getCapabilities(student).has('viewReceipts')).toBe(true)
    expect(getCapabilities(student).has('manageUsers')).toBe(false)
  })
})
