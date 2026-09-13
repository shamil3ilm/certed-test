import { describe, it, expect } from 'vitest'
import { roleLabelIfUnexpected } from '@/lib/ui/labels'

/**
 * The rule behind "who actually taught this".
 *
 * A tutor column listing tutors learns nothing from "Tutor" stamped on every row - and a
 * badge on every row is skimmed past, which is exactly how the one row that matters gets
 * missed. What is worth surfacing is the exception: a mentor or an admin credited with
 * teaching hours. Both are legitimate (a mentor account may teach), so this is a label, not
 * a warning.
 *
 * Tested here rather than through the UI because no seeded account is a non-tutor with
 * recorded hours, so the badge cannot render in the E2E fixture without new seed data - and
 * the rule is the part worth pinning down, not the span it renders into.
 */
describe('roleLabelIfUnexpected', () => {
  it('says nothing when the role is the one the surface already implies', () => {
    expect(roleLabelIfUnexpected('tutor', 'tutor')).toBeNull()
  })

  it('names the role when it is NOT the expected one', () => {
    // The case the whole feature exists for: a mentor account credited with teaching hours,
    // sitting in a column headed TUTOR.
    expect(roleLabelIfUnexpected('mentor', 'tutor')).toBe('Mentor')
    expect(roleLabelIfUnexpected('admin', 'tutor')).toBe('Super Admin')
    expect(roleLabelIfUnexpected('sub_admin', 'tutor')).toBe('Sub Admin')
  })

  it('says nothing for an absent role rather than guessing one', () => {
    // A session with no recorded tutor renders "Unassigned" on its own; roleLabel() would
    // answer 'Student' for null, which would be a fabricated claim about a person who is
    // not there.
    expect(roleLabelIfUnexpected(null, 'tutor')).toBeNull()
    expect(roleLabelIfUnexpected(undefined, 'tutor')).toBeNull()
    expect(roleLabelIfUnexpected('', 'tutor')).toBeNull()
  })

  it('takes the expected role as an argument rather than assuming tutor', () => {
    // So a student column can flag a non-student the same way, without a second helper
    // whose condition has to be kept in step by hand.
    expect(roleLabelIfUnexpected('tutor', 'student')).toBe('Tutor')
    expect(roleLabelIfUnexpected('student', 'student')).toBeNull()
  })
})
