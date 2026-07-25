import { describe, it, expect, vi, beforeEach } from 'vitest'

const profile = { id: 'tutor-1', email: 'tutor@example.com', role: 'tutor', status: 'active' } as any
const requireCapabilityApi = vi.fn<(capability: string) => Promise<any>>().mockImplementation(async () => profile)
vi.mock('@/lib/auth/require-role', () => ({
  requireCapabilityApi: (capability: string) => requireCapabilityApi(capability),
}))

const listEvents: any = vi.fn(async () => [])
const createEventFromApiInput: any = vi.fn(async () => ({ id: 'evt-1', title: 'Class' }))
const updateEventFromApiInput: any = vi.fn(async () => ({ id: 'evt-1', title: 'Updated' }))
const deleteEventFromApiInput: any = vi.fn(async () => {})
vi.mock('@/lib/services/calendar-events', () => ({
  listEvents: (opts?: unknown) => listEvents(opts),
  createEventFromApiInput: (profile: unknown, raw: unknown) => createEventFromApiInput(profile, raw),
  updateEventFromApiInput: (profile: unknown, id: string, raw: unknown) => updateEventFromApiInput(profile, id, raw),
  deleteEventFromApiInput: (profile: unknown, id: string) => deleteEventFromApiInput(profile, id),
}))

import { ValidationError } from '@/lib/errors'
import { POST as createEventRoute } from '@/app/api/events/route'
import { PATCH as updateEventRoute, DELETE as deleteEventRoute } from '@/app/api/events/[id]/route'

const body = (url: string, method: string, payload: any) =>
  new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })

beforeEach(() => {
  vi.clearAllMocks()
  profile.role = 'tutor'
  profile.status = 'active'
  requireCapabilityApi.mockImplementation(async () => profile)
})

describe('events API routes', () => {
  it('POST /api/events delegates payload validation to the service helper', async () => {
    const res = await createEventRoute(
      body('http://t/api/events', 'POST', {
        title: 'Class',
        event_date: '2026-07-20',
        class_id: '550e8400-e29b-41d4-a716-446655440000',
        kind: 'event',
      }),
    )
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json.success).toBe(true)
    expect(createEventFromApiInput).toHaveBeenCalled()
  })

  it('PATCH /api/events/[id] maps validation errors from the service helper', async () => {
    updateEventFromApiInput.mockRejectedValueOnce(new ValidationError('Invalid event id'))
    const res = await updateEventRoute(body('http://t/api/events/x', 'PATCH', { title: 'Updated' }), {
      params: { id: 'bad' },
    })
    const json = await res.json()
    expect(res.status).toBe(422)
    expect(json.success).toBe(false)
  })

  it('DELETE /api/events/[id] delegates id validation to the service helper', async () => {
    const res = await deleteEventRoute(new Request('http://t/api/events/x', { method: 'DELETE' }), {
      params: { id: '550e8400-e29b-41d4-a716-446655440000' },
    })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(deleteEventFromApiInput).toHaveBeenCalled()
  })
})
