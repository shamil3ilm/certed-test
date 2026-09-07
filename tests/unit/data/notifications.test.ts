import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClientCapturing } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { selectNotificationsPage } from '@/lib/data/notifications'

/**
 * The notification feed was already paged in SQL but had no way to narrow it. Filtering had
 * to go into the QUERY rather than over the fetched page: a page-local filter would page the
 * unfiltered feed and then hide rows from it, so the pager would print the unfiltered total
 * ("Page 1 of 9" above four visible items) and any page holding none of the chosen kind
 * would render empty while claiming more pages exist.
 */

const ME = 'profile-1'

function stub(result: { data: unknown; error: unknown; count?: number }) {
  const { builder, client } = makeClientCapturing(result)
  vi.mocked(createClient).mockResolvedValue(client as never)
  return builder
}

beforeEach(() => vi.resetAllMocks())

describe('notification feed filters run in SQL', () => {
  it('narrows by kind on the query, not on the page', async () => {
    const builder = stub({ data: [], error: null, count: 0 })
    await selectNotificationsPage(ME, { page: 1, pageSize: 30, kind: 'grade' })
    expect(builder.eq).toHaveBeenCalledWith('kind', 'grade')
  })

  it('unread means read_at IS NULL', async () => {
    const builder = stub({ data: [], error: null, count: 0 })
    await selectNotificationsPage(ME, { page: 1, pageSize: 30, read: 'unread' })
    expect(builder.is).toHaveBeenCalledWith('read_at', null)
  })

  it('read means read_at IS NOT NULL', async () => {
    const builder = stub({ data: [], error: null, count: 0 })
    await selectNotificationsPage(ME, { page: 1, pageSize: 30, read: 'read' })
    expect(builder.not).toHaveBeenCalledWith('read_at', 'is', null)
  })

  it('applies no read-state predicate when the filter is absent', async () => {
    // Defaulting either way would silently hide half the feed from someone who asked for
    // all of it.
    const builder = stub({ data: [], error: null, count: 0 })
    await selectNotificationsPage(ME, { page: 1, pageSize: 30 })
    expect(builder.is).not.toHaveBeenCalledWith('read_at', null)
    expect(builder.not).not.toHaveBeenCalled()
    expect(builder.eq).not.toHaveBeenCalledWith('kind', expect.anything())
  })

  it('is always scoped to the caller, whatever else is filtered', async () => {
    const builder = stub({ data: [], error: null, count: 0 })
    await selectNotificationsPage(ME, { page: 1, pageSize: 30, kind: 'message', read: 'unread' })
    expect(builder.eq).toHaveBeenCalledWith('profile_id', ME)
  })
})

describe('notification feed paging', () => {
  it('asks for the requested page, not the first', async () => {
    const builder = stub({ data: [], error: null, count: 0 })
    await selectNotificationsPage(ME, { page: 3, pageSize: 30 })
    expect(builder.range).toHaveBeenCalledWith(60, 89)
  })

  it('orders newest first with a stable tie-break, so a row cannot repeat across pages', async () => {
    // created_at alone is not a total order - a batch notified in one statement shares it,
    // and an unstable sort under paging can show a row twice or skip it entirely.
    const builder = stub({ data: [], error: null, count: 0 })
    await selectNotificationsPage(ME, { page: 1, pageSize: 30 })
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(builder.order).toHaveBeenCalledWith('id', { ascending: true })
  })

  it('reports the query total, which is what the pager counts', async () => {
    stub({ data: [{ id: 'n1' }], error: null, count: 91 })
    await expect(selectNotificationsPage(ME, { page: 1, pageSize: 30 })).resolves.toMatchObject({ total: 91 })
  })

  it('surfaces a PostgREST error rather than reporting an empty feed', async () => {
    stub({ data: null, error: { message: 'boom' } })
    await expect(selectNotificationsPage(ME, { page: 1, pageSize: 30 })).rejects.toThrow(/boom/)
  })
})
