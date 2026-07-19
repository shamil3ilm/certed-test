import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/permission/personas', () => ({
  loadActivePersonas: vi.fn(),
  hasPersona: vi.fn(),
  loadPersonaFlags: vi.fn(),
}))
vi.mock('@/lib/services/announcements', () => ({ listAnnouncementsForClassPage: vi.fn() }))
vi.mock('@/lib/services/comments', () => ({ listCommentsForEntities: vi.fn() }))
vi.mock('@/lib/services/meet-links', () => ({ listMeetLinks: vi.fn() }))

import { loadActivePersonas, hasPersona, loadPersonaFlags } from '@/lib/permission/personas'
import { listAnnouncementsForClassPage } from '@/lib/services/announcements'
import { classStreamPageUrl, loadClassStreamViewData } from '@/lib/services/page-data/class-stream'
import { listCommentsForEntities } from '@/lib/services/comments'
import { listMeetLinks } from '@/lib/services/meet-links'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadPersonaFlags).mockImplementation(async (profileId: string) => {
    if (profileId === 'student-1') {
      return { personas: [], isAdmin: false, isSubAdmin: false, isManager: false, isStudent: true, isMentor: false } as any
    }
    return { personas: [], isAdmin: true, isSubAdmin: false, isManager: true, isStudent: false, isMentor: false } as any
  })
})

describe('classStreamPageUrl', () => {
  it('builds stream URLs while omitting default page/search', () => {
    expect(classStreamPageUrl(1)).toBe('?')
    expect(classStreamPageUrl(2, 'exam')).toBe('?streamPage=2&streamQ=exam')
  })
})

describe('loadClassStreamViewData', () => {
  it('loads and shapes the admin stream view', async () => {
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([{ persona_name: 'admin', scope_type: null, scope_id: null, status: 'active' }] as any)
    vi.mocked(hasPersona).mockImplementation((_, name) => name === 'admin')
    vi.mocked(listAnnouncementsForClassPage)
      .mockResolvedValueOnce({
        items: [{ id: 'a1', class_id: 'class-1', title: 'Class post', message: 'Hello', created_at: '2026-07-16T10:00:00.000Z' }],
        total: 11,
      } as any)
      .mockResolvedValueOnce({
        items: [
          { id: 'a2', class_id: 'class-1', title: 'Archived class', message: '', created_at: '2026-07-16T09:00:00.000Z' },
          { id: 'a3', class_id: null, title: 'Archived global', message: '', created_at: '2026-07-16T08:00:00.000Z' },
        ],
        total: 2,
      } as any)
    vi.mocked(listMeetLinks).mockResolvedValueOnce([
      { id: 'm1', class_id: 'class-1', title: 'Live class meet', active: true },
      { id: 'm2', class_id: null, title: 'Archived global meet', active: false },
    ] as any)
    vi.mocked(listCommentsForEntities).mockResolvedValueOnce(new Map([['m1', [{ id: 'c1' }]]]) as any)

    const result = await loadClassStreamViewData(
      { id: 'admin-1', role: 'admin', email: 'admin@test.com', full_name: 'Admin' } as any,
      { id: 'class-1', name: 'Math' },
      { streamPage: '2', streamQ: ' exam ' },
    )

    expect(listAnnouncementsForClassPage).toHaveBeenNthCalledWith(1, 'class-1', {
      page: 2,
      pageSize: 10,
      status: 'active',
      search: 'exam',
    })
    expect(result.streamTotalPages).toBe(2)
    expect(result.archivedAnnouncements).toHaveLength(2)
    expect(result.meetLinks).toEqual([{ id: 'm1', class_id: 'class-1', title: 'Live class meet', active: true }])
    expect(result.archivedMeetLinks).toEqual([{ id: 'm2', class_id: null, title: 'Archived global meet', active: false }])
    expect(result.classList).toEqual([{ id: 'class-1', name: 'Math' }])
  })

  it('hides archived manager-only data from a student view', async () => {
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([{ persona_name: 'student', scope_type: null, scope_id: null, status: 'active' }] as any)
    vi.mocked(hasPersona).mockImplementation(() => false)
    vi.mocked(listAnnouncementsForClassPage).mockResolvedValueOnce({ items: [], total: 0 } as any)
    vi.mocked(listMeetLinks).mockResolvedValueOnce([{ id: 'm1', class_id: 'class-1', title: 'Live', active: true }] as any)
    vi.mocked(listCommentsForEntities).mockResolvedValueOnce(new Map() as any)

    const result = await loadClassStreamViewData(
      { id: 'student-1', role: 'student', email: 'student@test.com', full_name: 'Student' } as any,
      { id: 'class-1', name: 'Math' },
      {},
    )

    expect(listAnnouncementsForClassPage).toHaveBeenCalledTimes(1)
    expect(result.canManage).toBe(false)
    expect(result.archivedAnnouncements).toEqual([])
    expect(result.archivedMeetLinks).toEqual([])
  })
})
