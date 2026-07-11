import { describe, it, expect, vi, beforeEach } from 'vitest'

const profile = { id: 'teacher-1', email: 't@x.c', role: 'teacher', status: 'active' } as any
vi.mock('@/lib/auth/profile', () => ({ getProfile: vi.fn(async () => profile) }))

const COURSE = '11111111-1111-4111-8111-111111111111'
const OTHER = '33333333-3333-4333-8333-333333333333'

const teaches = vi.fn(async (..._a: any[]) => true)
vi.mock('@/lib/auth/classScope', () => ({ teachesClass: (...a: any[]) => teaches(...a) }))

const created = { id: 'slot-1', class_id: COURSE, subject: 'Maths', day_of_week: 1, start_time: '09:00', end_time: '10:00' }
const createSlot = vi.fn(async (..._a: any[]) => created)
const listSlots = vi.fn(async (..._a: any[]) => [created])
vi.mock('@/lib/repos/timetableSlots', () => ({
  createSlot: (...a: any[]) => createSlot(...a),
  listSlots: (...a: any[]) => listSlots(...a),
}))

import { GET, POST } from '@/app/api/timetable/route'

const body = (o: any) => new Request('http://t/api/timetable', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(o),
})
const valid = { class_id: COURSE, subject: 'Maths', day_of_week: 1, start_time: '09:00', end_time: '10:00' }

beforeEach(() => {
  vi.clearAllMocks() // reset call history so per-test not.toHaveBeenCalled() assertions are isolated
  profile.role = 'teacher'; profile.status = 'active'; teaches.mockResolvedValue(true)
})

describe('POST /api/timetable', () => {
  it('teacher who teaches the course can create a slot', async () => {
    const res = await POST(body(valid))
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json.success).toBe(true)
    expect(createSlot).toHaveBeenCalled()
  })

  it('teacher who does NOT teach the course is forbidden', async () => {
    teaches.mockResolvedValue(false)
    const res = await POST(body({ ...valid, class_id: OTHER }))
    expect(res.status).toBe(403)
    expect(createSlot).not.toHaveBeenCalled()
  })

  it('a student is forbidden from creating a slot', async () => {
    profile.role = 'student'
    const res = await POST(body(valid))
    expect(res.status).toBe(403)
    expect(createSlot).not.toHaveBeenCalled()
  })

  it('rejects an invalid slot with 400 (end before start)', async () => {
    const res = await POST(body({ ...valid, start_time: '10:00', end_time: '09:00' }))
    expect(res.status).toBe(400)
    expect(createSlot).not.toHaveBeenCalled()
  })
})

describe('GET /api/timetable', () => {
  it('returns the RLS-scoped slot list', async () => {
    const res = await GET(new Request('http://t/api/timetable'))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toHaveLength(1)
  })
})
