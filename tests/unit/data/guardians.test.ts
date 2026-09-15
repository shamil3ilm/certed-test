import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClientCapturing } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import {
  deleteGuardiansForStudent,
  selectGuardiansByStudent,
  callAddGuardian,
  deleteGuardian,
  callMakeGuardianPrimary,
} from '@/lib/data/guardians'

/**
 * Guardians hold a minor's emergency contact details, and every write here runs through
 * the SERVICE-ROLE client - RLS never sees it, so the `student_id` filter on each mutation
 * is the only thing keeping one student's row out of another student's request. The module
 * says so in its own header; these assert it, because a dropped `.eq('student_id', ...)`
 * would be invisible to every other test.
 */

const STUDENT = 's-1'
const OTHER_STUDENT = 's-2'

function stub(result: { data: unknown; error: unknown }) {
  const { builder, client } = makeClientCapturing(result)
  vi.mocked(createAdminClient).mockReturnValue(client as never)
  return builder
}

function rpc(result: { data: unknown; error: unknown }) {
  const captured = makeClientCapturing({ data: null, error: null }, result as never)
  vi.mocked(createAdminClient).mockReturnValue(captured.client as never)
  return captured
}

const NEW_GUARDIAN = { student_id: STUDENT, name: 'A', phone: null, email: null, relationship: null, is_primary: false }

beforeEach(() => vi.resetAllMocks())

describe('guardians data layer - every mutation is scoped to the student', () => {
  it('deleteGuardian filters on BOTH the row id and the student', async () => {
    const builder = stub({ data: [{ id: 'g-1' }], error: null })
    await deleteGuardian('g-1', STUDENT)
    expect(builder.delete).toHaveBeenCalled()
    expect(builder.eq).toHaveBeenCalledWith('id', 'g-1')
    expect(builder.eq).toHaveBeenCalledWith('student_id', STUDENT)
  })

  it('deleteGuardian reports a miss rather than a silent no-op', async () => {
    // assertMutated turns "matched nothing" into a NotFound, so an id belonging to another
    // student reads as absent instead of as a successful delete.
    stub({ data: [], error: null })
    await expect(deleteGuardian('g-1', OTHER_STUDENT)).rejects.toThrow(/not found/i)
  })

  it('callMakeGuardianPrimary names the student as well as the guardian', async () => {
    const { client } = rpc({ data: true, error: null })
    await callMakeGuardianPrimary('g-1', STUDENT)
    expect(client.rpc).toHaveBeenCalledWith('make_guardian_primary', { p_student_id: STUDENT, p_guardian_id: 'g-1' })
  })

  it('callMakeGuardianPrimary reports a guardian that is not this student’s as not found', async () => {
    rpc({ data: false, error: null })
    await expect(callMakeGuardianPrimary('g-1', OTHER_STUDENT)).rejects.toThrow(/not found/i)
  })

  it('deleteGuardiansForStudent (erasure) removes the whole set for one student', async () => {
    // The FK cascades on a profile DELETE, but erasure keeps the profile row so audit and
    // finance FKs survive - so this is what actually removes the guardian PII.
    const builder = stub({ data: null, error: null })
    await deleteGuardiansForStudent(STUDENT)
    expect(builder.delete).toHaveBeenCalled()
    expect(builder.eq).toHaveBeenCalledWith('student_id', STUDENT)
  })
})

describe('guardians data layer - reads and inserts', () => {
  it('lists a student’s guardians primary-first, then oldest', async () => {
    const rows = [{ id: 'g-1', student_id: STUDENT, name: 'A', is_primary: true }]
    const builder = stub({ data: rows, error: null })
    await expect(selectGuardiansByStudent(STUDENT)).resolves.toEqual(rows)
    expect(builder.order).toHaveBeenCalledWith('is_primary', { ascending: false })
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: true })
  })

  it('returns an empty list rather than null when a student has no guardians', async () => {
    stub({ data: null, error: null })
    await expect(selectGuardiansByStudent(STUDENT)).resolves.toEqual([])
  })

  it('callAddGuardian returns the new id', async () => {
    const { client } = rpc({ data: 'g-new', error: null })
    await expect(callAddGuardian(NEW_GUARDIAN)).resolves.toBe('g-new')
    expect(client.rpc).toHaveBeenCalledWith('add_guardian', expect.objectContaining({ p_student_id: STUDENT }))
  })
})

describe('guardians data layer - errors are surfaced, never swallowed', () => {
  it.each([
    ['selectGuardiansByStudent', () => selectGuardiansByStudent(STUDENT)],
    ['deleteGuardiansForStudent', () => deleteGuardiansForStudent(STUDENT)],
  ])('%s throws when PostgREST returns an error', async (_name, call) => {
    stub({ data: null, error: { message: 'boom' } })
    await expect(call()).rejects.toThrow(/boom/)
  })

  it.each([
    ['callAddGuardian', () => callAddGuardian(NEW_GUARDIAN)],
    ['callMakeGuardianPrimary', () => callMakeGuardianPrimary('g-1', STUDENT)],
  ])('%s throws when the function returns an error', async (_name, call) => {
    rpc({ data: null, error: { message: 'boom' } })
    await expect(call()).rejects.toThrow(/boom/)
  })
})
