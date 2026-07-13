import { describe, it, expect } from 'vitest'
import { summarizeAttendance } from '@/lib/attendance/summary'
import { attendanceMarkSchema } from '@/lib/validation/attendance'

describe('summarizeAttendance', () => {
  it('is all-zero with a 0% rate for no sessions', () => {
    expect(summarizeAttendance([])).toEqual({ present: 0, late: 0, absent: 0, total: 0, rate: 0 })
  })
  it('counts each status', () => {
    const s = summarizeAttendance([
      { status: 'present' },
      { status: 'present' },
      { status: 'late' },
      { status: 'absent' },
    ])
    expect(s).toMatchObject({ present: 2, late: 1, absent: 1, total: 4 })
  })
  it('counts late as attended in the rate', () => {
    // 1 present + 1 late = 2 attended of 4 → 50%
    const rows = [{ status: 'present' }, { status: 'late' }, { status: 'absent' }, { status: 'absent' }] as const
    expect(summarizeAttendance(rows).rate).toBe(50)
  })
  it('rounds the rate to the nearest percent', () => {
    // 2 attended of 3 → 66.67 → 67
    expect(summarizeAttendance([{ status: 'present' }, { status: 'present' }, { status: 'absent' }]).rate).toBe(67)
  })
})

describe('attendanceMarkSchema', () => {
  const base = {
    class_id: '11111111-1111-4111-8111-111111111111',
    student_id: '22222222-2222-4222-8222-222222222222',
    session_date: '2026-07-13',
    status: 'present',
  }
  it('accepts a valid mark', () => {
    expect(attendanceMarkSchema.safeParse(base).success).toBe(true)
  })
  it('rejects an unknown status', () => {
    expect(attendanceMarkSchema.safeParse({ ...base, status: 'excused' }).success).toBe(false)
  })
  it('rejects a non-ISO date (DD-MM-YYYY)', () => {
    expect(attendanceMarkSchema.safeParse({ ...base, session_date: '13-07-2026' }).success).toBe(false)
  })
  it('rejects a non-uuid class id', () => {
    expect(attendanceMarkSchema.safeParse({ ...base, class_id: 'abc' }).success).toBe(false)
  })
})
