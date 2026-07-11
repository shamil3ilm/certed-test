import { describe, it, expect } from 'vitest'
import { canAccessResource } from '@/lib/auth/access'

describe('canAccessResource', () => {
  it('admin can always access', () => {
    expect(canAccessResource('admin', { isEnrolled: false, teachesClass: false })).toBe(true)
  })
  it('teacher needs to teach the course', () => {
    expect(canAccessResource('teacher', { isEnrolled: false, teachesClass: true })).toBe(true)
    expect(canAccessResource('teacher', { isEnrolled: false, teachesClass: false })).toBe(false)
  })
  it('student needs to be enrolled', () => {
    expect(canAccessResource('student', { isEnrolled: true, teachesClass: false })).toBe(true)
    expect(canAccessResource('student', { isEnrolled: false, teachesClass: false })).toBe(false)
  })
})
