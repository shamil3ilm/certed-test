import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  selectAllClasses,
  countActiveClasses,
  selectAllClassIds,
  selectClassesByIds,
  insertClass,
  selectClassStatus,
  selectClassNamesByIdsAsService,
  selectClassesByIdsAsCaller,
  selectClassIdsBySubject,
} from '@/lib/data/classes'

const cls = { id: 'c1', name: 'Math', status: 'active' }

beforeEach(() => vi.resetAllMocks())

describe('classes data layer', () => {
  it('selectAllClasses returns rows (RLS) and throws on error', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: [cls], error: null }) as any)
    expect(await selectAllClasses()).toEqual([cls])
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(selectAllClasses()).rejects.toThrow(/classes.list: e/)
  })

  it('countActiveClasses returns the head count (0 when null)', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null, count: 9 }) as any)
    expect(await countActiveClasses()).toBe(9)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null, count: null }) as any)
    expect(await countActiveClasses()).toBe(0)
  })

  it('selectAllClassIds maps to a flat id list (service role)', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: [{ id: 'c1' }, { id: 'c2' }], error: null }) as any,
    )
    expect(await selectAllClassIds()).toEqual(['c1', 'c2'])
  })

  it('selectClassesByIds short-circuits on [] and returns rows otherwise', async () => {
    expect(await selectClassesByIds([])).toEqual([])
    expect(createAdminClient).not.toHaveBeenCalled()
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: [cls], error: null }) as any)
    expect(await selectClassesByIds(['c1'])).toEqual([cls])
  })

  it('insertClass returns the created row and throws on error', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: cls, error: null }) as any)
    expect(await insertClass('Math', 'subj1')).toEqual(cls)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'dup' } }) as any)
    await expect(insertClass('Math')).rejects.toThrow(/classes.create: dup/)
  })

  it('selectClassStatus returns the status or null (service role)', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: { status: 'archived' }, error: null }) as any)
    expect(await selectClassStatus('c1')).toBe('archived')
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    expect(await selectClassStatus('gone')).toBeNull()
  })

  it('selectClassNamesByIdsAsService short-circuits on [] and returns id/name rows', async () => {
    expect(await selectClassNamesByIdsAsService([])).toEqual([])
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: [{ id: 'c1', name: 'Math' }], error: null }) as any,
    )
    expect(await selectClassNamesByIdsAsService(['c1'])).toEqual([{ id: 'c1', name: 'Math' }])
  })
})

describe('the Classes list reads through the CALLER, not the service role', () => {
  it('selectClassesByIdsAsCaller uses the RLS client, so RLS is the gate', async () => {
    // The list is built a page of students at a time, so it can no longer pre-resolve
    // "every class this person may read" and filter against it - RLS has to decide
    // directly. Read with the service role instead and the list would happily offer links
    // the class page then refuses, which is the exact regression selectVisibleClassIds was
    // introduced to prevent.
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: [cls], error: null }) as any)
    expect(await selectClassesByIdsAsCaller(['c1'])).toEqual([cls])
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('selectClassesByIdsAsCaller short-circuits on [] without a round trip', async () => {
    expect(await selectClassesByIdsAsCaller([])).toEqual([])
    expect(createClient).not.toHaveBeenCalled()
  })

  it('selectClassesByIdsAsCaller surfaces an error rather than returning an empty list', async () => {
    // Silently returning [] would read as "you may see no classes" - indistinguishable from
    // a real empty roster, and it would hide a broken policy.
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: { message: 'boom' } }) as any)
    await expect(selectClassesByIdsAsCaller(['c1'])).rejects.toThrow(/boom/)
  })

  it('selectClassIdsBySubject filters on the subject and returns bare ids', async () => {
    const client = makeClient({ data: [{ id: 'c1' }], error: null })
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    expect(await selectClassIdsBySubject('sub-1')).toEqual(['c1'])
    expect(client.from.mock.results[0].value.eq).toHaveBeenCalledWith('subject_id', 'sub-1')
  })
})
