import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClientCapturing } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import {
  deleteGuardiansForStudent,
  selectGuardiansByStudent,
  insertGuardian,
  deleteGuardian,
  clearPrimaryForStudent,
  setGuardianPrimary,
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

  it('setGuardianPrimary is scoped to the student too', async () => {
    const builder = stub({ data: [{ id: 'g-1' }], error: null })
    await setGuardianPrimary('g-1', STUDENT)
    expect(builder.update).toHaveBeenCalledWith({ is_primary: true })
    expect(builder.eq).toHaveBeenCalledWith('id', 'g-1')
    expect(builder.eq).toHaveBeenCalledWith('student_id', STUDENT)
  })

  it('setGuardianPrimary reports a miss', async () => {
    stub({ data: [], error: null })
    await expect(setGuardianPrimary('g-1', OTHER_STUDENT)).rejects.toThrow(/not found/i)
  })

  it('clearPrimaryForStudent clears only that student and does not filter by id', async () => {
    const builder = stub({ data: null, error: null })
    await clearPrimaryForStudent(STUDENT)
    expect(builder.update).toHaveBeenCalledWith({ is_primary: false })
    expect(builder.eq).toHaveBeenCalledWith('student_id', STUDENT)
    expect(builder.eq).not.toHaveBeenCalledWith('id', expect.anything())
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

  it('insertGuardian returns the new id', async () => {
    stub({ data: { id: 'g-new' }, error: null })
    await expect(
      insertGuardian({
        student_id: STUDENT,
        name: 'A',
        phone: null,
        email: null,
        relationship: null,
        is_primary: false,
      }),
    ).resolves.toBe('g-new')
  })
})

describe('guardians data layer - errors are surfaced, never swallowed', () => {
  it.each([
    ['selectGuardiansByStudent', () => selectGuardiansByStudent(STUDENT)],
    ['clearPrimaryForStudent', () => clearPrimaryForStudent(STUDENT)],
    ['deleteGuardiansForStudent', () => deleteGuardiansForStudent(STUDENT)],
    [
      'insertGuardian',
      () =>
        insertGuardian({
          student_id: STUDENT,
          name: 'A',
          phone: null,
          email: null,
          relationship: null,
          is_primary: false,
        }),
    ],
  ])('%s throws when PostgREST returns an error', async (_name, call) => {
    stub({ data: null, error: { message: 'boom' } })
    await expect(call()).rejects.toThrow(/boom/)
  })
})
