import { describe, it, expect } from 'vitest'
import { roleLabel, statusLabel, mentoringSectionLabel, staffRoleLabel, personaLabel } from '@/lib/ui/labels'

const persona = (persona_name: string, scope_type = 'global', status = 'active') => ({
  persona_name,
  scope_type,
  status,
})

describe('roleLabel', () => {
  // The academy's five role names, pinned. The stored identifiers deliberately do NOT match
  // the words - `admin` reads "Super Admin" and `sub_admin` reads "Admin" - so an edit that
  // "tidies" one of these would silently rename a tier for every user. A table rather than one
  // assertion per line, so a failure names the role that broke.
  it.each([
    ['admin', 'Super Admin'],
    ['sub_admin', 'Admin'],
    ['mentor', 'Mentor'],
    ['tutor', 'Tutor'],
    ['student', 'Student'],
  ])('labels %s as %s', (role, expected) => {
    expect(roleLabel(role)).toBe(expected)
  })

  it('falls back to Student for an unknown or absent role', () => {
    expect(roleLabel('nonsense')).toBe('Student')
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
    expect(personaLabel([persona('sub_admin')])).toBe('Admin')
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
