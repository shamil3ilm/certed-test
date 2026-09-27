import { describe, expect, it } from 'vitest'
import { navFor } from '@/app/(prt)/nav'
import { getBaseCapabilities } from '@/lib/capabilities'

function labelsFor(personas: string[]) {
  return navFor(getBaseCapabilities(personas.map((persona_name) => ({ persona_name })))).map((item) => item.label)
}

/**
 * The nav offers the same items to everyone who may reach them; what changes per persona is the
 * ORDER, so the first thing each reader meets is the work they came to do. Dashboard is first
 * for all of them.
 */
describe('nav ordering by persona', () => {
  it('puts running the academy first for an admin, and classwork last', () => {
    // An admin opens people, money and the record daily; a class or a grade is something they
    // occasionally look into, so the teaching cluster sits behind the rest rather than in front.
    expect(labelsFor(['admin'])).toEqual([
      'Dashboard',
      'Users',
      'Finance',
      'Class hours',
      'Access management',
      'Organization',
      'Audit log',
      'Mentoring', // admin holds viewUsers: /students is an oversight view, not "my mentees"
      'Session times',
      'Messages',
      'Classes',
      'Grading',
      'Documents',
      'Calendar',
    ])
  })

  it('orders a sub-admin the same way, minus what the tier does not hold', () => {
    // Finance, Organization and the Audit log stay admin-only, so they are absent rather than
    // reordered. "Session times" IS here: a sub_admin is oversight on the mentoring surfaces,
    // and /students and /session-timings resolve that through the same predicate.
    expect(labelsFor(['sub_admin'])).toEqual([
      'Dashboard',
      'Users',
      'Class hours',
      'Access management',
      'Mentoring',
      'Session times',
      'Messages',
      'Classes',
      'Grading',
      'Documents',
      'Calendar',
    ])
  })

  it('puts the classroom first for a tutor', () => {
    expect(labelsFor(['tutor'])).toEqual(['Dashboard', 'Classes', 'Grading', 'Documents', 'Calendar', 'Messages'])
  })

  it('puts the mentees first for a mentor, with their classes right behind', () => {
    // A mentor is an oversight persona: it can SEE its mentees' classes and grading context, so
    // the read-only Classes and Grading items follow Mentees. Write-side class powers stay with
    // the tutor persona.
    expect(labelsFor(['mentor'])).toEqual([
      'Dashboard',
      'Mentees',
      'Session times',
      'Classes',
      'Grading',
      'Documents',
      'Calendar',
      'Messages',
    ])
  })

  it('reads someone who both teaches and mentors as a mentor', () => {
    // The mentee list is the narrower, more personal surface of the two, and their classes sit
    // immediately behind it either way.
    expect(labelsFor(['tutor', 'mentor'])).toEqual([
      'Dashboard',
      'Mentees',
      'Session times',
      'Classes',
      'Grading',
      'Documents',
      'Calendar',
      'Messages',
    ])
  })

  it('puts a student in their own classes first', () => {
    expect(labelsFor(['student'])).toEqual(['Dashboard', 'Classes', 'Grades', 'Documents', 'Calendar', 'Messages'])
  })

  it('starts every persona at the Dashboard', () => {
    for (const personas of [['admin'], ['sub_admin'], ['tutor'], ['mentor'], ['tutor', 'mentor'], ['student']]) {
      expect(labelsFor(personas)[0], personas.join('+')).toBe('Dashboard')
    }
  })

  it('collapses self-service finance items into the finance hub when finance is present', () => {
    expect(labelsFor(['admin'])).not.toContain('Pay slips')
    expect(labelsFor(['admin'])).not.toContain('Receipts')
  })
})
