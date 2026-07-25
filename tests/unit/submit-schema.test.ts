import { describe, it, expect } from 'vitest'
import { submissionInputSchema } from '@/lib/assignments/submit-schema'

const uuid = 'a5000000-0000-4000-8000-000000000001'

describe('submissionInputSchema', () => {
  it('accepts a valid url without a file name', () => {
    const r = submissionInputSchema.safeParse({ assignment_id: uuid, url: 'https://drive.google.com/file/d/x/view' })
    expect(r.success).toBe(true)
  })

  it('accepts an optional file name', () => {
    const r = submissionInputSchema.safeParse({
      assignment_id: uuid,
      url: 'https://x.test/a',
      file_name: '2026-07-10-ch4.pdf',
    })
    expect(r.success).toBe(true)
  })

  it('rejects a non-uuid assignment id', () => {
    const r = submissionInputSchema.safeParse({ assignment_id: 'nope', url: 'https://x.test/a' })
    expect(r.success).toBe(false)
  })

  it('rejects a bad url', () => {
    const r = submissionInputSchema.safeParse({ assignment_id: uuid, url: 'not-a-url' })
    expect(r.success).toBe(false)
  })
})
