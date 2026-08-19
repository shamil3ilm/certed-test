import { describe, it, expect } from 'vitest'
import { addSubjectSchema } from '@/lib/validation/class-subject'

const student = '11111111-1111-4111-8111-111111111111'
const subject = '22222222-2222-4222-8222-222222222222'
const tutor = '33333333-3333-4333-8333-333333333333'

describe('addSubjectSchema', () => {
  it('accepts student + subject + tutor', () => {
    expect(addSubjectSchema.safeParse({ studentId: student, subjectId: subject, tutorId: tutor }).success).toBe(true)
  })
  it('accepts student + subject with NO tutor (assigned later)', () => {
    expect(addSubjectSchema.safeParse({ studentId: student, subjectId: subject }).success).toBe(true)
  })
  it('requires a valid student uuid', () => {
    expect(addSubjectSchema.safeParse({ studentId: 'nope', subjectId: subject }).success).toBe(false)
  })
  it('requires a valid subject uuid', () => {
    expect(addSubjectSchema.safeParse({ studentId: student, subjectId: 'nope' }).success).toBe(false)
  })
  it('rejects a malformed tutor id', () => {
    expect(addSubjectSchema.safeParse({ studentId: student, subjectId: subject, tutorId: 'nope' }).success).toBe(false)
  })
})
