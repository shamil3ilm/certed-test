import { describe, it, expect } from 'vitest'
import {
  BUILT_IN_PAIRS,
  HIERARCHY_FORBIDDEN_PAIRS,
  MESSAGING_PERSONAS,
  isBuiltInPair,
  isHierarchyForbidden,
  pairKey,
  matrixAllows,
  parseMessagingMatrix,
  serializeMessagingMatrix,
  personasFromFlags,
} from '@/lib/messaging/matrix'

describe('messaging matrix', () => {
  it('pairKey is order-independent (pairs are unordered)', () => {
    expect(pairKey('student', 'tutor')).toBe(pairKey('tutor', 'student'))
    expect(pairKey('admin', 'student')).toBe('admin|student')
  })

  it('parse keeps only recognised true pairs, canonicalised', () => {
    const m = parseMessagingMatrix({
      'tutor|student': true, // reversed -> canonicalised to student|tutor
      'admin|admin': true,
      'student|tutor': false, // false is dropped
      'bogus|student': true, // unknown persona dropped
      malformed: true, // no pipe dropped
    })
    expect(matrixAllows(m, 'student', 'tutor')).toBe(true)
    expect(matrixAllows(m, 'admin', 'admin')).toBe(true)
    expect(matrixAllows(m, 'student', 'mentor')).toBe(false)
    expect(m.size).toBe(2)
  })

  it('treats null / absent / non-object as empty (direct-contacts default)', () => {
    expect(parseMessagingMatrix(null).size).toBe(0)
    expect(parseMessagingMatrix(undefined).size).toBe(0)
    expect(parseMessagingMatrix('nope').size).toBe(0)
  })

  it('serialize round-trips into a canonical enabled set', () => {
    const raw = serializeMessagingMatrix(['tutor|student', 'admin|admin'])
    expect(raw).toEqual({ 'student|tutor': true, 'admin|admin': true })
    expect(matrixAllows(parseMessagingMatrix(raw), 'student', 'tutor')).toBe(true)
  })

  it('personasFromFlags maps resolved flags to persona names', () => {
    expect(
      personasFromFlags({
        isAdmin: false,
        isSubAdmin: false,
        isTutor: true,
        hasMentorAuthority: true,
        isStudent: false,
      }),
    ).toEqual(['tutor', 'mentor'])
  })

  it('exposes the five personas', () => {
    expect([...MESSAGING_PERSONAS]).toEqual(['admin', 'sub_admin', 'tutor', 'mentor', 'student'])
  })
})

/**
 * The academy's hierarchy: students and tutors go through a mentor, and a mentor to the admins.
 * The matrix is admin-configured and global, so it is the one place a direct line from a student
 * or a tutor onto the admin tier could be switched on. These pin that it cannot be.
 */
describe('messaging matrix - the hierarchy', () => {
  it('forbids exactly the pairs that would put a student or a tutor onto the admin tier', () => {
    expect([...HIERARCHY_FORBIDDEN_PAIRS].sort()).toEqual([
      'admin|student',
      'admin|tutor',
      'student|sub_admin',
      'sub_admin|tutor',
    ])
    for (const below of ['student', 'tutor'] as const) {
      for (const tier of ['admin', 'sub_admin'] as const) {
        expect(isHierarchyForbidden(below, tier)).toBe(true)
        expect(isHierarchyForbidden(tier, below)).toBe(true)
      }
    }
    // Everything that keeps to the hierarchy stays configurable.
    expect(isHierarchyForbidden('student', 'mentor')).toBe(false)
    expect(isHierarchyForbidden('tutor', 'mentor')).toBe(false)
    expect(isHierarchyForbidden('student', 'tutor')).toBe(false)
  })

  it('a stored matrix cannot open a forbidden pair, however it was written', () => {
    // An old value saved before the rule, or a hand-edited row - reversed keys included.
    const m = parseMessagingMatrix({
      'admin|student': true,
      'tutor|admin': true,
      'sub_admin|student': true,
      'tutor|sub_admin': true,
      'student|tutor': true,
    })
    expect(m).toEqual(new Set(['student|tutor']))
  })

  it('a crafted save cannot store a forbidden pair either', () => {
    expect(serializeMessagingMatrix(['admin|student', 'admin|tutor', 'student|tutor'])).toEqual({
      'student|tutor': true,
    })
  })

  it('mentor <-> admin tier is built in, so the matrix never holds it', () => {
    expect([...BUILT_IN_PAIRS].sort()).toEqual(['admin|mentor', 'mentor|sub_admin'])
    expect(isBuiltInPair('mentor', 'admin')).toBe(true)
    expect(isBuiltInPair('sub_admin', 'mentor')).toBe(true)
    expect(parseMessagingMatrix({ 'admin|mentor': true, 'mentor|sub_admin': true }).size).toBe(0)
  })

  it('no pair is both built in and forbidden', () => {
    for (const key of BUILT_IN_PAIRS) expect(HIERARCHY_FORBIDDEN_PAIRS.has(key)).toBe(false)
  })
})
