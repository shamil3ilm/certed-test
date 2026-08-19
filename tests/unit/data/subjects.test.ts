import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  selectActiveSubjects,
  selectSubjectById,
  selectSubjectsByIds,
  selectSubjectByName,
  insertSubject,
  updateSubjectActive,
} from '@/lib/data/subjects'

const row = { id: 's1', name: 'Mathematics', active: true, created_at: 't' }

beforeEach(() => vi.resetAllMocks())

describe('subjects data layer', () => {
  it('selectActiveSubjects returns rows via the RLS client, from subjects', async () => {
    const client = makeClient({ data: [row], error: null })
    vi.mocked(createClient).mockResolvedValue(client as any)
    expect(await selectActiveSubjects()).toEqual([row])
    expect(client.from).toHaveBeenCalledWith('subjects')
  })

  it('selectActiveSubjects throws a namespaced error on a query error', async () => {
    vi.mocked(createClient).mockResolvedValue(makeClient({ data: null, error: { message: 'boom' } }) as any)
    await expect(selectActiveSubjects()).rejects.toThrow(/subjects.listActive: boom/)
  })

  it('selectSubjectById returns the row or null (service role)', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: row, error: null }) as any)
    expect(await selectSubjectById('s1')).toEqual(row)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    expect(await selectSubjectById('missing')).toBeNull()
  })

  it('selectSubjectsByIds short-circuits on [] and never opens a client', async () => {
    expect(await selectSubjectsByIds([])).toEqual([])
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('selectSubjectsByIds returns rows for a non-empty id set', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: [row], error: null }) as any)
    expect(await selectSubjectsByIds(['s1'])).toEqual([row])
  })

  it('selectSubjectByName returns a match or null (case-insensitive lookup)', async () => {
    const client = makeClient({ data: row, error: null })
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    expect(await selectSubjectByName('Mathematics')).toEqual(row)
    // LIKE metacharacters in the name are escaped so they match literally.
    const client2 = makeClient({ data: null, error: null })
    vi.mocked(createAdminClient).mockReturnValueOnce(client2 as any)
    expect(await selectSubjectByName('100%_calc')).toBeNull()
    const builder = client2.from.mock.results[0].value
    expect(builder.ilike).toHaveBeenCalledWith('name', '100\\%\\_calc')
  })

  it('insertSubject trims the name, returns the created row, throws on error', async () => {
    const client = makeClient({ data: row, error: null })
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    expect(await insertSubject('  Mathematics  ', 'admin-1')).toEqual(row)
    const builder = client.from.mock.results[0].value
    expect(builder.insert).toHaveBeenCalledWith({ name: 'Mathematics', created_by: 'admin-1' })

    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'dup' } }) as any)
    await expect(insertSubject('X', 'a')).rejects.toThrow(/subjects.create: dup/)
  })

  it('updateSubjectActive resolves on success and throws on error', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await expect(updateSubjectActive('s1', false)).resolves.toBeUndefined()
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'no' } }) as any)
    await expect(updateSubjectActive('s1', true)).rejects.toThrow(/subjects.setActive: no/)
  })
})
