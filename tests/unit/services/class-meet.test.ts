import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/permission/personas', () => ({
  loadActivePersonas: vi.fn(),
  hasPersona: vi.fn(),
  loadPersonaFlags: vi.fn(),
}))
vi.mock('@/lib/services/comments', () => ({ listCommentsForEntities: vi.fn() }))
vi.mock('@/lib/services/meet-links', () => ({ listMeetLinks: vi.fn() }))

import { loadActivePersonas, hasPersona, loadPersonaFlags } from '@/lib/permission/personas'
import { loadClassMeetViewData } from '@/lib/services/page-data/class-meet'
import { listCommentsForEntities } from '@/lib/services/comments'
import { listMeetLinks } from '@/lib/services/meet-links'

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
    return { personas: [], isAdmin: true, isSubAdmin: false, isManager: true, isStudent: false, isMentor: false } as any
  })
})

describe('loadClassMeetViewData', () => {
  it('splits active and archived meet links for a manager', async () => {
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([
      { persona_name: 'admin', scope_type: null, scope_id: null, status: 'active' },
    ] as any)
    vi.mocked(hasPersona).mockImplementation((_, name) => name === 'admin')
    vi.mocked(listMeetLinks).mockResolvedValueOnce([
      { id: 'm1', class_id: 'class-1', title: 'Live class meet', active: true },
      { id: 'm2', class_id: null, title: 'Archived global meet', active: false },
    ] as any)
    vi.mocked(listCommentsForEntities).mockResolvedValueOnce(new Map([['m1', [{ id: 'c1' }]]]) as any)

    const result = await loadClassMeetViewData(
      { id: 'admin-1', role: 'admin', email: 'admin@test.com', full_name: 'Admin' } as any,
      { id: 'class-1', name: 'Math', status: 'active' },
    )

    expect(result.canManageContent).toBe(true)
    expect(result.isArchived).toBe(false)
    expect(result.meetLinks).toEqual([{ id: 'm1', class_id: 'class-1', title: 'Live class meet', active: true }])
    expect(result.archivedMeetLinks).toEqual([
      { id: 'm2', class_id: null, title: 'Archived global meet', active: false },
    ])
    expect(result.classList).toEqual([{ id: 'class-1', name: 'Math' }])
  })

  it('hides archived meet links from a student view but still shows active ones', async () => {
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([
      { persona_name: 'student', scope_type: null, scope_id: null, status: 'active' },
    ] as any)
    vi.mocked(hasPersona).mockImplementation(() => false)
    vi.mocked(listMeetLinks).mockResolvedValueOnce([
      { id: 'm1', class_id: 'class-1', title: 'Live', active: true },
    ] as any)
    vi.mocked(listCommentsForEntities).mockResolvedValueOnce(new Map() as any)

    const result = await loadClassMeetViewData(
      { id: 'student-1', role: 'student', email: 'student@test.com', full_name: 'Student' } as any,
      { id: 'class-1', name: 'Math', status: 'active' },
    )

    expect(result.canManage).toBe(false)
    expect(result.canManageContent).toBe(false)
    expect(result.archivedMeetLinks).toEqual([])
    expect(result.meetLinks).toEqual([{ id: 'm1', class_id: 'class-1', title: 'Live', active: true }])
  })

  it('disables manager write actions on an archived class', async () => {
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([
      { persona_name: 'admin', scope_type: null, scope_id: null, status: 'active' },
    ] as any)
    vi.mocked(hasPersona).mockImplementation((_, name) => name === 'admin')
    vi.mocked(listMeetLinks).mockResolvedValueOnce([] as any)
    vi.mocked(listCommentsForEntities).mockResolvedValueOnce(new Map() as any)

    const result = await loadClassMeetViewData(
      { id: 'admin-1', role: 'admin', email: 'admin@test.com', full_name: 'Admin' } as any,
      { id: 'class-1', name: 'Math', status: 'archived' },
    )

    expect(result.canManage).toBe(true)
    expect(result.canManageContent).toBe(false)
    expect(result.isArchived).toBe(true)
  })
})
