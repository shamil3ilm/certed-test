import { describe, it, expect } from 'vitest'
import { assertRole } from '@/lib/auth/guards'

const p = (role: string, status = 'active') =>
  ({ id: '1', email: 'a@b.c', full_name: null, role, status, class_level: null }) as any

describe('assertRole', () => {
  it('passes when role is allowed and active', () => {
    expect(() => assertRole(p('teacher'), ['teacher', 'admin'])).not.toThrow()
  })
  it('throws for disallowed role', () => {
    expect(() => assertRole(p('student'), ['teacher', 'admin'])).toThrow('forbidden')
  })
  it('throws for disabled user even with right role', () => {
    expect(() => assertRole(p('admin', 'disabled'), ['admin'])).toThrow('revoked')
  })
  it('throws when no profile (not allowlisted)', () => {
    expect(() => assertRole(null, ['student'])).toThrow('no-access')
  })
})
