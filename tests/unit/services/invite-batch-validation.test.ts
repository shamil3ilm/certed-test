import { describe, it, expect } from 'vitest'
import { validateInviteBatch, MAX_BATCH_ROWS } from '@/lib/services/user-invites-validation'

const tutor = (email: string) => ({ email, full_name: 'T', role: 'tutor' })
const student = (email: string, over = {}) => ({
  email,
  full_name: 'S',
  role: 'student',
  country: 'India',
  class_level: 'Grade 10',
  mentor_id: '11111111-1111-4111-8111-111111111111',
  ...over,
})

describe('validateInviteBatch', () => {
  it('accepts a mixed batch of valid rows', () => {
    const result = validateInviteBatch([tutor('a@x.test'), student('b@x.test')], {
      creatable: ['tutor', 'student'],
      taken: [],
    })
    expect(result.errors).toEqual([])
    expect(result.rows).toHaveLength(2)
  })

  // Flagged on the LATER row, because that is the one to change.
  it('reports a duplicate email inside the batch, on the later row', () => {
    const result = validateInviteBatch([tutor('dup@x.test'), tutor('dup@x.test')], {
      creatable: ['tutor'],
      taken: [],
    })
    expect(result.errors).toEqual([{ index: 1, field: 'email', message: expect.stringMatching(/twice|duplicate/i) }])
  })

  // profiles carries CHECK (email = lower(email)), so these are the SAME account and must
  // collide here rather than at the insert.
  it('treats emails case- and whitespace-insensitively', () => {
    const result = validateInviteBatch([tutor(' A@x.test '), tutor('a@x.test')], {
      creatable: ['tutor'],
      taken: [],
    })
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].index).toBe(1)
  })

  it('reports an email already in use', () => {
    const result = validateInviteBatch([tutor('taken@x.test')], { creatable: ['tutor'], taken: ['taken@x.test'] })
    expect(result.errors).toEqual([{ index: 0, field: 'email', message: expect.stringMatching(/already/i) }])
  })

  it('reports a role this actor may not create', () => {
    const result = validateInviteBatch([{ email: 'a@x.test', full_name: 'A', role: 'admin' }], {
      creatable: ['tutor', 'student'],
      taken: [],
    })
    expect(result.errors).toEqual([
      { index: 0, field: 'role', message: expect.stringMatching(/cannot add|not allowed/i) },
    ])
  })

  it('reports each student minimum the schema requires', () => {
    const result = validateInviteBatch(
      [
        student('a@x.test', { country: '' }),
        student('b@x.test', { class_level: '' }),
        student('c@x.test', { mentor_id: '' }),
      ],
      { creatable: ['student'], taken: [] },
    )
    expect(result.errors.map((e) => [e.index, e.field])).toEqual([
      [0, 'country'],
      [1, 'class_level'],
      [2, 'mentor_id'],
    ])
  })

  it('refuses an empty batch and one over the cap', () => {
    expect(validateInviteBatch([], { creatable: ['tutor'], taken: [] }).errors[0].message).toMatch(/at least one/i)
    const tooMany = Array.from({ length: MAX_BATCH_ROWS + 1 }, (_, i) => tutor(`u${i}@x.test`))
    expect(validateInviteBatch(tooMany, { creatable: ['tutor'], taken: [] }).errors[0].message).toMatch(/25/)
  })

  // One pass must surface EVERY bad row, or the admin fixes one and resubmits twenty times.
  it('collects every bad row, not just the first', () => {
    const result = validateInviteBatch([tutor('nope'), tutor('also-bad')], { creatable: ['tutor'], taken: [] })
    expect(result.errors).toHaveLength(2)
  })
})
