import { describe, it, expect } from 'vitest'
import { addUserSchema } from '@/lib/validation/user'
import { createAnnouncementSchema } from '@/lib/validation/announcement'
import { createClassSchema } from '@/lib/validation/class'

describe('addUserSchema', () => {
  it('accepts a valid tutor', () => {
    expect(addUserSchema.safeParse({ email: 'a@b.com', role: 'tutor' }).success).toBe(true)
  })
  it('rejects a bad email', () => {
    expect(addUserSchema.safeParse({ email: 'nope', role: 'tutor' }).success).toBe(false)
  })
  it('rejects an invalid role', () => {
    expect(addUserSchema.safeParse({ email: 'a@b.com', role: 'root' }).success).toBe(false)
  })
})

describe('createAnnouncementSchema', () => {
  it('accepts a global announcement (null course)', () => {
    expect(
      createAnnouncementSchema.safeParse({ class_id: null, title: 'Hi', message: 'Welcome' }).success,
    ).toBe(true)
  })
  it('rejects an empty title', () => {
    expect(createAnnouncementSchema.safeParse({ title: '', message: 'x' }).success).toBe(false)
  })
})

describe('course schemas', () => {
  it('createClassSchema needs a non-empty name', () => {
    expect(createClassSchema.safeParse({ name: '' }).success).toBe(false)
    expect(createClassSchema.safeParse({ name: 'Physics' }).success).toBe(true)
  })
})
