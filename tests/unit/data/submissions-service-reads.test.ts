import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import {
  selectActiveSubmissionsForStudentAsService,
  selectSubmissionOwnerAsService,
  selectScoresForStudentAsService,
  selectEvaluatedSubmissionsForStudentAsService,
  selectActiveSubmissionsForStudentsAsService,
  selectEvaluatedSubmissionsForStudentsAsService,
} from '@/lib/data/submissions-service-reads'

const admin = (r: any) => vi.mocked(createAdminClient).mockReturnValueOnce(makeClient(r) as any)
const sub = { id: 'sub1', student_id: 's1', assignment_id: 'a1', score: 8 }

beforeEach(() => vi.resetAllMocks())

describe('submissions-service-reads data layer', () => {
  it('selectActiveSubmissionsForStudentAsService returns rows and throws on error', async () => {
    admin({ data: [sub], error: null })
    expect(await selectActiveSubmissionsForStudentAsService('s1')).toHaveLength(1)
    admin({ data: null, error: { message: 'e' } })
    await expect(selectActiveSubmissionsForStudentAsService('s1')).rejects.toThrow(/menteeOverview.subs: e/)
  })

  it('selectSubmissionOwnerAsService returns the owner ref or null', async () => {
    admin({ data: { student_id: 's1', assignment_id: 'a1' }, error: null })
    expect(await selectSubmissionOwnerAsService('sub1')).toEqual({ student_id: 's1', assignment_id: 'a1' })
    admin({ data: null, error: null })
    expect(await selectSubmissionOwnerAsService('gone')).toBeNull()
  })

  it('selectScoresForStudentAsService returns rows and throws on error', async () => {
    admin({ data: [sub], error: null })
    expect(await selectScoresForStudentAsService('s1')).toHaveLength(1)
    admin({ data: null, error: { message: 'e' } })
    await expect(selectScoresForStudentAsService('s1')).rejects.toThrow(/reportCard.subs: e/)
  })

  it('selectEvaluatedSubmissionsForStudentAsService returns rows and throws on error', async () => {
    admin({ data: [sub], error: null })
    expect(await selectEvaluatedSubmissionsForStudentAsService('s1')).toHaveLength(1)
    admin({ data: null, error: { message: 'e' } })
    await expect(selectEvaluatedSubmissionsForStudentAsService('s1')).rejects.toThrow(/menteeOverview.gradedSubs: e/)
  })

  it('batch service reads short-circuit on [] and otherwise return rows / throw', async () => {
    expect(await selectActiveSubmissionsForStudentsAsService([])).toEqual([])
    expect(await selectEvaluatedSubmissionsForStudentsAsService([])).toEqual([])
    expect(createAdminClient).not.toHaveBeenCalled()
    admin({ data: [sub], error: null })
    expect(await selectActiveSubmissionsForStudentsAsService(['s1'])).toHaveLength(1)
    admin({ data: null, error: { message: 'e' } })
    await expect(selectActiveSubmissionsForStudentsAsService(['s1'])).rejects.toThrow(/menteeOverview.subsBatch: e/)
    admin({ data: null, error: { message: 'e' } })
    await expect(selectEvaluatedSubmissionsForStudentsAsService(['s1'])).rejects.toThrow(
      /menteeOverview.gradedSubsBatch: e/,
    )
  })
})
