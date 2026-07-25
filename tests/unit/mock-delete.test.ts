import { describe, it, expect } from 'vitest'
import { table } from '@/lib/mock/store'
import { MockQueryBuilder } from '@/lib/mock/query-builder'

describe('mock delete honours .select()', () => {
  it('removes only the matching rows and returns them, so callers can count', async () => {
    const rows = table('attendance')
    rows.length = 0
    rows.push({ id: 'a1', class_id: 'c1', session_date: '2026-07-23' })
    rows.push({ id: 'a2', class_id: 'c1', session_date: '2026-07-23' })
    rows.push({ id: 'a3', class_id: 'c1', session_date: '2026-07-24' })

    const res = await new MockQueryBuilder(table('attendance'), 'attendance')
      .delete()
      .eq('class_id', 'c1')
      .eq('session_date', '2026-07-23')
      .select('id')

    // Regression: the delete branch ignored `returning`, so clearAttendanceSession
    // reported 0 cleared while actually removing the rows.
    expect((res.data as unknown[] | null)?.length).toBe(2)
    expect(table('attendance').map((r) => r.id)).toEqual(['a3'])
  })

  it('returns null when no .select() was chained', async () => {
    const rows = table('attendance')
    rows.length = 0
    rows.push({ id: 'b1', class_id: 'c9', session_date: '2026-07-23' })
    const res = await new MockQueryBuilder(table('attendance'), 'attendance').delete().eq('class_id', 'c9')
    expect(res.data).toBeNull()
    expect(table('attendance').length).toBe(0)
  })
})
