import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  selectForClassDate,
  selectHistoryForClass,
  selectMarkedClassIds,
  selectStudentPage,
  countStatusesForStudent,
  selectRecentForClass,
  upsertMarks,
  deleteSession,
  selectStatusesForStudentAsService,
} from '@/lib/data/attendance'

const mark = { id: 'a1', class_id: 'c1', student_id: 's1', session_date: '2026-06-20', status: 'present' }

beforeEach(() => vi.resetAllMocks())

describe('attendance data layer', () => {
  it('selectForClassDate + selectHistoryForClass + selectRecentForClass return rows and throw on error', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: [mark], error: null }) as any)
    expect(await selectForClassDate('c1', '2026-06-20')).toEqual([mark])
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: [mark], error: null }) as any)
    expect(await selectHistoryForClass('c1', { status: 'present', limit: 10 })).toEqual([mark])
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: [mark], error: null }) as any)
    expect(await selectRecentForClass('c1')).toEqual([mark])

    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(selectForClassDate('c1', 'd')).rejects.toThrow(/attendance.listForClassDate: e/)
  })

  it('selectMarkedClassIds short-circuits on [] and otherwise maps to class ids', async () => {
    expect(await selectMarkedClassIds([], 'd')).toEqual([])
    vi.mocked(createClient).mockResolvedValueOnce(
      makeClient({ data: [{ class_id: 'c1' }, { class_id: 'c2' }], error: null }) as any,
    )
    expect(await selectMarkedClassIds(['c1', 'c2'], 'd')).toEqual(['c1', 'c2'])
  })

  it('selectStudentPage returns rows + an exact total, and throws on error', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: [mark], error: null, count: 42 }) as any)
    expect(await selectStudentPage('s1', { from: 0, to: 19 })).toEqual({ rows: [mark], total: 42 })
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(selectStudentPage('s1', { from: 0, to: 19, classId: 'c1' })).rejects.toThrow(
      /attendance.listForStudentPage: e/,
    )
  })

  it('countStatusesForStudent runs four head counts and shapes them', async () => {
    // The single client answers each of the four count queries with the same count.
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null, count: 5 }) as any)
    expect(await countStatusesForStudent('s1', 'c1')).toEqual({ present: 5, late: 5, absent: 5, total: 5 })
  })

  it('countStatusesForStudent throws if any count errors', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(countStatusesForStudent('s1')).rejects.toThrow(/attendance.summarizeForStudent: e/)
  })

  it('upsertMarks short-circuits on [] (no client) and throws on error', async () => {
    await expect(upsertMarks([])).resolves.toBeUndefined()
    expect(createAdminClient).not.toHaveBeenCalled()
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await expect(upsertMarks([mark as any])).resolves.toBeUndefined()
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(upsertMarks([mark as any])).rejects.toThrow(/attendance.markMany: e/)
  })

  it('deleteSession returns the number removed and throws on error', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: [{ id: 'a1' }, { id: 'a2' }], error: null }) as any,
    )
    expect(await deleteSession('c1', '2026-06-20')).toBe(2)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(deleteSession('c1', 'd')).rejects.toThrow(/attendance.clearSession: e/)
  })

  it('selectStatusesForStudentAsService returns statuses and throws on error', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: [{ status: 'present' }], error: null }) as any)
    expect(await selectStatusesForStudentAsService('s1')).toEqual([{ status: 'present' }])
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(selectStatusesForStudentAsService('s1')).rejects.toThrow(/reportCard.att: e/)
  })
})
