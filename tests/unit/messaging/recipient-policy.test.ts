import { describe, it, expect, vi, beforeEach } from 'vitest'
import { queryBuilder } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/data/personas', () => ({
  selectActiveProfileIdsByPersona: vi.fn(),
  selectActivePersonaAssignmentsByProfileIds: vi.fn(),
}))
vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))
vi.mock('@/lib/services/mentorships', () => ({ studentIdsOfMentor: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfilesByIds: vi.fn() }))
vi.mock('@/lib/services/finance/org-settings', () => ({
  getOrgSettings: vi.fn(async () => ({ messaging_matrix: null })),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { selectActivePersonaAssignmentsByProfileIds, selectActiveProfileIdsByPersona } from '@/lib/data/personas'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { studentIdsOfMentor } from '@/lib/services/mentorships'
import { getProfilesByIds } from '@/lib/services/users'
import { getOrgSettings } from '@/lib/services/finance/org-settings'
import { assertGroupRecipientsRelated, canMessage, listMessageableContacts } from '@/lib/messaging/recipient-policy'

const FLAGS = (
  o: Partial<Record<'isAdmin' | 'isSubAdmin' | 'isTutor' | 'isMentor' | 'hasMentorAuthority' | 'isStudent', boolean>>,
) =>
  ({
    personas: [],
    isAdmin: false,
    isSubAdmin: false,
    isTutor: false,
    isManager: false,
    isStudent: false,
    isMentor: false,
    hasMentorAuthority: false,
    ...o,
  }) as any

/** A client whose .from(table) resolves to that table's rows. */
function tableClient(byTable: Record<string, unknown[]>) {
  return { from: vi.fn((t: string) => queryBuilder({ data: byTable[t] ?? [], error: null })) }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(studentIdsOfMentor).mockResolvedValue([])
  vi.mocked(selectActiveProfileIdsByPersona).mockResolvedValue([])
  vi.mocked(selectActivePersonaAssignmentsByProfileIds).mockResolvedValue([])
  vi.mocked(getProfilesByIds).mockResolvedValue(new Map())
  vi.mocked(getOrgSettings).mockResolvedValue({ messaging_matrix: null } as any)
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
    vi.mocked(loadPersonaFlags).mockResolvedValue(FLAGS({ isMentor: true, hasMentorAuthority: true }))
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

  it('an admin-enabled persona pair widens messaging globally (student <-> admin)', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue(FLAGS({ isStudent: true }))
    // Admin turned ON the student<->admin pair; default direct contacts are empty here.
    vi.mocked(getOrgSettings).mockResolvedValue({ messaging_matrix: { 'admin|student': true } } as any)
    vi.mocked(createAdminClient).mockReturnValue(
      tableClient({ enrollments: [], class_tutors: [], mentorships: [] }) as any,
    )
    vi.mocked(selectActiveProfileIdsByPersona).mockImplementation(async (persona) =>
      persona === 'admin' ? ['the-admin'] : [],
    )
    const actor = { id: 'stu-1' } as any
    expect(await canMessage(actor, 'the-admin')).toBe(true)
    // A pair that was NOT enabled stays closed.
    expect(await canMessage(actor, 'another-student')).toBe(false)
  })

  it('a persona with none of the messaging branches reaches nobody', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue(FLAGS({})) // e.g. a future guardian
    vi.mocked(createAdminClient).mockReturnValue(tableClient({}) as any)
    expect(await canMessage({ id: 'guardian-1' } as any, 'anyone')).toBe(false)
    expect(await listMessageableContacts({ id: 'guardian-1' } as any)).toEqual([])
  })

  it('listMessageableContacts name-resolves, groups by persona, and sorts the eligible set', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue(FLAGS({ isMentor: true, hasMentorAuthority: true }))
    vi.mocked(studentIdsOfMentor).mockResolvedValue(['s-2', 's-1'])
    vi.mocked(createAdminClient).mockReturnValue(tableClient({}) as any)
    vi.mocked(getProfilesByIds).mockResolvedValue(
      new Map([
        ['s-1', { id: 's-1', full_name: 'Zara', email: 'zara@test.dev', role: 'student', class_level: null }],
        ['s-2', { id: 's-2', full_name: 'Amir', email: 'amir@test.dev', role: 'student', class_level: null }],
      ]),
    )
    vi.mocked(selectActivePersonaAssignmentsByProfileIds).mockResolvedValue([
      { profile_id: 's-1', persona_name: 'student', scope_type: 'global', scope_id: null, status: 'active' },
      { profile_id: 's-2', persona_name: 'student', scope_type: 'global', scope_id: null, status: 'active' },
    ] as any)
    expect(await listMessageableContacts({ id: 'mentor-1' } as any)).toEqual([
      {
        id: 's-2',
        name: 'Amir',
        personaKey: 'student',
        personaLabel: 'Student',
        relationLabel: '',
        groupContextKeys: ['student:s-2'],
      },
      {
        id: 's-1',
        name: 'Zara',
        personaKey: 'student',
        personaLabel: 'Student',
        relationLabel: '',
        groupContextKeys: ['student:s-1'],
      },
    ])
  })

  it('uses persona-aware labels for hybrid tutor-mentor contacts', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue(FLAGS({ isStudent: true }))
    vi.mocked(createAdminClient).mockReturnValue(
      tableClient({
        enrollments: [{ class_id: 'c-1' }],
        class_tutors: [{ tutor_id: 'tutor-mentor-1' }],
        mentorships: [],
      }) as any,
    )
    vi.mocked(getProfilesByIds).mockResolvedValue(
      new Map([
        [
          'tutor-mentor-1',
          { id: 'tutor-mentor-1', full_name: 'Alex', email: 'alex@test.dev', role: 'tutor', class_level: null },
        ],
      ]),
    )
    vi.mocked(selectActivePersonaAssignmentsByProfileIds).mockResolvedValue([
      { profile_id: 'tutor-mentor-1', persona_name: 'tutor', scope_type: 'global', scope_id: null, status: 'active' },
      {
        profile_id: 'tutor-mentor-1',
        persona_name: 'mentor',
        scope_type: 'student',
        scope_id: 'student-2',
        status: 'active',
      },
    ] as any)

    expect(await listMessageableContacts({ id: 'student-1' } as any)).toEqual([
      {
        id: 'tutor-mentor-1',
        name: 'Alex',
        personaKey: 'mentor',
        personaLabel: 'Tutor & Mentor',
        relationLabel: 'Your mentor',
        groupContextKeys: ['class:c-1', 'student:student-1'],
      },
    ])
  })

  it('names the actual student in tutor and mentor relationship labels', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue(FLAGS({ isTutor: true }))
    vi.mocked(createAdminClient).mockReturnValue(
      tableClient({
        class_tutors: [{ class_id: 'c-1' }],
        enrollments: [{ student_id: 'student-1', class_id: 'c-1' }],
        mentorships: [{ student_id: 'student-1', mentor_id: 'mentor-1' }],
        profiles: [{ id: 'mentor-1' }],
      }) as any,
    )
    vi.mocked(getProfilesByIds).mockResolvedValue(
      new Map([
        [
          'student-1',
          {
            id: 'student-1',
            full_name: 'Sara Student',
            email: 'sara@test.dev',
            role: 'student',
            class_level: 'Grade 10',
          },
        ],
        [
          'mentor-1',
          { id: 'mentor-1', full_name: 'Maya Mentor', email: 'maya@test.dev', role: 'mentor', class_level: null },
        ],
      ]),
    )
    vi.mocked(selectActivePersonaAssignmentsByProfileIds).mockResolvedValue([
      { profile_id: 'student-1', persona_name: 'student', scope_type: 'global', scope_id: null, status: 'active' },
      { profile_id: 'mentor-1', persona_name: 'mentor', scope_type: 'global', scope_id: null, status: 'active' },
    ] as any)

    await expect(listMessageableContacts({ id: 'tutor-1' } as any)).resolves.toEqual([
      {
        id: 'mentor-1',
        name: 'Maya Mentor',
        personaKey: 'mentor',
        personaLabel: 'Mentor',
        relationLabel: 'Mentor for Sara Student',
        groupContextKeys: ['class:c-1', 'student:student-1'],
      },
      {
        id: 'student-1',
        name: 'Sara Student',
        personaKey: 'student',
        personaLabel: 'Student',
        relationLabel: 'Grade 10',
        groupContextKeys: ['class:c-1', 'student:student-1'],
      },
    ])
  })

  it('names the actual student in tutor labels for mentor viewers', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue(FLAGS({ isMentor: true, hasMentorAuthority: true }))
    vi.mocked(studentIdsOfMentor).mockResolvedValue(['student-1'])
    vi.mocked(createAdminClient).mockReturnValue(
      tableClient({
        enrollments: [{ class_id: 'c-1' }],
        class_tutors: [{ tutor_id: 'tutor-1', class_id: 'c-1' }],
      }) as any,
    )
    vi.mocked(getProfilesByIds).mockResolvedValue(
      new Map([
        [
          'student-1',
          {
            id: 'student-1',
            full_name: 'Sara Student',
            email: 'sara@test.dev',
            role: 'student',
            class_level: 'Grade 10',
          },
        ],
        [
          'tutor-1',
          { id: 'tutor-1', full_name: 'Tarun Tutor', email: 'tarun@test.dev', role: 'tutor', class_level: null },
        ],
      ]),
    )
    vi.mocked(selectActivePersonaAssignmentsByProfileIds).mockResolvedValue([
      { profile_id: 'student-1', persona_name: 'student', scope_type: 'global', scope_id: null, status: 'active' },
      { profile_id: 'tutor-1', persona_name: 'tutor', scope_type: 'global', scope_id: null, status: 'active' },
    ] as any)

    await expect(listMessageableContacts({ id: 'mentor-1' } as any)).resolves.toEqual([
      {
        id: 'tutor-1',
        name: 'Tarun Tutor',
        personaKey: 'tutor',
        personaLabel: 'Tutor',
        relationLabel: 'Tutor for Sara Student',
        groupContextKeys: ['class:c-1', 'student:student-1'],
      },
      {
        id: 'student-1',
        name: 'Sara Student',
        personaKey: 'student',
        personaLabel: 'Student',
        relationLabel: 'Grade 10',
        groupContextKeys: ['class:c-1', 'student:student-1'],
      },
    ])
  })

  it('rejects a group that mixes matrix-only and direct contacts', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue(FLAGS({ isStudent: true }))
    vi.mocked(getOrgSettings).mockResolvedValue({ messaging_matrix: { 'admin|student': true } } as any)
    vi.mocked(createAdminClient).mockReturnValue(
      tableClient({
        enrollments: [{ class_id: 'c-1' }],
        class_tutors: [{ tutor_id: 'my-tutor' }],
        mentorships: [],
      }) as any,
    )
    vi.mocked(selectActiveProfileIdsByPersona).mockImplementation(async (persona) =>
      persona === 'admin' ? ['the-admin'] : [],
    )

    await expect(assertGroupRecipientsRelated({ id: 'student-1' } as any, ['my-tutor', 'the-admin'])).rejects.toThrow(
      'Only directly related contacts can be added to a group chat.',
    )
  })
})
