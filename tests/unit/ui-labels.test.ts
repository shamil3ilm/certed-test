import { describe, it, expect } from 'vitest'
import { roleLabel, statusLabel, mentoringSectionLabel, staffRoleLabel, personaLabel } from '@/lib/ui/labels'

const persona = (persona_name: string, scope_type = 'global', status = 'active') => ({
  persona_name,
  scope_type,
  status,
})

describe('roleLabel', () => {
  it('maps each role, defaulting unknown/empty to Student', () => {
    expect(roleLabel('tutor')).toBe('Tutor')
    expect(roleLabel('mentor')).toBe('Mentor')
    expect(roleLabel('admin')).toBe('Super Admin')
    expect(roleLabel('sub_admin')).toBe('Sub Admin')
    expect(roleLabel('student')).toBe('Student')
    expect(roleLabel(null)).toBe('Student')
    expect(roleLabel(undefined)).toBe('Student')
  })
})

describe('statusLabel', () => {
  it('is empty for nullish, else capitalised', () => {
    expect(statusLabel(null)).toBe('')
    expect(statusLabel('')).toBe('')
    expect(statusLabel('active')).toBe('Active')
    expect(statusLabel('pending')).toBe('Pending')
  })
})

describe('mentoringSectionLabel', () => {
  it('reads as oversight vs personal', () => {
    expect(mentoringSectionLabel(true)).toBe('Mentoring')
    expect(mentoringSectionLabel(false)).toBe('Mentees')
  })
})

describe('staffRoleLabel', () => {
  it('collapses the teaching-mentor hybrid to one label from either side', () => {
    expect(staffRoleLabel({ role: 'mentor', teaches: true })).toBe('Tutor & Mentor')
    expect(staffRoleLabel({ role: 'mentor', teaches: false })).toBe('Mentor')
    expect(staffRoleLabel({ role: 'tutor', mentors: true })).toBe('Tutor & Mentor')
    expect(staffRoleLabel({ role: 'tutor', mentors: false })).toBe('Tutor')
    expect(staffRoleLabel({ role: 'admin' })).toBe('Super Admin') // falls through to roleLabel
  })
})

describe('personaLabel', () => {
  it('returns the highest-privilege label across active personas', () => {
    expect(personaLabel([persona('admin')])).toBe('Super Admin')
    expect(personaLabel([persona('sub_admin')])).toBe('Sub Admin')
    expect(personaLabel([persona('tutor'), persona('mentor')])).toBe('Tutor & Mentor')
    expect(personaLabel([persona('tutor')])).toBe('Tutor')
    expect(personaLabel([persona('mentor')])).toBe('Mentor')
    expect(personaLabel([persona('student')])).toBe('Student')
    expect(personaLabel([])).toBe('Student')
  })

  it('ignores non-global admin/tutor and inactive personas', () => {
    expect(personaLabel([persona('admin', 'class')])).toBe('Student') // admin only counts when global
    expect(personaLabel([persona('tutor', 'global', 'inactive')])).toBe('Student')
    // a mentor scoped to a student (not global) still counts as mentor
    expect(personaLabel([persona('mentor', 'student')])).toBe('Mentor')
  })
})
