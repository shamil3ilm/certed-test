import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/permission', () => ({ canManageClass: vi.fn() }))
vi.mock('@/lib/permission/personas', () => ({
  loadActivePersonas: vi.fn(),
  hasPersona: vi.fn(),
  loadPersonaFlags: vi.fn(),
}))
vi.mock('@/lib/services/assignments', () => ({ listAssignments: vi.fn() }))
vi.mock('@/lib/services/comments', () => ({ listCommentsForEntities: vi.fn() }))
vi.mock('@/lib/services/resources', () => ({
  listResourcesPage: vi.fn(),
  listVersionsForDocuments: vi.fn(async () => new Map()),
}))
vi.mock('@/lib/services/submissions', () => ({
  listMyActiveSubmissions: vi.fn(),
  listMySupersededSubmissions: vi.fn(),
}))

import { loadActivePersonas, hasPersona, loadPersonaFlags } from '@/lib/permission/personas'
import { canManageClass } from '@/lib/permission'
import { listAssignments } from '@/lib/services/assignments'
import { loadClassworkPageData, documentFilterUrl, type DocumentFilterState } from '@/lib/services/page-data/classwork'
import { listCommentsForEntities } from '@/lib/services/comments'
import { listResourcesPage } from '@/lib/services/resources'
import { listMyActiveSubmissions, listMySupersededSubmissions } from '@/lib/services/submissions'

const BASE_FILTERS: DocumentFilterState = { q: '', category: '', subject: '', from: '', to: '', sort: 'latest' }
const doc = (o: Record<string, unknown>) => ({ category: 'general_documents', ...o })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadPersonaFlags).mockImplementation(async (profileId: string) => {
    const student = profileId === 'student-1'
    return {
      personas: [],
      isAdmin: false,
      isSubAdmin: false,
      isManager: !student,
      isStudent: student,
      isMentor: false,
      hasMentorAuthority: false,
    } as any
  })
  vi.mocked(canManageClass).mockImplementation(async (profile: { id: string }) => profile.id !== 'student-1')
})

describe('documentFilterUrl', () => {
  it('builds filter URLs, omitting defaults and clearing on empty', () => {
    expect(documentFilterUrl(BASE_FILTERS, {})).toBe('?')
    expect(documentFilterUrl(BASE_FILTERS, { category: 'question_papers' })).toBe('?cat=question_papers')
    expect(documentFilterUrl(BASE_FILTERS, { q: 'notes', sort: 'oldest' })).toBe('?q=notes&sort=oldest')
  })
})

describe('loadClassworkPageData', () => {
  it('groups the student document view by category and maps comments', async () => {
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([
      { persona_name: 'student', scope_type: null, scope_id: null, status: 'active' },
    ] as any)
    vi.mocked(hasPersona).mockImplementation((_, name) => name === 'student')
    vi.mocked(listResourcesPage).mockResolvedValueOnce({
      items: [doc({ id: 'r1', title: 'Notes', category: 'practice_sheets', created_at: '2026-07-15T00:00:00.000Z' })],
      total: 1,
    } as any)
    vi.mocked(listAssignments).mockResolvedValueOnce([
      { id: 'a1', class_id: 'class-1', title: 'Essay', status: 'active', due_date: '2026-07-17T00:00:00.000Z' },
      { id: 'a2', class_id: 'class-1', title: 'Old task', status: 'archived', due_date: '2026-07-10T00:00:00.000Z' },
    ] as any)
    vi.mocked(listMyActiveSubmissions).mockResolvedValueOnce([
      { id: 's1', assignment_id: 'a1', submitted_at: '2026-07-15T09:00:00.000Z', status: 'submitted' },
    ] as any)
    vi.mocked(listMySupersededSubmissions).mockResolvedValueOnce([
      { id: 's0', assignment_id: 'a1', submitted_at: '2026-07-14T09:00:00.000Z', status: 'submitted' },
    ] as any)
    vi.mocked(listCommentsForEntities)
      .mockResolvedValueOnce(new Map([['s1', [{ id: 'c1' }]]]) as any)
      .mockResolvedValueOnce(new Map([['r1', [{ id: 'c2' }]]]) as any)

    const result = await loadClassworkPageData(
      { id: 'student-1', role: 'student' } as any,
      { id: 'class-1', name: 'Math', status: 'active' },
      {},
    )

    expect(result.canManage).toBe(false)
    expect(result.canManageContent).toBe(false)
    expect(result.documentTotal).toBe(1)
    expect(result.documentsByCategory.practice_sheets).toHaveLength(1)
    expect(result.documentsByCategory.practice_sheets[0].comments).toEqual([{ id: 'c2' }])
    expect(result.documentsByCategory.question_papers).toEqual([])
    expect(result.archivedDocuments).toEqual([])
    expect(result.assignmentViews).toHaveLength(1)
    expect(result.assignmentViews[0].submissionHistory.map((s) => s.id)).toEqual(['s0'])
  })

  it('reads the filter state from search params', async () => {
    vi.mocked(listResourcesPage).mockResolvedValue({ items: [], total: 0 } as any)
    vi.mocked(listAssignments).mockResolvedValue([] as any)
    vi.mocked(listCommentsForEntities).mockResolvedValue(new Map() as any)

    const result = await loadClassworkPageData(
      { id: 'tutor-1', role: 'tutor' } as any,
      { id: 'class-1', name: 'Math', status: 'active' },
      { q: ' notes ', cat: 'question_papers', subj: 'Maths', sort: 'oldest', from: '2026-07-01' },
    )
    expect(result.filters).toEqual({
      q: 'notes',
      category: 'question_papers',
      subject: 'Maths',
      from: '2026-07-01',
      to: '',
      sort: 'oldest',
    })
    expect(result.hasActiveFilters).toBe(true)
  })

  it('loads archived documents for a manager and skips student lookups', async () => {
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([
      { persona_name: 'tutor', scope_type: null, scope_id: null, status: 'active' },
    ] as any)
    vi.mocked(hasPersona).mockImplementation((_, name) => name === 'tutor')
    const responses = [
      { items: [], total: 0 },
      { items: [doc({ id: 'r2', title: 'Archived Notes' })], total: 1 },
    ]
    let call = 0
    vi.mocked(listResourcesPage).mockImplementation(() => Promise.resolve(responses[call++] as any))
    vi.mocked(listAssignments).mockResolvedValueOnce([] as any)
    vi.mocked(listCommentsForEntities).mockResolvedValue(new Map() as any)

    const result = await loadClassworkPageData(
      { id: 'tutor-1', role: 'tutor' } as any,
      { id: 'class-1', name: 'Math', status: 'active' },
      {},
    )

    expect(result.canManage).toBe(true)
    expect(result.canManageContent).toBe(true)
    expect(result.archivedDocuments).toEqual([doc({ id: 'r2', title: 'Archived Notes' })])
    expect(listMyActiveSubmissions).not.toHaveBeenCalled()
  })

  it('keeps archived-class classwork readable while disabling manager write actions', async () => {
    vi.mocked(listResourcesPage).mockResolvedValue({ items: [], total: 0 } as any)
    vi.mocked(listAssignments).mockResolvedValueOnce([] as any)
    vi.mocked(listCommentsForEntities).mockResolvedValue(new Map() as any)

    const result = await loadClassworkPageData(
      { id: 'tutor-1', role: 'tutor' } as any,
      { id: 'class-1', name: 'Math', status: 'archived' },
      {},
    )

    expect(result.canManage).toBe(true)
    expect(result.canManageContent).toBe(false)
    expect(result.isArchived).toBe(true)
  })
})
