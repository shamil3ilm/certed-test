import { describe, it, expect } from 'vitest'
import { canViewDetailField } from '@/lib/profile/detail-visibility'

describe('canViewDetailField - profile detail visibility tiers', () => {
  it('admin sees every field, including admin-only joined_on', () => {
    expect(canViewDetailField('joined_on', 'admin')).toBe(true)
    expect(canViewDetailField('guardian_phone', 'admin')).toBe(true)
    expect(canViewDetailField('bio', 'admin')).toBe(true)
  })

  it('the person sees their own private fields but NOT admin-only ones', () => {
    expect(canViewDetailField('date_of_birth', 'self')).toBe(true)
    expect(canViewDetailField('address', 'self')).toBe(true)
    expect(canViewDetailField('joined_on', 'self')).toBe(false) // admin-only
  })

  it('a classmate / other sees ONLY shared fields', () => {
    expect(canViewDetailField('bio', 'other')).toBe(true) // shared
    expect(canViewDetailField('country', 'other')).toBe(true) // shared
    expect(canViewDetailField('phone', 'other')).toBe(false) // private
    expect(canViewDetailField('guardian_name', 'other')).toBe(false) // private
    expect(canViewDetailField('date_of_birth', 'other')).toBe(false) // private
    expect(canViewDetailField('joined_on', 'other')).toBe(false) // admin-only
  })
})
