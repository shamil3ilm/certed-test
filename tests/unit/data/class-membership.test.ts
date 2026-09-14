import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient, makeClientCapturing } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  selectActiveClassIdsForTutor,
  selectActiveClassIdsForStudent,
  selectActiveClassIdsForStudents,
  selectActiveEnrollmentsForStudents,
  selectActiveTutorRefsByClassIds,
  selectActiveStudentIdsByClassIds,
  selectActiveTutorIdsByClassIds,
  countActiveEnrollmentsPerClass,
  upsertClassTutor,
  upsertEnrollment,
  selectAllActiveEnrollmentPairs,
} from '@/lib/data/class-membership'

const admin = (r: any) => vi.mocked(createAdminClient).mockReturnValueOnce(makeClient(r) as any)

beforeEach(() => vi.resetAllMocks())

describe('class-membership data layer', () => {
  it('selectActiveClassIdsForTutor / ForStudent map to class ids and throw on error', async () => {
    admin({ data: [{ class_id: 'c1' }, { class_id: 'c2' }], error: null })
    expect(await selectActiveClassIdsForTutor('t1')).toEqual(['c1', 'c2'])
    admin({ data: [{ class_id: 'c3' }], error: null })
    expect(await selectActiveClassIdsForStudent('s1')).toEqual(['c3'])
    admin({ data: null, error: { message: 'e' } })
    await expect(selectActiveClassIdsForTutor('t1')).rejects.toThrow(/classMembership.classIdsForTutor: e/)
  })

  it('selectActiveClassIdsForStudents short-circuits on [] and de-duplicates otherwise', async () => {
    expect(await selectActiveClassIdsForStudents([])).toEqual([])
    expect(createAdminClient).not.toHaveBeenCalled()
    admin({ data: [{ class_id: 'c1' }, { class_id: 'c1' }, { class_id: 'c2' }], error: null })
    expect((await selectActiveClassIdsForStudents(['s1', 's2'])).sort()).toEqual(['c1', 'c2'])
  })

  it('selectActiveEnrollmentsForStudents / TutorRefsByClassIds short-circuit on [] and return rows', async () => {
    expect(await selectActiveEnrollmentsForStudents([])).toEqual([])
    expect(await selectActiveTutorRefsByClassIds([])).toEqual([])
    expect(createAdminClient).not.toHaveBeenCalled()
    admin({ data: [{ class_id: 'c1', student_id: 's1' }], error: null })
    expect(await selectActiveEnrollmentsForStudents(['s1'])).toHaveLength(1)
    admin({ data: null, error: { message: 'e' } })
    await expect(selectActiveEnrollmentsForStudents(['s1'])).rejects.toThrow(
      /classMembership.enrollmentsForStudents: e/,
    )
  })

  it('selectActiveStudentIdsByClassIds / TutorIdsByClassIds short-circuit on [] and map ids', async () => {
    expect(await selectActiveStudentIdsByClassIds([])).toEqual([])
    expect(await selectActiveTutorIdsByClassIds([])).toEqual([])
    admin({ data: [{ student_id: 's1' }, { student_id: 's2' }], error: null })
    expect(await selectActiveStudentIdsByClassIds(['c1'])).toEqual(['s1', 's2'])
    admin({ data: [{ tutor_id: 't1' }], error: null })
    expect(await selectActiveTutorIdsByClassIds(['c1'])).toEqual(['t1'])
  })

  // Counted in SQL (0105). The RLS client matters as much as the count: the function is
  // SECURITY INVOKER, so calling it on the admin client would widen the chart to classes
  // the viewer cannot see.
  it('countActiveEnrollmentsPerClass counts via RPC on the RLS client, and throws on error', async () => {
    const rpc = { data: [{ class_id: 'c1', student_count: '7' }], error: null }
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }, rpc) as any)
    expect(await countActiveEnrollmentsPerClass()).toEqual(new Map([['c1', 7]]))
    const bad = { data: null, error: { message: 'e' } }
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }, bad) as any)
    await expect(countActiveEnrollmentsPerClass()).rejects.toThrow(/enrollments.countPerClass: e/)
  })

  it('upsertClassTutor / upsertEnrollment resolve on success and throw on error', async () => {
    admin({ data: null, error: null })
    await expect(upsertClassTutor('t1', 'c1')).resolves.toBeUndefined()
    admin({ data: null, error: { message: 'e' } })
    await expect(upsertClassTutor('t1', 'c1')).rejects.toThrow()
    admin({ data: null, error: null })
    await expect(upsertEnrollment('s1', 'c1')).resolves.toBeUndefined()
  })
})

/**
 * Class labels for an ACADEMY-WIDE list (the admin calendar picker) need every class's
 * single student. Asking for them by class id would put every class in the academy into one
 * `.in()` list - past the URL limit, and truncated at the row cap past a thousand rows with
 * no error. This reads the enrolments whole instead, in pages, so the set is complete.
 */
describe('selectAllActiveEnrollmentPairs', () => {
  it('pages every active enrolment rather than stopping at the row cap', async () => {
    const { builder, client } = makeClientCapturing({ data: [{ student_id: 's1', class_id: 'c1' }], error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    expect(await selectAllActiveEnrollmentPairs()).toEqual([{ student_id: 's1', class_id: 'c1' }])
    expect(builder.range).toHaveBeenCalled()
    expect(builder.eq).toHaveBeenCalledWith('active', true)
    // a complete walk needs a total order, or a page boundary repeats one row and skips another
    expect(builder.order).toHaveBeenCalled()
  })

  it('throws a namespaced error rather than returning a partial set', async () => {
    admin({ data: null, error: { message: 'e' } })
    await expect(selectAllActiveEnrollmentPairs()).rejects.toThrow(/classMembership.allEnrollmentPairs: e/)
  })
})
