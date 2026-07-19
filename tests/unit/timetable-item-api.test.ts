import { describe, it, expect, vi, beforeEach } from 'vitest'

const profile = { id: 'tutor-1', email: 'tutor@example.com', role: 'tutor', status: 'active' } as any
vi.mock('@/lib/session/actor-context', () => ({
  getActorContext: vi.fn(async () => ({
    userId: 'auth-1',
    profile,
    accessState: profile.status === 'active' ? 'active' : profile.status === 'disabled' ? 'disabled' : 'pending',
  })),
}))

const updateSlotFromApiInput: any = vi.fn(async () => ({ id: 'slot-1', subject: 'Updated' }))
const deactivateSlotFromApiInput: any = vi.fn(async () => ({ id: 'slot-1', active: false }))
vi.mock('@/lib/services/timetable-slots', () => ({
  updateSlotFromApiInput: (...args: any[]) => updateSlotFromApiInput(...args),
  deactivateSlotFromApiInput: (...args: any[]) => deactivateSlotFromApiInput(...args),
}))

import { ValidationError } from '@/lib/errors'
import { PATCH as updateSlotRoute, DELETE as deleteSlotRoute } from '@/app/api/timetable/[id]/route'

const body = (url: string, payload: any) =>
  new Request(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })

beforeEach(() => {
  vi.clearAllMocks()
  profile.role = 'tutor'
  profile.status = 'active'
})

describe('timetable item API routes', () => {
  it('PATCH /api/timetable/[id] delegates payload and id validation to the service helper', async () => {
    const res = await updateSlotRoute(body('http://t/api/timetable/x', { subject: 'Updated' }), {
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(updateSlotFromApiInput).toHaveBeenCalled()
  })

  it('PATCH /api/timetable/[id] maps validation errors from the service helper', async () => {
    updateSlotFromApiInput.mockRejectedValueOnce(new ValidationError('Invalid timetable slot id'))
    const res = await updateSlotRoute(body('http://t/api/timetable/x', { subject: 'Updated' }), {
      params: Promise.resolve({ id: 'bad' }),
    })
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
  })

  it('DELETE /api/timetable/[id] delegates id validation to the service helper', async () => {
    const res = await deleteSlotRoute(new Request('http://t/api/timetable/x', { method: 'DELETE' }), {
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(deactivateSlotFromApiInput).toHaveBeenCalled()
  })
})
