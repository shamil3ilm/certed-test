import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import {
  countActiveResources,
  countResourcesByUploader,
  countActiveAnnouncements,
  countAuditByActorAction,
  sumResourceDownloads,
  selectSessionsForClasses,
  selectTimedAttendanceForStudent,
  selectAttendanceStatusesForClasses,
} from '@/lib/data/analytics'

beforeEach(() => vi.resetAllMocks())

describe('analytics data layer (head-only counts + timing reads)', () => {
  it('countActiveResources returns the exact head count from resources', async () => {
    const client = makeClient({ data: null, error: null, count: 7 })
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    expect(await countActiveResources()).toBe(7)
    expect(client.from).toHaveBeenCalledWith('resources')
  })

  it('a null count coerces to 0', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null, count: null }) as any)
    expect(await countActiveResources()).toBe(0)
  })

  it('count helpers apply their filters and target the right table', async () => {
    const client = makeClient({ data: null, error: null, count: 3 })
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    expect(await countResourcesByUploader('u1')).toBe(3)
    const builder = client.from.mock.results[0].value
    expect(builder.eq).toHaveBeenCalledWith('status', 'active')
    expect(builder.eq).toHaveBeenCalledWith('uploaded_by', 'u1')
  })

  it('countActiveAnnouncements + countAuditByActorAction hit their tables', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null, count: 2 }) as any)
    expect(await countActiveAnnouncements()).toBe(2)
    const client = makeClient({ data: null, error: null, count: 5 })
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    expect(await countAuditByActorAction('a1', 'resource.download')).toBe(5)
    expect(client.from).toHaveBeenCalledWith('audit_log')
  })

  it('a count error throws a namespaced error', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'boom' } }) as any)
    await expect(countActiveResources()).rejects.toThrow(/analytics.count\(resources\): boom/)
  })

  it('sumResourceDownloads reads the total from Postgres, and throws on error', async () => {
    // Summed in SQL since 0103 (sum_active_resource_downloads). It previously paged every
    // active resource row out and reduced in JS - one integer's worth of answer for
    // O(documents) rows over the wire. coalesce() in the function makes null-vs-0 the
    // database's problem, so the app no longer has to treat a missing counter as zero.
    vi.mocked(createAdminClient).mockReturnValueOnce({ rpc: vi.fn(async () => ({ data: 7, error: null })) } as any)
    expect(await sumResourceDownloads()).toBe(7)

    vi.mocked(createAdminClient).mockReturnValueOnce({
      rpc: vi.fn(async () => ({ data: null, error: { message: 'e' } })),
    } as any)
    await expect(sumResourceDownloads()).rejects.toThrow(/analytics.sumResourceDownloads: e/)
  })

  it('sumResourceDownloads calls the aggregate, never a table scan', async () => {
    const rpc = vi.fn(async () => ({ data: 42, error: null }))
    const from = vi.fn()
    vi.mocked(createAdminClient).mockReturnValueOnce({ rpc, from } as any)
    expect(await sumResourceDownloads()).toBe(42)
    expect(rpc).toHaveBeenCalledWith('sum_active_resource_downloads')
    expect(from, 'must not page the resources table to add up a single number').not.toHaveBeenCalled()
  })

  it('selectSessionsForClasses / selectAttendanceStatusesForClasses short-circuit on []', async () => {
    expect(await selectSessionsForClasses([])).toEqual([])
    expect(await selectAttendanceStatusesForClasses([])).toEqual([])
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('selectSessionsForClasses returns rows and throws on error', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: [{ class_id: 'c1' }], error: null }) as any)
    expect(await selectSessionsForClasses(['c1'])).toEqual([{ class_id: 'c1' }])
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(selectSessionsForClasses(['c1'])).rejects.toThrow(/analytics.selectSessionsForClasses: e/)
  })

  it('selectTimedAttendanceForStudent returns join/leave rows and throws on error', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: [{ join_at: 't1', leave_at: 't2' }], error: null }) as any,
    )
    expect(await selectTimedAttendanceForStudent('s1')).toEqual([{ join_at: 't1', leave_at: 't2' }])
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(selectTimedAttendanceForStudent('s1')).rejects.toThrow(/analytics.selectTimedAttendanceForStudent: e/)
  })

  it('selectAttendanceStatusesForClasses returns statuses and throws on error', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: [{ status: 'present' }, { status: 'absent' }], error: null }) as any,
    )
    expect(await selectAttendanceStatusesForClasses(['c1'])).toHaveLength(2)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(selectAttendanceStatusesForClasses(['c1'])).rejects.toThrow(
      /analytics.selectAttendanceStatusesForClasses: e/,
    )
  })
})
