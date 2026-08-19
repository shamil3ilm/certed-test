import { describe, it, expect } from 'vitest'
import { addUserSchema, selfProfileDetailsSchema } from '@/lib/validation/user'

const student = {
  email: 'john@example.com',
  role: 'student' as const,
  full_name: 'John',
  class_level: 'Grade 10',
  country: 'India',
}

describe('addUserSchema - person details', () => {
  it('accepts a student with class + country', () => {
    expect(addUserSchema.safeParse(student).success).toBe(true)
  })
  it('requires country for a student', () => {
    const { country: _c, ...noCountry } = student
    const r = addUserSchema.safeParse(noCountry)
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.some((i) => /country/i.test(i.message))).toBe(true)
  })
  it('requires class / grade for a student', () => {
    const { class_level: _cl, ...noClass } = student
    const r = addUserSchema.safeParse(noClass)
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.some((i) => /class/i.test(i.message))).toBe(true)
  })
  it('does NOT require country/class for a tutor', () => {
    expect(addUserSchema.safeParse({ email: 'tara@example.com', role: 'tutor', full_name: 'Tara' }).success).toBe(true)
  })
  it('accepts optional guardian / phone / joined_on', () => {
    const r = addUserSchema.safeParse({
      ...student,
      phone: '+91 99999 99999',
      guardian_name: 'Dad',
      guardian_phone: '+91 88888 88888',
      joined_on: '2026-01-15',
    })
    expect(r.success).toBe(true)
  })
  it('rejects a malformed joined_on', () => {
    expect(addUserSchema.safeParse({ ...student, joined_on: '15/01/2026' }).success).toBe(false)
  })
})

describe('selfProfileDetailsSchema - admin-only fields are excluded from self-service', () => {
  it('does not accept joined_on / country / guardian (admin-owned)', () => {
    const shape = selfProfileDetailsSchema.shape
    expect('joined_on' in shape).toBe(false)
    expect('country' in shape).toBe(false)
    expect('guardian_name' in shape).toBe(false)
  })
  it('accepts the self-completed fields', () => {
    const r = selfProfileDetailsSchema.safeParse({
      date_of_birth: '2005-06-01',
      gender: 'Female',
      phone: '+91 99999 99999',
      address: '12 Main St',
      bio: 'Loves maths',
      qualifications: 'MSc',
    })
    expect(r.success).toBe(true)
  })
})
