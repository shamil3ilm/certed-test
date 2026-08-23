import { describe, it, expect, vi, beforeEach } from 'vitest'

const profile = { id: 'stud-1', email: 's@x.c', role: 'student', status: 'active' } as any
const requireCapabilityApi = vi.fn<(capability: string) => Promise<any>>().mockImplementation(async () => profile)
vi.mock('@/lib/auth/require-role', () => ({
  requireCapabilityApi: (capability: string) => requireCapabilityApi(capability),
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
vi.mock('@/lib/services/timetable-slots', () => ({ listSlots: (opts?: unknown) => listSlots(opts) }))

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
vi.mock('@/lib/services/calendar-events', () => ({ listEvents: (opts?: unknown) => listEvents(opts) }))

const listAssignments = vi.fn(async (..._a: any[]) => [
  {
    id: 'a-1',
    class_id: 'c-1',
    title: 'HW 1',
    due_date: '2026-07-12T18:30:00.000Z',
    status: 'active',
    type: 'assignment',
  },
])
vi.mock('@/lib/services/assignments', () => ({ listAssignments: (opts?: unknown) => listAssignments(opts) }))

const listMeetLinks = vi.fn(async (..._a: any[]) => [
  { id: 'm-1', class_id: 'c-1', title: 'Doubt session', scheduled_at: '2026-07-08T09:00:00.000Z', active: true },
])
vi.mock('@/lib/services/meet-links', () => ({ listMeetLinks: (...a: unknown[]) => listMeetLinks(...a) }))

// Non-student class label: the route resolves classId -> the enrolled student's name.
const selectActiveEnrollmentRefsByClassIds = vi.fn(async (_ids: string[]) => [
  { class_id: 'c-1', student_id: 'stud-1' },
])
vi.mock('@/lib/data/class-membership', () => ({
  selectActiveEnrollmentRefsByClassIds: (ids: string[]) => selectActiveEnrollmentRefsByClassIds(ids),
}))
const getProfileNamesByIds = vi.fn(async (_ids: string[]) => new Map([['stud-1', 'Rahul']]))
vi.mock('@/lib/services/users', () => ({ getProfileNamesByIds: (ids: string[]) => getProfileNamesByIds(ids) }))

import { GET } from '@/app/api/calendar/route'

const req = (qs: string) => new Request(`http://t/api/calendar${qs}`)

beforeEach(() => {
  profile.status = 'active'
  profile.role = 'student'
  selectActiveEnrollmentRefsByClassIds.mockClear()
  getProfileNamesByIds.mockClear()
  requireCapabilityApi.mockReset()
  requireCapabilityApi.mockImplementation(async () => {
    if (profile.status !== 'active') throw new Error('no-access')
    return profile
  })
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

  it('merges all four sources within the range (slots, events, deadlines, meets)', async () => {
    const res = await GET(req('?from=2026-07-06&to=2026-07-21'))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    const sources = new Set(json.data.items.map((i: any) => i.source))
    expect(sources).toEqual(new Set(['slot', 'event', 'assignment', 'meet']))
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

  it('labels exam events and assignments with the class for a non-student viewer', async () => {
    profile.role = 'tutor'
    listEvents.mockResolvedValueOnce([
      {
        id: 'e-2',
        title: 'Midterm',
        event_date: '2026-07-14',
        start_time: '10:00',
        end_time: '12:00',
        class_id: 'c-1',
        kind: 'exam',
      },
    ] as any)
    const res = await GET(req('?from=2026-07-06&to=2026-07-21'))
    const json = await res.json()
    const exam = json.data.items.find((i: any) => i.id === 'event-e-2')
    const due = json.data.items.find((i: any) => i.source === 'assignment')
    const slot = json.data.items.find((i: any) => i.source === 'slot')
    expect(exam.title).toBe('Midterm · Rahul')
    expect(due.title).toBe('Due: HW 1 · Rahul')
    // Slots are labelled too now (same identification gap).
    expect(slot.title).toBe('Maths - Room 1 · Rahul')
    expect(selectActiveEnrollmentRefsByClassIds).toHaveBeenCalledWith(['c-1'])
  })

  it('does not label for a student viewer (their feed is already their own class)', async () => {
    const res = await GET(req('?from=2026-07-06&to=2026-07-21'))
    const json = await res.json()
    const due = json.data.items.find((i: any) => i.source === 'assignment')
    expect(due.title).toBe('Due: HW 1')
    expect(selectActiveEnrollmentRefsByClassIds).not.toHaveBeenCalled()
  })
})
