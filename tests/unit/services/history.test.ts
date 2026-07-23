import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/data/audit', () => ({ listAuditPage: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfilesByIds: vi.fn(), listProfiles: vi.fn() }))

import { listAuditPage } from '@/lib/data/audit'
import { getProfilesByIds, listProfiles } from '@/lib/services/users'
import { historyUrl, loadHistoryPageData } from '@/lib/services/page-data/history'

beforeEach(() => vi.resetAllMocks())

describe('historyUrl', () => {
  it('builds the history URL while omitting the default page', () => {
    expect(historyUrl({ page: 1, action: 'grade', actor: 'maya' })).toBe('/admin/history?action=grade&actor=maya')
    expect(historyUrl({ page: 2, action: 'grade', actor: 'maya' })).toBe(
      '/admin/history?page=2&action=grade&actor=maya',
    )
  })
})

describe('loadHistoryPageData', () => {
  it('parses filters, resolves matching actor ids, and decorates rows', async () => {
    vi.mocked(listProfiles).mockResolvedValueOnce([
      { id: 'p1', full_name: 'Maya Mentor', email: 'maya@test.com' },
      { id: 'p2', full_name: 'Other User', email: 'other@test.com' },
    ] as any)
    vi.mocked(listAuditPage).mockResolvedValueOnce({
      items: [
        {
          id: 'a1',
          actor_id: 'p1',
          action: 'submission.grade',
          entity_type: 'submission',
          entity_id: '12345678-0000',
          created_at: '2026-07-16T10:00:00.000Z',
        },
      ],
      total: 26,
    } as any)
    vi.mocked(getProfilesByIds).mockResolvedValueOnce(
      new Map([['p1', { id: 'p1', full_name: 'Maya Mentor', email: 'maya@test.com', role: 'tutor' }]]) as any,
    )

    const result = await loadHistoryPageData({ page: '2', action: 'grade', actor: 'maya' })

    expect(listAuditPage).toHaveBeenCalledWith({
      page: 2,
      pageSize: 25,
      action: 'grade',
      actorIds: ['p1'],
    })
    expect(result.totalPages).toBe(2)
    expect(result.rows).toEqual([
      {
        id: 'a1',
        created_at: '2026-07-16T10:00:00.000Z',
        actorLabel: 'Maya Mentor',
        actionScope: 'submission',
        actionVerb: 'grade',
        actionVerbTone: 'text-slate-700',
        entity_type: 'submission',
        entity_id: '12345678-0000',
        entityShortId: '12345678',
      },
    ])
  })

  it('forces a zero-row actor filter when the actor search matches nobody', async () => {
    vi.mocked(listProfiles).mockResolvedValueOnce([
      { id: 'p1', full_name: 'Maya Mentor', email: 'maya@test.com' },
    ] as any)
    vi.mocked(listAuditPage).mockResolvedValueOnce({ items: [], total: 0 } as any)
    vi.mocked(getProfilesByIds).mockResolvedValueOnce(new Map() as any)

    await loadHistoryPageData({ actor: 'nobody' })

    expect(listAuditPage).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
      action: undefined,
      actorIds: ['00000000-0000-0000-0000-000000000000'],
    })
  })

  it('leaves actor filtering unset when no actor query is present', async () => {
    vi.mocked(listAuditPage).mockResolvedValueOnce({ items: [], total: 0 } as any)
    vi.mocked(getProfilesByIds).mockResolvedValueOnce(new Map() as any)

    await loadHistoryPageData({})

    expect(listProfiles).not.toHaveBeenCalled()
    expect(listAuditPage).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
      action: undefined,
      actorIds: undefined,
    })
  })
})
