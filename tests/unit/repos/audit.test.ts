import { describe, it, expect, vi, beforeEach } from 'vitest'
import { queryBuilder } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { listAuditPage } from '@/lib/repos/audit'

beforeEach(() => vi.resetAllMocks())

describe('listAuditPage', () => {
  it('requests the correct range and returns items + total', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 60 })) }
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    const result = await listAuditPage({ page: 2, pageSize: 25 })
    const builder = client.from.mock.results[0].value
    expect(builder.range).toHaveBeenCalledWith(25, 49)
    expect(result.total).toBe(60)
  })

  it('applies an ilike action filter, escaping wildcards', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 0 })) }
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    await listAuditPage({ page: 1, pageSize: 25, action: '50%_off' })
    const builder = client.from.mock.results[0].value
    expect(builder.ilike).toHaveBeenCalledWith('action', '%50\\%\\_off%')
  })

  it('skips the action filter when blank', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 0 })) }
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    await listAuditPage({ page: 1, pageSize: 25, action: '   ' })
    const builder = client.from.mock.results[0].value
    expect(builder.ilike).not.toHaveBeenCalled()
  })

  it('applies an actorIds filter via .in()', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 0 })) }
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    await listAuditPage({ page: 1, pageSize: 25, actorIds: ['a-1', 'a-2'] })
    const builder = client.from.mock.results[0].value
    expect(builder.in).toHaveBeenCalledWith('actor_id', ['a-1', 'a-2'])
  })
})
