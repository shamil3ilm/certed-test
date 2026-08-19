import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import {
  selectResourcePage,
  selectRecentForClasses,
  selectResourceById,
  insertResource,
  updateResourceStatus,
} from '@/lib/data/resources'

const rls = (r: any) => vi.mocked(createClient).mockResolvedValueOnce(makeClient(r) as any)
const res = { id: 'r1', title: 'Notes', status: 'active' }

beforeEach(() => vi.resetAllMocks())

describe('resources data layer', () => {
  it('selectResourcePage returns rows + an exact total and throws on error', async () => {
    rls({ data: [res], error: null, count: 8 })
    const page = await selectResourcePage('c1', { status: 'active', from: 0, to: 9 } as any)
    expect(page.total).toBe(8)
    rls({ data: null, error: { message: 'e' } })
    await expect(selectResourcePage('c1', { status: 'active', from: 0, to: 9 } as any)).rejects.toThrow(
      /resources.listPage: e/,
    )
  })

  it('selectRecentForClasses short-circuits on [] and returns rows otherwise', async () => {
    expect(await selectRecentForClasses([], 5)).toEqual([])
    expect(createClient).not.toHaveBeenCalled()
    rls({ data: [res], error: null })
    expect(await selectRecentForClasses(['c1'], 5)).toEqual([res])
    rls({ data: null, error: { message: 'e' } })
    await expect(selectRecentForClasses(['c1'], 5)).rejects.toThrow(/resources.listRecentForClasses: e/)
  })

  it('selectResourceById returns the resource or null', async () => {
    rls({ data: res, error: null })
    expect(await selectResourceById('r1')).toEqual(res)
    rls({ data: null, error: null })
    expect(await selectResourceById('gone')).toBeNull()
  })

  it('insertResource returns the created row and throws on error', async () => {
    rls({ data: res, error: null })
    expect(await insertResource({ title: 'Notes' } as any)).toEqual(res)
    rls({ data: null, error: { message: 'e' } })
    await expect(insertResource({} as any)).rejects.toThrow(/resources.createLink: e/)
  })

  it('updateResourceStatus names its error by the target status (archive vs restore)', async () => {
    rls({ data: null, error: null })
    await expect(updateResourceStatus('r1', 'active')).resolves.toBeUndefined()
    rls({ data: null, error: { message: 'e' } })
    await expect(updateResourceStatus('r1', 'archived')).rejects.toThrow(/resources.archive: e/)
    rls({ data: null, error: { message: 'e' } })
    await expect(updateResourceStatus('r1', 'active')).rejects.toThrow(/resources.restore: e/)
  })
})
