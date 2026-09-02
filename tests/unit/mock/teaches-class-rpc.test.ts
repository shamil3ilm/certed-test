import { describe, it, expect, vi } from 'vitest'

/**
 * R16 mock-parity guard: the mock RPC semantics must match the migration chain.
 *
 * After 0082, `teaches_class` (READ scope, tutor OR mentor-of-enrolled-student, 0043) and
 * `teaches_class_write` (WRITE scope, tutor only, 0079) genuinely diverge. The E2E suite runs
 * against MOCK mode, so if the mock collapses them (as it used to) a mentor's calendar
 * create/edit is wrongly refused (403) in mock while production RLS allows it - the spec then
 * neither confirms nor refutes real behaviour. This locks the two scopes apart in the mock.
 */

// Controlled store so the test is independent of the seed / .mock-db.json.
const rows: Record<string, Record<string, unknown>[]> = {
  profiles: [
    { id: 'tut', auth_user_id: 'u-tut', email: 't@x' },
    { id: 'men', auth_user_id: 'u-men', email: 'm@x' },
  ],
  class_tutors: [{ tutor_id: 'tut', class_id: 'C', active: true }],
  enrollments: [{ student_id: 'stu', class_id: 'C', active: true }],
  mentorships: [{ mentor_id: 'men', student_id: 'stu', active: true }],
  persona_assignments: [
    { profile_id: 'men', persona_name: 'mentor', scope_type: 'student', scope_id: 'stu', status: 'active' },
  ],
}
vi.mock('@/lib/mock/store', () => ({ table: (n: string) => rows[n] ?? [], persist: () => {} }))
vi.mock('@/lib/mock/session', () => ({ getMockUidFromStore: vi.fn() }))

import { getMockUidFromStore } from '@/lib/mock/session'
import { createMockServerClient } from '@/lib/mock/client'

async function rpcAs(uid: string, fn: string, classId: string): Promise<unknown> {
  vi.mocked(getMockUidFromStore).mockResolvedValue(uid)
  const client = await createMockServerClient()
  const { data } = await (client as unknown as { rpc: (f: string, a: unknown) => Promise<{ data: unknown }> }).rpc(fn, {
    p_class_id: classId,
  })
  return data
}

describe('mock RPC parity: teaches_class vs teaches_class_write (R16)', () => {
  it('teaches_class (READ) includes the mentor branch; teaches_class_write (WRITE) does not', async () => {
    // Mentor of a student enrolled in class C: READ yes, WRITE no.
    expect(await rpcAs('u-men', 'teaches_class', 'C')).toBe(true)
    expect(await rpcAs('u-men', 'teaches_class_write', 'C')).toBe(false)
    // Tutor of C: both yes.
    expect(await rpcAs('u-tut', 'teaches_class', 'C')).toBe(true)
    expect(await rpcAs('u-tut', 'teaches_class_write', 'C')).toBe(true)
    // A class the mentor does not mentor: no.
    expect(await rpcAs('u-men', 'teaches_class', 'OTHER')).toBe(false)
  })
})
