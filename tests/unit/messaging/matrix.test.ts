import { describe, it, expect } from 'vitest'
import {
  MESSAGING_PERSONAS,
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
    const raw = serializeMessagingMatrix(['tutor|student', 'admin|student'])
    expect(raw).toEqual({ 'student|tutor': true, 'admin|student': true })
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
