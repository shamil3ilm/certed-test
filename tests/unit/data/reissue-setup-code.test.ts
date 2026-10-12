import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient, makeClientCapturing } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { reissueSetupCodeForUnclaimed } from '@/lib/data/profiles-auth'

beforeEach(() => vi.resetAllMocks())

describe('reissueSetupCodeForUnclaimed', () => {
  it('writes the new hash and expiry, and reports the row it matched', async () => {
    const { builder, client } = makeClientCapturing({ data: { id: 'p1' }, error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    expect(await reissueSetupCodeForUnclaimed('p1', 'HASH', '2026-10-19T00:00:00.000Z')).toBe(true)
    expect(builder.update).toHaveBeenCalledWith({
      setup_code_hash: 'HASH',
      setup_code_expires_at: '2026-10-19T00:00:00.000Z',
    })
  })

  // The two guards are the whole security value of this function, so they are asserted as
  // calls rather than inferred from a passing write.
  it('refuses a claimed account and a non-pending one, in the write itself', async () => {
    const { builder, client } = makeClientCapturing({ data: { id: 'p1' }, error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    await reissueSetupCodeForUnclaimed('p1', 'HASH', 'exp')

    // One query, so the recorded filters unambiguously belong to it.
    expect(client.from).toHaveBeenCalledTimes(1)
    expect(builder.eq).toHaveBeenCalledWith('id', 'p1')
    expect(builder.is).toHaveBeenCalledWith('auth_user_id', null)
    expect(builder.eq).toHaveBeenCalledWith('status', 'pending')
  })

  it('reports false when nothing matched, rather than throwing', async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeClient({ data: null, error: null }) as never)
    expect(await reissueSetupCodeForUnclaimed('p1', 'HASH', 'exp')).toBe(false)
  })

  // A failed write must NOT read as "already claimed": that would tell an admin the account
  // is live when the database merely errored.
  it('throws on a write error instead of reporting false', async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeClient({ data: null, error: { message: 'boom' } }) as never)
    await expect(reissueSetupCodeForUnclaimed('p1', 'HASH', 'exp')).rejects.toThrow(/reissueSetupCode/)
  })
})
