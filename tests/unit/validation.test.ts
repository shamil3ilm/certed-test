import { describe, it, expect } from 'vitest'
import { addUserSchema } from '@/lib/validation/user'
import { createAnnouncementSchema } from '@/lib/validation/announcement'
import { createCourseSchema, enrollmentSchema } from '@/lib/validation/course'

describe('addUserSchema', () => {
  it('accepts a valid teacher', () => {
    expect(addUserSchema.safeParse({ email: 'a@b.com', role: 'teacher' }).success).toBe(true)
  })
  it('rejects a bad email', () => {
    expect(addUserSchema.safeParse({ email: 'nope', role: 'teacher' }).success).toBe(false)
  })
  it('rejects an invalid role', () => {
    expect(addUserSchema.safeParse({ email: 'a@b.com', role: 'root' }).success).toBe(false)
  })
})

describe('createAnnouncementSchema', () => {
  it('accepts a global announcement (null course)', () => {
    expect(
      createAnnouncementSchema.safeParse({ course_id: null, title: 'Hi', message: 'Welcome' }).success,
    ).toBe(true)
  })
  it('rejects an empty title', () => {
    expect(createAnnouncementSchema.safeParse({ title: '', message: 'x' }).success).toBe(false)
  })
})

describe('course schemas', () => {
  it('createCourseSchema needs a non-empty name', () => {
    expect(createCourseSchema.safeParse({ name: '' }).success).toBe(false)
    expect(createCourseSchema.safeParse({ name: 'Physics' }).success).toBe(true)
  })
  it('enrollmentSchema needs uuids', () => {
    expect(enrollmentSchema.safeParse({ student_id: 'x', course_id: 'y' }).success).toBe(false)
  })
})
