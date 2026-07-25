import { describe, it, expect } from 'vitest'
import { gradeSchema } from '@/lib/validation/assignment'

describe('gradeSchema', () => {
  it('accepts a numeric score with feedback', () => {
    expect(gradeSchema.safeParse({ score: 18, feedback: 'Great work' }).success).toBe(true)
  })
  it('accepts a null score (un-grade) with no feedback', () => {
    expect(gradeSchema.safeParse({ score: null }).success).toBe(true)
  })
  it('rejects a negative score', () => {
    expect(gradeSchema.safeParse({ score: -1 }).success).toBe(false)
  })
  it('accepts a score at the numeric(6,2) column max (9999.99)', () => {
    expect(gradeSchema.safeParse({ score: 9999.99 }).success).toBe(true)
  })
  it('rejects a score above the column max (would overflow numeric(6,2))', () => {
    expect(gradeSchema.safeParse({ score: 10000 }).success).toBe(false)
  })
  it('rejects feedback over the length cap', () => {
    expect(gradeSchema.safeParse({ score: 5, feedback: 'x'.repeat(2001) }).success).toBe(false)
  })
})
