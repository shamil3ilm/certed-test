import { describe, it, expect, vi, beforeEach } from 'vitest'

const profile = { id: 'tutor-1', email: 't@x.c', role: 'tutor', status: 'active' } as any

function getPersonasForRole(role: string) {
  const mapping: Record<string, string> = {
    admin: 'admin',
    tutor: 'tutor',
    student: 'student',
    sub_admin: 'sub_admin',
  }
  const personaName = mapping[role] || role
  return [{ id: 'pa-1', persona_name: personaName, status: 'active' }]
}

vi.mock('@/lib/session/actor-context', () => ({
  getActorContext: vi.fn(async () => ({
    userId: 'auth-1',
    profile,
    personas: getPersonasForRole(profile.role),
    accessState: profile.status === 'active' ? 'active' : profile.status === 'disabled' ? 'disabled' : 'pending',
  })),
}))

const createAssignmentFromApiInput: any = vi.fn(async () => ({ id: 'a-1' }))
vi.mock('@/lib/services/assignments', () => ({
  createAssignmentFromApiInput: (...args: any[]) => createAssignmentFromApiInput(...args),
}))

import { ValidationError } from '@/lib/errors'
import { POST } from '@/app/api/assignments/route'

const body = (o: any) =>
  new Request('http://t/api/assignments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(o),
  })

beforeEach(() => {
  vi.clearAllMocks()
  profile.role = 'tutor'
  profile.status = 'active'
})

describe('POST /api/assignments', () => {
  it('creates an assignment through the service-owned API input helper', async () => {
    const res = await POST(
      body({
        class_id: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Homework',
        description: 'Solve all',
        due_date: '2026-07-20T00:00:00.000Z',
        attachment_drive_link: 'https://example.com/brief',
      }),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(createAssignmentFromApiInput).toHaveBeenCalled()
  })

  it('maps service validation errors to HTTP 422', async () => {
    createAssignmentFromApiInput.mockRejectedValueOnce(new ValidationError('Invalid assignment data'))
    const res = await POST(body({ title: '' }))
    const json = await res.json()
    expect(res.status).toBe(422)
    expect(json.success).toBe(false)
  })

  it('rejects a student caller with 403 before hitting the service', async () => {
    profile.role = 'student'
    const res = await POST(body({}))
    expect(res.status).toBe(403)
    expect(createAssignmentFromApiInput).not.toHaveBeenCalled()
  })
})
