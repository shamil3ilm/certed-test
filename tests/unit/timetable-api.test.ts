import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../stubs/supabase-query-builder'

const profile = { id: 'tutor-1', email: 't@x.c', role: 'tutor', status: 'active' } as any
vi.mock('@/lib/session/actor-context', () => ({
  getActorContext: vi.fn(async () => ({
    userId: 'auth-1',
    profile,
    accessState: profile.status === 'active' ? 'active' : profile.status === 'disabled' ? 'disabled' : 'pending',
  })),
}))

vi.mock('@/lib/permission/personas', () => ({
  loadActivePersonas: vi.fn(),
  hasPersona: vi.fn(),
  loadPersonaFlags: vi.fn(),
}))

const COURSE = '11111111-1111-4111-8111-111111111111'
const OTHER = '33333333-3333-4333-8333-333333333333'

const teaches = vi.fn(async (..._a: any[]) => true)
vi.mock('@/lib/auth/class-scope', () => ({ teachesClass: (...a: any[]) => teaches(...a) }))

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/data/audit', () => ({ writeAudit: vi.fn() }))

const created = {
  id: 'slot-1',
  class_id: COURSE,
  subject: 'Maths',
  day_of_week: 1,
  start_time: '09:00',
  end_time: '10:00',
}
// createSlot's permission check (canWriteClass) now lives INSIDE the service,
// not the route — so this test exercises the real service (only `listSlots`
// is stubbed, as a pure read unrelated to the permission behavior under test).
const listSlots = vi.fn(async (..._a: any[]) => [created])
vi.mock('@/lib/services/timetable-slots', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/timetable-slots')>()
  return { ...actual, listSlots: (...a: any[]) => listSlots(...a) }
})

import { createClient } from '@/lib/supabase/server'
import { loadActivePersonas, hasPersona, loadPersonaFlags } from '@/lib/permission/personas'
import { GET, POST } from '@/app/api/timetable/route'

const flags = (o: { isAdmin?: boolean; isTutor?: boolean; isStudent?: boolean }) =>
  ({
    personas: [],
    isAdmin: false,
    isSubAdmin: false,
    isTutor: false,
    isManager: false,
    isStudent: false,
    isMentor: false,
    ...o,
  }) as any

const body = (o: any) =>
  new Request('http://t/api/timetable', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(o),
  })
const valid = { class_id: COURSE, subject: 'Maths', day_of_week: 1, start_time: '09:00', end_time: '10:00' }

beforeEach(() => {
  vi.clearAllMocks() // reset call history so per-test not.toHaveBeenCalled() assertions are isolated
  profile.role = 'tutor'
  profile.status = 'active'
  teaches.mockResolvedValue(true)
  vi.mocked(loadActivePersonas).mockResolvedValue([{ persona_name: 'tutor', status: 'active' }] as any)
  vi.mocked(hasPersona).mockImplementation((_, name) => name === 'tutor')
  vi.mocked(loadPersonaFlags).mockResolvedValue(flags({ isTutor: true }))
  vi.mocked(createClient).mockResolvedValue(makeClient({ data: created, error: null }) as any)
})

describe('POST /api/timetable', () => {
  it('tutor who teaches the course can create a slot', async () => {
    const res = await POST(body(valid))
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json.success).toBe(true)
    expect(createClient).toHaveBeenCalled()
  })

  it('tutor who does NOT teach the course is forbidden', async () => {
    teaches.mockResolvedValue(false)
    const res = await POST(body({ ...valid, class_id: OTHER }))
    expect(res.status).toBe(403)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('a student is forbidden from creating a slot', async () => {
    profile.role = 'student'
    vi.mocked(loadPersonaFlags).mockResolvedValueOnce(flags({ isStudent: true }))
    const res = await POST(body(valid))
    expect(res.status).toBe(403)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('rejects an invalid slot with 400 (end before start)', async () => {
    const res = await POST(body({ ...valid, start_time: '10:00', end_time: '09:00' }))
    expect(res.status).toBe(400)
    expect(createClient).not.toHaveBeenCalled()
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

  it('caps the unfiltered (whole-academy) query at 500, matching /api/events', async () => {
    await GET(new Request('http://t/api/timetable'))
    expect(listSlots).toHaveBeenCalledWith(expect.objectContaining({ limit: 500 }))
  })
})
