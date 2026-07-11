import { describe, it, expect } from 'vitest'
import { z } from 'zod'

const meetLinkSchema = z.object({
  classId: z.string().uuid().nullable().or(z.literal('')),
  title: z.string().trim().min(1).max(200),
  url: z.string().trim().url(),
  description: z.string().trim().max(1000).optional(),
})

describe('meetLinkSchema', () => {
  it('accepts a valid course-scoped meet link', () => {
    const res = meetLinkSchema.safeParse({
      classId: 'c0000000-0000-4000-8000-000000000001',
      title: 'Maths doubt session',
      url: 'https://meet.google.com/abc-defg-hij',
      description: 'Weekly doubt solving class',
    })
    expect(res.success).toBe(true)
  })

  it('accepts a global meet link with classId as empty string', () => {
    const res = meetLinkSchema.safeParse({
      classId: '',
      title: 'Academy morning assembly',
      url: 'https://meet.google.com/xyz-pdq-rst',
    })
    expect(res.success).toBe(true)
  })

  it('rejects an invalid URL', () => {
    const res = meetLinkSchema.safeParse({
      classId: '',
      title: 'Assembly',
      url: 'invalid-url',
    })
    expect(res.success).toBe(false)
  })

  it('rejects a too long title', () => {
    const res = meetLinkSchema.safeParse({
      classId: '',
      title: 'a'.repeat(201),
      url: 'https://meet.google.com/xyz-pdq-rst',
    })
    expect(res.success).toBe(false)
  })
})
