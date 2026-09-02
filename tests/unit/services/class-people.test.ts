import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/data/capability-overrides', () => ({ selectActiveGlobalOverrides: vi.fn(async () => []) }))
vi.mock('@/lib/permission/personas', () => ({
  loadActivePersonas: vi.fn(),
  hasPersona: vi.fn(),
  loadPersonaFlags: vi.fn(),
}))
vi.mock('@/lib/services/classes', () => ({ getClassMembers: vi.fn(), mentorsByStudent: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ listActiveByRole: vi.fn(), listActiveTeacherCandidates: vi.fn() }))

import { loadActivePersonas, hasPersona, loadPersonaFlags } from '@/lib/permission/personas'
import { getClassMembers, mentorsByStudent } from '@/lib/services/classes'
import { loadClassPeopleViewData } from '@/lib/services/page-data/class-people'
import { listActiveByRole, listActiveTeacherCandidates } from '@/lib/services/users'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadPersonaFlags).mockImplementation(async (profileId: string) => {
    if (profileId === 'student-1' || profileId === 's1') {
      return {
        personas: [],
        isAdmin: false,
        isSubAdmin: false,
        isManager: false,
        isStudent: true,
        isMentor: false,
      } as any
    }
    return { personas: [], isAdmin: true, isSubAdmin: false, isManager: true, isStudent: false, isMentor: false } as any
  })
  vi.mocked(listActiveByRole).mockResolvedValue([])
  vi.mocked(listActiveTeacherCandidates).mockResolvedValue([])
})

describe('loadClassPeopleViewData', () => {
  it('loads the admin roster, mentor subtitles, and addable lists', async () => {
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([
      { persona_name: 'admin', scope_type: null, scope_id: null, status: 'active' },
    ] as any)
    vi.mocked(hasPersona).mockImplementation((_, name) => name === 'admin')
    vi.mocked(getClassMembers).mockResolvedValueOnce({
      tutors: [{ id: 't1', name: 'Maya Mentor', email: 'maya@test.com', role: 'tutor' }],
      students: [{ id: 's1', name: 'Sara Student', email: 'sara@test.com', role: 'student' }],
    } as any)
    vi.mocked(mentorsByStudent).mockResolvedValueOnce(
      new Map([['s1', [{ name: 'Maya Mentor', email: 'maya@test.com' }]]]) as any,
    )
    vi.mocked(listActiveTeacherCandidates).mockResolvedValueOnce([
      { id: 't1', name: 'Maya Mentor' },
      { id: 't2', name: 'Tara Tutor' },
    ] as any)
    vi.mocked(listActiveByRole).mockResolvedValueOnce([
      { id: 's1', name: 'Sara Student' },
      { id: 's2', name: 'Sam Student' },
    ] as any)

    const result = await loadClassPeopleViewData({ id: 'admin-1', role: 'admin' } as any, 'class-1')

    expect(result.canManage).toBe(true)
    expect(result.isAdmin).toBe(true)
    expect(result.students[0].subtitle).toBe('Mentor: Maya Mentor')
    expect(result.addableTutors).toEqual([{ id: 't2', name: 'Tara Tutor' }])
    expect(result.addableStudents).toEqual([{ id: 's2', name: 'Sam Student' }])
    expect(result.myMentors).toEqual([])
    // No search term, and a short list is not capped.
    expect(result.enrolSearch).toBe('')
    expect(result.studentsCapped).toBe(false)
    expect(listActiveByRole).toHaveBeenCalledWith('student', { search: '', limit: 50 })
  })

  it('bounds the enrol picker: trims the search, passes it through, and flags a capped page', async () => {
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([
      { persona_name: 'admin', scope_type: null, scope_id: null, status: 'active' },
    ] as any)
    vi.mocked(hasPersona).mockImplementation((_, name) => name === 'admin')
    vi.mocked(getClassMembers).mockResolvedValueOnce({ tutors: [], students: [] } as any)
    vi.mocked(mentorsByStudent).mockResolvedValueOnce(new Map() as any)
    vi.mocked(listActiveTeacherCandidates).mockResolvedValueOnce([] as any)
    // A full page of matches (>= the picker cap of 50) means more students exist.
    const fullPage = Array.from({ length: 50 }, (_, i) => ({ id: `s${i}`, name: `Student ${i}` }))
    vi.mocked(listActiveByRole).mockResolvedValueOnce(fullPage as any)

    const result = await loadClassPeopleViewData({ id: 'admin-1', role: 'admin' } as any, 'class-1', '  sara ')

    expect(listActiveByRole).toHaveBeenCalledWith('student', { search: 'sara', limit: 50 })
    expect(result.enrolSearch).toBe('sara')
    expect(result.studentsCapped).toBe(true)
    expect(result.addableStudents).toHaveLength(50) // none enrolled -> all addable
  })

  it('loads only the signed-in student mentor contacts for a student view', async () => {
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([
      { persona_name: 'student', scope_type: null, scope_id: null, status: 'active' },
    ] as any)
    vi.mocked(hasPersona).mockImplementation((_, name) => name === 'student')
    vi.mocked(getClassMembers).mockResolvedValueOnce({
      tutors: [{ id: 't1', name: 'Maya Mentor', email: 'maya@test.com', role: 'tutor' }],
      students: [{ id: 's1', name: 'Sara Student', email: 'sara@test.com', role: 'student' }],
    } as any)
    vi.mocked(mentorsByStudent).mockResolvedValueOnce(
      new Map([['s1', [{ name: 'Maya Mentor', email: 'maya@test.com' }]]]) as any,
    )

    const result = await loadClassPeopleViewData({ id: 's1', role: 'student' } as any, 'class-1')

    expect(result.canManage).toBe(false)
    expect(result.isAdmin).toBe(false)
    expect(result.addableTutors).toEqual([])
    expect(result.addableStudents).toEqual([])
    expect(result.myMentors).toEqual([{ name: 'Maya Mentor', email: 'maya@test.com' }])
    expect(listActiveByRole).not.toHaveBeenCalled()
    expect(listActiveTeacherCandidates).not.toHaveBeenCalled()
  })
})
