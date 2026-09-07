import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient, makeClientCapturing } from '../../stubs/supabase-query-builder'

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
  deleteSessionMarks,
  selectStatusesForStudentAsService,
  selectRowsForStudentAsService,
  selectRowsForStudentsAsService,
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

  it('selectStudentPage returns items + an exact total, and throws on error', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: [mark], error: null, count: 42 }) as any)
    expect(await selectStudentPage('s1', { from: 0, to: 19 })).toEqual({ items: [mark], total: 42 })
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

  it('deleteSessionMarks removes ONE session’s marks by session id, and throws on error', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: [{ id: 'a1' }, { id: 'a2' }], error: null }) as any,
    )
    expect(await deleteSessionMarks('sess-1')).toBe(2)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(deleteSessionMarks('sess-1')).rejects.toThrow(/attendance.clearSession: e/)
  })

  it('selectStatusesForStudentAsService returns statuses and throws on error', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: [{ status: 'present' }], error: null }) as any)
    expect(await selectStatusesForStudentAsService('s1')).toEqual([{ status: 'present' }])
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(selectStatusesForStudentAsService('s1')).rejects.toThrow(/reportCard.att: e/)
  })
})

/**
 * PostgREST caps every response at the project's Max rows (default 1000) and reports no
 * error when it truncates. These three reads feed FIGURES - a report card's attendance
 * summary, a student's history, a mentor's whole cohort - so a truncated read does not
 * show a short list, it shows a WRONG NUMBER that looks right. They must page.
 *
 * The cohort read is the first to reach the cap: it multiplies marks-per-student by the
 * number of mentees, so a single academy year can pass 1000 rows.
 */
describe('attendance report reads are paged, not silently truncated', () => {
  it('selectStatusesForStudentAsService pages (report-card attendance figure)', async () => {
    const { builder, client } = makeClientCapturing({ data: [{ status: 'present' }], error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as never)
    await selectStatusesForStudentAsService('s1')
    expect(builder.range).toHaveBeenCalled()
  })

  it('selectRowsForStudentAsService pages (full history)', async () => {
    const { builder, client } = makeClientCapturing({ data: [], error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as never)
    await selectRowsForStudentAsService('s1')
    expect(builder.range).toHaveBeenCalled()
  })

  it('selectRowsForStudentsAsService pages (whole cohort - reaches the cap first)', async () => {
    const { builder, client } = makeClientCapturing({ data: [], error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as never)
    await selectRowsForStudentsAsService(['s1', 's2'])
    expect(builder.range).toHaveBeenCalled()
  })
})
