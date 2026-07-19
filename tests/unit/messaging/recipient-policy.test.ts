import { describe, it, expect, vi, beforeEach } from 'vitest'
import { queryBuilder } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/services/mentorships', () => ({ studentIdsOfTutor: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileNamesByIds: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { studentIdsOfTutor } from '@/lib/services/mentorships'
import { getProfileNamesByIds } from '@/lib/services/users'
import { canMessage, listMessageableContacts } from '@/lib/messaging/recipient-policy'

const FLAGS = (o: Partial<Record<'isAdmin' | 'isSubAdmin' | 'isTutor' | 'isMentor' | 'isStudent', boolean>>) =>
  ({ personas: [], isAdmin: false, isSubAdmin: false, isTutor: false, isManager: false, isStudent: false, isMentor: false, ...o }) as any

/** A client whose .from(table) resolves to that table's rows. */
function tableClient(byTable: Record<string, unknown[]>) {
  return { from: vi.fn((t: string) => queryBuilder({ data: byTable[t] ?? [], error: null })) }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(studentIdsOfTutor).mockResolvedValue([])
})

describe('recipientPolicy', () => {
  it('admin may message any active profile except themselves', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue(FLAGS({ isAdmin: true }))
    vi.mocked(createAdminClient).mockReturnValue(
      tableClient({ profiles: [{ id: 'admin-1' }, { id: 'stu-1' }, { id: 'tut-1' }] }) as any,
    )
    expect(await canMessage({ id: 'admin-1' } as any, 'stu-1')).toBe(true)
    expect(await canMessage({ id: 'admin-1' } as any, 'admin-1')).toBe(false) // never self
  })

  it('sub_admin may message tutors + students but not other admin-tier staff, robustly of role naming', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue(FLAGS({ isSubAdmin: true }))
    vi.mocked(createAdminClient).mockReturnValue(
      tableClient({
        profiles: [
          { id: 'sa-1', role: 'sub_admin' },
          { id: 'the-admin', role: 'admin' },
          { id: 'a-tutor', role: 'tutor' },
          { id: 'legacy-teacher', role: 'teacher' }, // DB not yet migrated to 'tutor'
          { id: 'a-student', role: 'student' },
        ],
      }) as any,
    )
    const actor = { id: 'sa-1' } as any
    expect(await canMessage(actor, 'a-tutor')).toBe(true)
    expect(await canMessage(actor, 'a-student')).toBe(true)
    // The whole point: a tutor still stored under the legacy 'teacher' value is
    // reachable, because eligibility excludes admins/sub_admins instead of
    // positively matching the tutor role string.
    expect(await canMessage(actor, 'legacy-teacher')).toBe(true)
    expect(await canMessage(actor, 'the-admin')).toBe(false)
    expect(await canMessage(actor, 'sa-1')).toBe(false) // never self
  })

  it('tutor may message students in classes they teach and their mentees, not a stranger', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue(FLAGS({ isTutor: true }))
    vi.mocked(studentIdsOfTutor).mockResolvedValue(['mentee-1'])
    vi.mocked(createAdminClient).mockReturnValue(
      tableClient({
        class_tutors: [{ class_id: 'c-1' }],
        enrollments: [{ student_id: 'stu-in-class' }],
      }) as any,
    )
    const actor = { id: 'tut-1' } as any
    expect(await canMessage(actor, 'stu-in-class')).toBe(true)
    expect(await canMessage(actor, 'mentee-1')).toBe(true)
    expect(await canMessage(actor, 'random-stranger')).toBe(false)
  })

  it('student may message their class tutors, their mentors, and admin-tier staff', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue(FLAGS({ isStudent: true }))
    vi.mocked(createAdminClient).mockReturnValue(
      tableClient({
        enrollments: [{ class_id: 'c-1' }],
        class_tutors: [{ tutor_id: 'my-tutor' }],
        mentorships: [{ tutor_id: 'my-mentor' }],
        profiles: [{ id: 'the-admin' }, { id: 'the-subadmin' }],
      }) as any,
    )
    const actor = { id: 'stu-1' } as any
    expect(await canMessage(actor, 'my-tutor')).toBe(true)
    expect(await canMessage(actor, 'my-mentor')).toBe(true)
    expect(await canMessage(actor, 'the-admin')).toBe(true)
    expect(await canMessage(actor, 'another-student')).toBe(false)
  })

  it('a persona with none of the messaging branches reaches nobody', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue(FLAGS({})) // e.g. a future guardian
    vi.mocked(createAdminClient).mockReturnValue(tableClient({}) as any)
    expect(await canMessage({ id: 'guardian-1' } as any, 'anyone')).toBe(false)
    expect(await listMessageableContacts({ id: 'guardian-1' } as any)).toEqual([])
  })

  it('listMessageableContacts name-resolves and sorts the eligible set', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue(FLAGS({ isMentor: true }))
    vi.mocked(studentIdsOfTutor).mockResolvedValue(['s-2', 's-1'])
    vi.mocked(createAdminClient).mockReturnValue(tableClient({}) as any)
    vi.mocked(getProfileNamesByIds).mockResolvedValue(new Map([['s-1', 'Zara'], ['s-2', 'Amir']]))
    expect(await listMessageableContacts({ id: 'mentor-1' } as any)).toEqual([
      { id: 's-2', name: 'Amir' },
      { id: 's-1', name: 'Zara' },
    ])
  })
})
