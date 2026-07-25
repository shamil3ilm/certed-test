import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/permission/personas', () => ({
  loadActivePersonas: vi.fn(),
  hasPersona: vi.fn(),
  loadPersonaFlags: vi.fn(),
}))
vi.mock('@/lib/services/assignments', () => ({ listAssignments: vi.fn() }))
vi.mock('@/lib/services/comments', () => ({ listCommentsForEntities: vi.fn() }))
vi.mock('@/lib/services/resources', () => ({ listResourcesPage: vi.fn() }))
vi.mock('@/lib/services/submissions', () => ({
  listMyActiveSubmissions: vi.fn(),
  listMySupersededSubmissions: vi.fn(),
}))

import { loadActivePersonas, hasPersona, loadPersonaFlags } from '@/lib/permission/personas'
import { listAssignments } from '@/lib/services/assignments'
import { loadClassworkPageData, classworkPageUrl } from '@/lib/services/page-data/classwork'
import { listCommentsForEntities } from '@/lib/services/comments'
import { listResourcesPage } from '@/lib/services/resources'
import { listMyActiveSubmissions, listMySupersededSubmissions } from '@/lib/services/submissions'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadPersonaFlags).mockImplementation(async (profileId: string) => {
    if (profileId === 'student-1') {
      return {
        personas: [],
        isAdmin: false,
        isSubAdmin: false,
        isManager: false,
        isStudent: true,
        isMentor: false,
      } as any
    }
    return {
      personas: [],
      isAdmin: false,
      isSubAdmin: false,
      isManager: true,
      isStudent: false,
      isMentor: false,
    } as any
  })
})

describe('classworkPageUrl', () => {
  it('builds classwork material URLs while omitting default values', () => {
    expect(classworkPageUrl(1)).toBe('?')
    expect(classworkPageUrl(2, 'notes')).toBe('?matPage=2&matQ=notes')
  })
})

describe('loadClassworkPageData', () => {
  it('loads the student classwork view with visible assignments and mapped comments', async () => {
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([
      { persona_name: 'student', scope_type: null, scope_id: null, status: 'active' },
    ] as any)
    vi.mocked(hasPersona).mockImplementation((_, name) => name === 'student')
    const resourcePageResponses = [
      { items: [{ id: 'r1', title: 'Notes', created_at: '2026-07-15T00:00:00.000Z' }], total: 11 },
      { items: [], total: 0 },
    ]
    let resourcePageCallCount = 0
    vi.mocked(listResourcesPage).mockImplementation(() =>
      Promise.resolve(resourcePageResponses[resourcePageCallCount++] as any),
    )
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
      { id: 'class-1', name: 'Math' },
      { matPage: '2', matQ: ' notes ' },
    )

    expect(result.canManage).toBe(false)
    expect(result.materialsPage).toBe(2)
    expect(result.materialsQuery).toBe('notes')
    expect(result.materialsTotalPages).toBe(2)
    expect(result.assignmentViews).toHaveLength(1)
    expect(result.assignmentViews[0].submission?.id).toBe('s1')
    expect(result.assignmentViews[0].submissionComments).toEqual([{ id: 'c1' }])
    expect(result.assignmentViews[0].submissionHistory.map((s) => s.id)).toEqual(['s0'])
    expect(result.resourceViews[0].comments).toEqual([{ id: 'c2' }])
    expect(result.archivedResources).toEqual([])
  })

  it('loads archived resources for a manager and skips student submission lookups', async () => {
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([
      { persona_name: 'tutor', scope_type: null, scope_id: null, status: 'active' },
    ] as any)
    vi.mocked(hasPersona).mockImplementation((_, name) => name === 'tutor')
    const resourcePageResponses = [
      { items: [], total: 0 },
      { items: [{ id: 'r2', title: 'Archived Notes' }], total: 1 },
    ]
    let resourcePageCallCount = 0
    vi.mocked(listResourcesPage).mockImplementation(() =>
      Promise.resolve(resourcePageResponses[resourcePageCallCount++] as any),
    )
    vi.mocked(listAssignments).mockResolvedValueOnce([] as any)
    vi.mocked(listCommentsForEntities)
      .mockResolvedValueOnce(new Map() as any)
      .mockResolvedValueOnce(new Map() as any)

    const result = await loadClassworkPageData(
      { id: 'tutor-1', role: 'tutor' } as any,
      { id: 'class-1', name: 'Math' },
      {},
    )

    expect(result.canManage).toBe(true)
    expect(result.archivedResources).toEqual([{ id: 'r2', title: 'Archived Notes' }])
    expect(listMyActiveSubmissions).not.toHaveBeenCalled()
  })
})
