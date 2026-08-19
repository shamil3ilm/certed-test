import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import {
  selectProfilesByFilter,
  selectProfilePage,
  countProfiles,
  selectProfilesLiteByIds,
  selectProfileIdsBySearch,
  selectProfileById,
  selectProfileRole,
} from '@/lib/data/profiles-directory'

const admin = (r: any) => vi.mocked(createAdminClient).mockReturnValueOnce(makeClient(r) as any)
const p = { id: 'p1', full_name: 'Asha', email: 'a@x', role: 'admin', status: 'active' }

beforeEach(() => vi.resetAllMocks())

describe('profiles-directory data layer', () => {
  it('selectProfilesByFilter returns rows (with role/status filters) and throws on error', async () => {
    const client = makeClient({ data: [p], error: null })
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    expect(await selectProfilesByFilter({ role: ['admin', 'tutor'], status: 'active' })).toHaveLength(1)
    admin({ data: null, error: { message: 'e' } })
    await expect(selectProfilesByFilter({})).rejects.toThrow(/data.profiles.selectByFilter: e/)
  })

  it('selectProfilePage returns rows + an exact total and throws on error', async () => {
    admin({ data: [p], error: null, count: 25 })
    const page = await selectProfilePage({ role: 'student' } as any, { from: 0, to: 9 } as any)
    expect(page.total).toBe(25)
    admin({ data: null, error: { message: 'e' } })
    await expect(selectProfilePage({} as any, { from: 0, to: 9 } as any)).rejects.toThrow(/data.profiles.selectPage: e/)
  })

  it('countProfiles returns the head count and throws on error', async () => {
    admin({ data: null, error: null, count: 11 })
    expect(await countProfiles({ role: 'tutor', status: 'active' })).toBe(11)
    admin({ data: null, error: { message: 'e' } })
    await expect(countProfiles({})).rejects.toThrow(/data.profiles.count: e/)
  })

  it('selectProfilesLiteByIds short-circuits on [] and returns lite rows otherwise', async () => {
    expect(await selectProfilesLiteByIds([])).toEqual([])
    expect(createAdminClient).not.toHaveBeenCalled()
    admin({ data: [p], error: null })
    expect(await selectProfilesLiteByIds(['p1'])).toHaveLength(1)
  })

  it('selectProfileIdsBySearch maps to a flat id list and throws on error', async () => {
    admin({ data: [{ id: 'p1' }, { id: 'p2' }], error: null })
    expect(await selectProfileIdsBySearch('asha')).toEqual(['p1', 'p2'])
    admin({ data: null, error: { message: 'e' } })
    await expect(selectProfileIdsBySearch('x')).rejects.toThrow(/data.profiles.selectIdsBySearch: e/)
  })

  it('selectProfileById returns the profile or null', async () => {
    admin({ data: p, error: null })
    expect((await selectProfileById('p1'))?.id).toBe('p1')
    admin({ data: null, error: null })
    expect(await selectProfileById('gone')).toBeNull()
  })

  it('selectProfileRole returns the role and throws on error', async () => {
    admin({ data: { role: 'tutor' }, error: null })
    expect(await selectProfileRole('p1')).toBe('tutor')
    admin({ data: null, error: { message: 'e' } })
    await expect(selectProfileRole('p1')).rejects.toThrow(/data.profiles.selectRole: e/)
  })
})
