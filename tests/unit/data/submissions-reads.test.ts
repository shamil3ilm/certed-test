import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import {
  selectActiveByAssignment,
  selectSupersededByAssignment,
  selectUngradedByAssignments,
  selectActiveByAssignments,
  selectActiveByStudent,
  selectSupersededByStudent,
} from '@/lib/data/submissions-reads'

const sub = { id: 'sub1', assignment_id: 'a1', student_id: 's1', is_active: true }
const ok = () => vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: [sub], error: null }) as any)
const err = () =>
  vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)

beforeEach(() => vi.resetAllMocks())

describe('submissions-reads data layer', () => {
  it('per-assignment reads return rows and throw a namespaced error', async () => {
    ok()
    expect(await selectActiveByAssignment('a1')).toEqual([sub])
    ok()
    expect(await selectSupersededByAssignment('a1')).toEqual([sub])
    err()
    await expect(selectActiveByAssignment('a1')).rejects.toThrow(/submissions.listForAssignment: e/)
    err()
    await expect(selectSupersededByAssignment('a1')).rejects.toThrow(/submissions.listSuperseded: e/)
  })

  it('per-student reads return rows and throw on error', async () => {
    ok()
    expect(await selectActiveByStudent('s1')).toEqual([sub])
    ok()
    expect(await selectSupersededByStudent('s1')).toEqual([sub])
    err()
    await expect(selectActiveByStudent('s1')).rejects.toThrow(/submissions.listMine: e/)
    err()
    await expect(selectSupersededByStudent('s1')).rejects.toThrow(/submissions.listMineSuperseded: e/)
  })

  it('batch reads short-circuit on an empty id set and never open a client', async () => {
    expect(await selectUngradedByAssignments([])).toEqual([])
    expect(await selectActiveByAssignments([])).toEqual([])
    expect(createClient).not.toHaveBeenCalled()
  })

  it('batch reads return rows for a non-empty id set and throw on error', async () => {
    ok()
    expect(await selectUngradedByAssignments(['a1'])).toEqual([sub])
    ok()
    expect(await selectActiveByAssignments(['a1', 'a2'])).toEqual([sub])
    err()
    await expect(selectUngradedByAssignments(['a1'])).rejects.toThrow(/submissions.listUngraded: e/)
    err()
    await expect(selectActiveByAssignments(['a1'])).rejects.toThrow(/submissions.listActive: e/)
  })
})
