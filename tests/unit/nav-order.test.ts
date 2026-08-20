import { describe, expect, it } from 'vitest'
import { navFor } from '@/app/(prt)/nav'
import { getBaseCapabilities } from '@/lib/capabilities'

function labelsFor(personas: string[]) {
  return navFor(getBaseCapabilities(personas.map((persona_name) => ({ persona_name })))).map((item) => item.label)
}

describe('nav ordering by persona', () => {
  it('keeps the admin main-nav order stable', () => {
    expect(labelsFor(['admin'])).toEqual([
      'Dashboard',
      'Classes',
      'Grading',
      'Documents',
      'Mentoring', // admin holds viewUsers: /students is an oversight view, not "my mentees"
      'Session times',
      'Messages',
      'Calendar',
      'Users',
      'Finance',
      'History',
      'Access management',
      'Organization',
    ])
  })

  it('keeps the sub-admin main-nav order stable', () => {
    // Sub-admin is now an operational admin: class management + mentoring on top of
    // user administration (see capabilities/index.ts). Finance and History stay
    // admin-only, so they remain absent here. Organization settings are admin-only too
    // (the bank/IFSC fields the DB restricts to is_active_admin(), 0017), so despite
    // holding manageUsers a sub_admin does NOT get the Organization item.
    expect(labelsFor(['sub_admin'])).toEqual([
      'Dashboard',
      'Classes',
      'Grading',
      'Documents',
      'Mentoring',
      'Messages',
      'Calendar',
      'Users',
      'Access management',
    ])
  })

  it('keeps the tutor main-nav order stable', () => {
    expect(labelsFor(['tutor'])).toEqual(['Dashboard', 'Classes', 'Grading', 'Documents', 'Messages', 'Calendar'])
  })

  it('keeps the mentor main-nav order stable', () => {
    // A mentor is an oversight persona: it can SEE its mentees' classes and
    // grading context, so the read-only Classes and Grading items sit alongside
    // Mentees. The write-side class powers stay with the tutor persona.
    expect(labelsFor(['mentor'])).toEqual([
      'Dashboard',
      'Classes',
      'Grading',
      'Documents',
      'Mentees',
      'Session times',
      'Messages',
      'Calendar',
    ])
  })

  it('keeps the tutor-plus-mentor main-nav order stable', () => {
    expect(labelsFor(['tutor', 'mentor'])).toEqual([
      'Dashboard',
      'Classes',
      'Grading',
      'Documents',
      'Mentees',
      'Session times',
      'Messages',
      'Calendar',
    ])
  })

  it('keeps the student main-nav order stable', () => {
    expect(labelsFor(['student'])).toEqual(['Dashboard', 'Classes', 'Grades', 'Documents', 'Messages', 'Calendar'])
  })

  it('collapses self-service finance items into the finance hub when finance is present', () => {
    expect(labelsFor(['admin'])).not.toContain('Pay slips')
    expect(labelsFor(['admin'])).not.toContain('Receipts')
  })
})
