import { describe, it, expect, vi, beforeEach } from 'vitest'
import { queryBuilder } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/services/mentorships', () => ({ studentIdsOfMentor: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileNamesByIds: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { studentIdsOfMentor } from '@/lib/services/mentorships'
import { getProfileNamesByIds } from '@/lib/services/users'
import { canMessage, listMessageableContacts } from '@/lib/messaging/recipient-policy'

const FLAGS = (o: Partial<Record<'isAdmin' | 'isSubAdmin' | 'isTutor' | 'isMentor' | 'isStudent', boolean>>) =>
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

/** A client whose .from(table) resolves to that table's rows. */
function tableClient(byTable: Record<string, unknown[]>) {
  return { from: vi.fn((t: string) => queryBuilder({ data: byTable[t] ?? [], error: null })) }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(studentIdsOfMentor).mockResolvedValue([])
})

describe('recipientPolicy', () => {
  it('admins and sub-admins reach nobody by default (no admin DMs)', async () => {
    vi.mocked(createAdminClient).mockReturnValue(tableClient({ profiles: [{ id: 'x' }, { id: 'y' }] }) as any)
    vi.mocked(loadPersonaFlags).mockResolvedValue(FLAGS({ isAdmin: true }))
    expect(await canMessage({ id: 'admin-1' } as any, 'anyone')).toBe(false)
    vi.mocked(loadPersonaFlags).mockResolvedValue(FLAGS({ isSubAdmin: true }))
    expect(await canMessage({ id: 'sa-1' } as any, 'anyone')).toBe(false)
  })

  it('tutor may message their class students and those students’ mentors, not a stranger', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue(FLAGS({ isTutor: true }))
    vi.mocked(createAdminClient).mockReturnValue(
      tableClient({
        class_tutors: [{ class_id: 'c-1' }], // classes this tutor teaches
        enrollments: [{ student_id: 'stu-in-class' }], // students in those classes
        mentorships: [{ student_id: 'stu-in-class', mentor_id: 'their-mentor' }], // reverse mentor<->tutor edge
        profiles: [{ id: 'their-mentor' }], // active-status filter for the mentor
      }) as any,
    )
    const actor = { id: 'tut-1' } as any
    expect(await canMessage(actor, 'stu-in-class')).toBe(true)
    expect(await canMessage(actor, 'their-mentor')).toBe(true)
    expect(await canMessage(actor, 'random-stranger')).toBe(false)
    // A pure tutor (not also a mentor) does NOT reach mentees they don't teach.
    expect(await canMessage(actor, 'some-mentee')).toBe(false)
  })

  it('mentor may message their mentees and the tutors of their mentees’ classes', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue(FLAGS({ isMentor: true }))
    vi.mocked(studentIdsOfMentor).mockResolvedValue(['mentee-1'])
    vi.mocked(createAdminClient).mockReturnValue(
      tableClient({
        enrollments: [{ class_id: 'c-9' }], // classes the mentees are enrolled in
        class_tutors: [{ tutor_id: 'mentee-tutor' }], // tutors of those classes
      }) as any,
    )
    const actor = { id: 'mentor-1' } as any
    expect(await canMessage(actor, 'mentee-1')).toBe(true)
    expect(await canMessage(actor, 'mentee-tutor')).toBe(true)
    expect(await canMessage(actor, 'random-stranger')).toBe(false)
  })

  it('student may message their class tutors and their mentors, but NOT admins or other students', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue(FLAGS({ isStudent: true }))
    vi.mocked(createAdminClient).mockReturnValue(
      tableClient({
        enrollments: [{ class_id: 'c-1' }], // classes this student is in
        class_tutors: [{ tutor_id: 'my-tutor' }], // tutors of those classes
        mentorships: [{ mentor_id: 'my-mentor' }], // this student's mentors
        profiles: [{ id: 'my-mentor' }], // active-status filter for the mentor
      }) as any,
    )
    const actor = { id: 'stu-1' } as any
    expect(await canMessage(actor, 'my-tutor')).toBe(true)
    expect(await canMessage(actor, 'my-mentor')).toBe(true)
    expect(await canMessage(actor, 'the-admin')).toBe(false) // admins out of scope now
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
    vi.mocked(studentIdsOfMentor).mockResolvedValue(['s-2', 's-1'])
    vi.mocked(createAdminClient).mockReturnValue(tableClient({}) as any)
    vi.mocked(getProfileNamesByIds).mockResolvedValue(
      new Map([
        ['s-1', 'Zara'],
        ['s-2', 'Amir'],
      ]),
    )
    expect(await listMessageableContacts({ id: 'mentor-1' } as any)).toEqual([
      { id: 's-2', name: 'Amir' },
      { id: 's-1', name: 'Zara' },
    ])
  })
})
