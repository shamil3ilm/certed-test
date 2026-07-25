import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { selectDocById, selectDocLines } from '@/lib/data/finance-docs'

beforeEach(() => vi.resetAllMocks())

describe('finance document data reads', () => {
  it('throws when the document lookup query fails', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: { message: 'rls exploded' } }) as any)
    await expect(selectDocById('receipt', 'doc-1')).rejects.toThrow('receipt.getById: rls exploded')
  })

  it('throws when the line-item query fails', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: null, error: { message: 'line read failed' } }) as any,
    )
    await expect(selectDocLines('payslip', 'doc-1')).rejects.toThrow('payslip.getLines: line read failed')
  })
})
