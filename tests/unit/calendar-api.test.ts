import { describe, it, expect, vi, beforeEach } from 'vitest'

const profile = { id: 'stud-1', email: 's@x.c', role: 'student', status: 'active' } as any
vi.mock('@/lib/session/actor-context', () => ({
  getActorContext: vi.fn(async () => ({
    userId: 'auth-1',
    profile: profile.status === 'pending' ? profile : profile,
    accessState: profile.status === 'active' ? 'active' : profile.status === 'disabled' ? 'disabled' : 'pending',
  })),
}))

// org timezone anchor
vi.mock('@/lib/services/finance/org-settings', () => ({
  getOrgSettings: vi.fn(async () => ({ timezone: 'Asia/Kolkata' })),
}))

// RLS-scoped repo reads (the route trusts RLS to scope; here we return fixed rows)
const listSlots = vi.fn(async (..._a: any[]) => [
  {
    id: 's-1',
    class_id: 'c-1',
    subject: 'Maths',
    tutor_id: null,
    day_of_week: 1,
    start_time: '09:00',
    end_time: '10:00',
    mode_or_location: 'Room 1',
    active: true,
  },
])
vi.mock('@/lib/services/timetable-slots', () => ({ listSlots: (...a: any[]) => listSlots(...a) }))

const listEvents = vi.fn(async (..._a: any[]) => [
  {
    id: 'e-1',
    title: 'Holiday',
    event_date: '2026-07-13',
    start_time: null,
    end_time: null,
    class_id: null,
    kind: 'holiday',
  },
])
vi.mock('@/lib/services/calendar-events', () => ({ listEvents: (...a: any[]) => listEvents(...a) }))

const listAssignments = vi.fn(async (..._a: any[]) => [
  { id: 'a-1', class_id: 'c-1', title: 'HW 1', due_date: '2026-07-12T18:30:00.000Z', status: 'active' },
])
vi.mock('@/lib/services/assignments', () => ({ listAssignments: (...a: any[]) => listAssignments(...a) }))

import { GET } from '@/app/api/calendar/route'

const req = (qs: string) => new Request(`http://t/api/calendar${qs}`)

beforeEach(() => {
  profile.status = 'active'
})

describe('GET /api/calendar', () => {
  it('rejects a missing from/to range with 400', async () => {
    const res = await GET(req(''))
    expect(res.status).toBe(400)
    expect((await res.json()).success).toBe(false)
  })

  it('rejects an unauthenticated/inactive caller with 401', async () => {
    profile.status = 'pending'
    const res = await GET(req('?from=2026-07-06&to=2026-07-21'))
    expect(res.status).toBe(401)
  })

  it('merges all three sources within the range', async () => {
    const res = await GET(req('?from=2026-07-06&to=2026-07-21'))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    const sources = new Set(json.data.items.map((i: any) => i.source))
    expect(sources).toEqual(new Set(['slot', 'event', 'assignment']))
    // anchor TZ echoed for the client to label/render with
    expect(json.data.anchorTz).toBe('Asia/Kolkata')
  })

  it('expands the Monday slot to its absolute IST instant (09:00 IST === 03:30 UTC)', async () => {
    const res = await GET(req('?from=2026-07-06&to=2026-07-21'))
    const json = await res.json()
    const slot = json.data.items.find((i: any) => i.source === 'slot')
    expect(slot.start).toBe('2026-07-06T03:30:00.000Z')
  })

  it('passes the range to the assignment + event reads (scoping respected via RLS)', async () => {
    await GET(req('?from=2026-07-06&to=2026-07-21'))
    expect(listSlots).toHaveBeenCalled()
    expect(listAssignments).toHaveBeenCalled()
    expect(listEvents).toHaveBeenCalledWith(expect.objectContaining({ from: '2026-07-06', to: '2026-07-21' }))
  })
})
