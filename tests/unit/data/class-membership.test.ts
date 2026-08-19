import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

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
  selectAllActiveEnrollmentRefs,
  upsertClassTutor,
  upsertEnrollment,
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

  it('selectAllActiveEnrollmentRefs uses the RLS client and throws on error', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: [{ class_id: 'c1' }], error: null }) as any)
    expect(await selectAllActiveEnrollmentRefs()).toEqual([{ class_id: 'c1' }])
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(selectAllActiveEnrollmentRefs()).rejects.toThrow(/enrollments.countPerClass: e/)
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
