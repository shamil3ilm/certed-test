import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/data/audit', () => ({ listAuditPage: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfilesByIds: vi.fn(), searchProfileIds: vi.fn() }))
vi.mock('@/lib/capabilities', () => ({ isAdminTier: vi.fn() }))

import { listAuditPage } from '@/lib/data/audit'
import { getProfilesByIds, searchProfileIds } from '@/lib/services/users'
import { isAdminTier } from '@/lib/capabilities'
import { historyUrl, loadHistoryPageData } from '@/lib/services/page-data/history'

const admin = { id: 'admin-1' } as never

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(isAdminTier).mockReturnValue(true) // default: super viewer (unclamped, no redaction)
})

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
    vi.mocked(searchProfileIds).mockResolvedValueOnce(['p1'])
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

    const result = await loadHistoryPageData(admin, { page: '2', action: 'grade', actor: 'maya' })

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
        // A submission is not a person, so the Target column keeps its type and short id.
        targetLabel: null,
      },
    ])
  })

  it('forces a zero-row actor filter when the actor search matches nobody', async () => {
    vi.mocked(searchProfileIds).mockResolvedValueOnce([])
    vi.mocked(listAuditPage).mockResolvedValueOnce({ items: [], total: 0 } as any)
    vi.mocked(getProfilesByIds).mockResolvedValueOnce(new Map() as any)

    await loadHistoryPageData(admin, { actor: 'nobody' })

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

    await loadHistoryPageData(admin, {})

    expect(searchProfileIds).not.toHaveBeenCalled()
    expect(listAuditPage).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
      action: undefined,
      actorIds: undefined,
    })
  })

  it('for a NON-super viewer, clamps the actor search to non-admin roles and redacts an admin-tier actor', async () => {
    vi.mocked(isAdminTier).mockReturnValue(false)
    vi.mocked(searchProfileIds).mockResolvedValueOnce(['admin1'])
    vi.mocked(listAuditPage).mockResolvedValueOnce({
      items: [
        {
          id: 'a2',
          actor_id: 'admin1',
          action: 'user.revoke',
          entity_type: 'profile',
          entity_id: 'e2',
          created_at: '2026-07-16T10:00:00.000Z',
        },
      ],
      total: 1,
    } as any)
    vi.mocked(getProfilesByIds).mockResolvedValueOnce(
      new Map([['admin1', { id: 'admin1', full_name: 'Asha Admin', email: 'admin@test.com', role: 'admin' }]]) as any,
    )

    const result = await loadHistoryPageData({ id: 'sub-1' } as never, { actor: 'asha' })

    // The search may only match non-admin roles - no admin existence oracle.
    expect(searchProfileIds).toHaveBeenCalledWith('asha', ['student', 'tutor', 'mentor'])
    // The admin actor's identity is redacted to the tier.
    expect(result.rows[0].actorLabel).toBe('Administrator')
  })
})

describe('the Target column names a person', () => {
  const rowFor = (entity_type: string, entity_id: string | null) => ({
    id: 'a1',
    actor_id: 'p1',
    action: 'user.revoke',
    entity_type,
    entity_id,
    created_at: '2026-09-27T10:00:00.000Z',
  })

  it('resolves a profile target to their name, and fetches actors and targets in one lookup', async () => {
    vi.mocked(listAuditPage).mockResolvedValueOnce({ items: [rowFor('profile', 'p2')], total: 1 } as any)
    vi.mocked(getProfilesByIds).mockResolvedValueOnce(
      new Map([
        ['p1', { id: 'p1', full_name: 'Ada Admin', email: 'ada@test.com', role: 'admin' }],
        ['p2', { id: 'p2', full_name: 'Riya Student', email: 'riya@test.com', role: 'student' }],
      ]) as any,
    )

    const result = await loadHistoryPageData(admin, {})

    expect(result.rows[0].targetLabel).toBe('Riya Student')
    // An id tells the reader nothing about whose account was revoked; the name does.
    expect(result.rows[0].entityShortId).toBe('p2')
    expect(getProfilesByIds).toHaveBeenCalledTimes(1)
    expect(getProfilesByIds).toHaveBeenCalledWith(['p1', 'p2'])
  })

  it('redacts an admin-tier target for a viewer who is not admin-tier', async () => {
    // The Who column refuses to be an admin oracle; Target must not become one either.
    vi.mocked(isAdminTier).mockReturnValue(false)
    vi.mocked(listAuditPage).mockResolvedValueOnce({ items: [rowFor('profile', 'p2')], total: 1 } as any)
    vi.mocked(getProfilesByIds).mockResolvedValueOnce(
      new Map([['p2', { id: 'p2', full_name: 'Ada Admin', email: 'ada@test.com', role: 'admin' }]]) as any,
    )

    const result = await loadHistoryPageData(admin, {})

    expect(result.rows[0].targetLabel).toBe('Administrator')
  })

  it('never shows an email to a viewer who is not admin-tier', async () => {
    vi.mocked(isAdminTier).mockReturnValue(false)
    vi.mocked(listAuditPage).mockResolvedValueOnce({ items: [rowFor('profile', 'abcdef12-0000')], total: 1 } as any)
    vi.mocked(getProfilesByIds).mockResolvedValueOnce(
      new Map([
        ['abcdef12-0000', { id: 'abcdef12-0000', full_name: null, email: 'riya@test.com', role: 'student' }],
      ]) as any,
    )

    const result = await loadHistoryPageData(admin, {})

    expect(result.rows[0].targetLabel).toBe('User abcdef12')
  })

  it('leaves a non-person target as its type and short id', async () => {
    vi.mocked(listAuditPage).mockResolvedValueOnce({ items: [rowFor('receipt', '87654321-0000')], total: 1 } as any)
    vi.mocked(getProfilesByIds).mockResolvedValueOnce(new Map() as any)

    const result = await loadHistoryPageData(admin, {})

    expect(result.rows[0].targetLabel).toBeNull()
    expect(result.rows[0].entity_type).toBe('receipt')
    expect(result.rows[0].entityShortId).toBe('87654321')
  })

  it('keeps the row readable when the person is gone', async () => {
    // Erasure removes the profile; the audit row outlives it, which is the point of the log.
    vi.mocked(listAuditPage).mockResolvedValueOnce({ items: [rowFor('profile', 'deleted1-0000')], total: 1 } as any)
    vi.mocked(getProfilesByIds).mockResolvedValueOnce(new Map() as any)

    const result = await loadHistoryPageData(admin, {})

    expect(result.rows[0].targetLabel).toBeNull()
    expect(result.rows[0].entityShortId).toBe('deleted1')
  })
})
