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
      'Documents',
      'Mentees',
      'Messages',
      'Calendar',
      'Users',
      'Finance',
      'History',
      'Access management',
    ])
  })

  it('keeps the sub-admin main-nav order stable', () => {
    expect(labelsFor(['sub_admin'])).toEqual(['Dashboard', 'Messages', 'Calendar', 'Users', 'Access management'])
  })

  it('keeps the tutor main-nav order stable', () => {
    expect(labelsFor(['tutor'])).toEqual(['Dashboard', 'Classes', 'Documents', 'Messages', 'Calendar'])
  })

  it('keeps the mentor main-nav order stable', () => {
    // A mentor is teaching staff for its mentees, so it now carries the tutor
    // teaching nav (Classes) alongside Mentees. Grading is a per-class tab, not
    // a top-level nav item.
    expect(labelsFor(['mentor'])).toEqual(['Dashboard', 'Classes', 'Documents', 'Mentees', 'Messages', 'Calendar'])
  })

  it('keeps the tutor-plus-mentor main-nav order stable', () => {
    expect(labelsFor(['tutor', 'mentor'])).toEqual([
      'Dashboard',
      'Classes',
      'Documents',
      'Mentees',
      'Messages',
      'Calendar',
    ])
  })

  it('keeps the student main-nav order stable', () => {
    expect(labelsFor(['student'])).toEqual(['Dashboard', 'Classes', 'Documents', 'Messages', 'Calendar'])
  })

  it('collapses self-service finance items into the finance hub when finance is present', () => {
    expect(labelsFor(['admin'])).not.toContain('Pay slips')
    expect(labelsFor(['admin'])).not.toContain('Receipts')
  })
})
