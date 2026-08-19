import { describe, it, expect } from 'vitest'
import { createSubjectSchema, subjectNameSchema, subjectIdSchema } from '@/lib/validation/subject'

describe('subject validation', () => {
  it('accepts a normal subject name', () => {
    expect(createSubjectSchema.safeParse({ name: 'Mathematics' }).success).toBe(true)
  })
  it('trims surrounding whitespace', () => {
    expect(createSubjectSchema.parse({ name: '  Physics  ' }).name).toBe('Physics')
  })
  it('rejects an empty / whitespace-only name', () => {
    expect(createSubjectSchema.safeParse({ name: '   ' }).success).toBe(false)
    expect(subjectNameSchema.safeParse('').success).toBe(false)
  })
  it('rejects an over-long name (>60)', () => {
    expect(createSubjectSchema.safeParse({ name: 'x'.repeat(61) }).success).toBe(false)
    expect(createSubjectSchema.safeParse({ name: 'x'.repeat(60) }).success).toBe(true)
  })
  it('subjectIdSchema requires a uuid', () => {
    expect(subjectIdSchema.safeParse('not-a-uuid').success).toBe(false)
    expect(subjectIdSchema.safeParse('11111111-1111-4111-8111-111111111111').success).toBe(true)
  })
})
