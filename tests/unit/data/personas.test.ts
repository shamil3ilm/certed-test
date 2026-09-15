import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { selectScopedMenteeIds } from '@/lib/data/personas'

const admin = (r: any) => vi.mocked(createAdminClient).mockReturnValueOnce(makeClient(r) as any)

beforeEach(() => vi.resetAllMocks())

describe('personas data layer', () => {
  it('selectScopedMenteeIds maps scope ids and throws on error', async () => {
    admin({ data: [{ scope_id: 's1' }, { scope_id: 's2' }], error: null })
    expect(await selectScopedMenteeIds('m1')).toEqual(['s1', 's2'])
    admin({ data: null, error: { message: 'e' } })
    await expect(selectScopedMenteeIds('m1')).rejects.toThrow(/data.personas.scopedMentees: e/)
  })
})
