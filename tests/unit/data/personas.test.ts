import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient, makeClientCapturing } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import {
  deactivateOtherGlobalPersonas,
  upsertGlobalPersona,
  deactivateGlobalPersona,
  upsertScopedMentorPersona,
  upsertScopedMentorPersonas,
  deleteScopedMentorPersona,
  selectScopedMenteeIds,
} from '@/lib/data/personas'

const admin = (r: any) => vi.mocked(createAdminClient).mockReturnValueOnce(makeClient(r) as any)

beforeEach(() => vi.resetAllMocks())

describe('personas data layer', () => {
  it('deactivateOtherGlobalPersonas resolves and throws on error', async () => {
    admin({ data: null, error: null })
    await expect(deactivateOtherGlobalPersonas('p1', 'tutor')).resolves.toBeUndefined()
    admin({ data: null, error: { message: 'e' } })
    await expect(deactivateOtherGlobalPersonas('p1', 'tutor')).rejects.toThrow(/data.personas.deactivateOtherGlobal: e/)
  })

  it('upsertGlobalPersona returns early when a soft-removed row is reactivated', async () => {
    // The UPDATE re-activated an existing row (length > 0) -> no INSERT.
    admin({ data: [{ profile_id: 'p1' }], error: null })
    await expect(upsertGlobalPersona('p1', 'tutor')).resolves.toBeUndefined()
  })

  it('upsertGlobalPersona inserts when nothing was reactivated, and throws on a reactivate error', async () => {
    // UPDATE matched nothing (empty) -> falls through to INSERT, which succeeds.
    admin({ data: [], error: null })
    await expect(upsertGlobalPersona('p1', 'tutor')).resolves.toBeUndefined()
    // A reactivate (UPDATE) error surfaces namespaced.
    admin({ data: null, error: { message: 'e' } })
    await expect(upsertGlobalPersona('p1', 'tutor')).rejects.toThrow(/data.personas.upsertGlobal.reactivate: e/)
  })

  it('deactivateGlobalPersona resolves and throws on error', async () => {
    admin({ data: null, error: null })
    await expect(deactivateGlobalPersona('p1', 'mentor')).resolves.toBeUndefined()
    admin({ data: null, error: { message: 'e' } })
    await expect(deactivateGlobalPersona('p1', 'mentor')).rejects.toThrow(/data.personas.deactivateGlobal: e/)
  })

  it('upsertScopedMentorPersona resolves and throws on error', async () => {
    admin({ data: null, error: null })
    await expect(upsertScopedMentorPersona('m1', 's1')).resolves.toBeUndefined()
    admin({ data: null, error: { message: 'e' } })
    await expect(upsertScopedMentorPersona('m1', 's1')).rejects.toThrow(/data.personas.upsertScopedMentor: e/)
  })

  it('deleteScopedMentorPersona resolves and throws on error', async () => {
    admin({ data: null, error: null })
    await expect(deleteScopedMentorPersona('m1', 's1')).resolves.toBeUndefined()
    admin({ data: null, error: { message: 'e' } })
    await expect(deleteScopedMentorPersona('m1', 's1')).rejects.toThrow(/data.personas.deleteScopedMentor: e/)
  })

  it('selectScopedMenteeIds maps scope ids and throws on error', async () => {
    admin({ data: [{ scope_id: 's1' }, { scope_id: 's2' }], error: null })
    expect(await selectScopedMenteeIds('m1')).toEqual(['s1', 's2'])
    admin({ data: null, error: { message: 'e' } })
    await expect(selectScopedMenteeIds('m1')).rejects.toThrow(/data.personas.scopedMentees: e/)
  })
})

/**
 * Restoring a mentor rebuilt one scoped persona per mentee, each its own round trip, so a
 * mentor with thirty mentees issued thirty sequential writes where the shape of the data -
 * identical rows differing only by scope_id - is a single bulk upsert.
 */
describe('upsertScopedMentorPersonas (bulk)', () => {
  it('writes the whole mentee set in ONE round trip', async () => {
    const { builder, client } = makeClientCapturing({ data: null, error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as never)
    await upsertScopedMentorPersonas('m1', ['s1', 's2', 's3'])
    expect(client.from).toHaveBeenCalledTimes(1)
    expect(builder.upsert).toHaveBeenCalledTimes(1)
    expect(builder.upsert.mock.calls[0][0]).toHaveLength(3)
  })

  it('does not touch the database for an empty set', async () => {
    const { client } = makeClientCapturing({ data: null, error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as never)
    await upsertScopedMentorPersonas('m1', [])
    expect(client.from).not.toHaveBeenCalled()
  })
})
