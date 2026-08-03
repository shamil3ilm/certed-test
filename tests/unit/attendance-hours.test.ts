import { describe, it, expect } from 'vitest'
import {
  minutesBetween,
  sessionMetrics,
  studentMetrics,
  formatMinutes,
  formatHours,
  sumMinutes,
  type SessionTimes,
} from '@/lib/attendance/hours'

const at = (hm: string) => `2026-08-10T${hm}:00.000Z`

const session: SessionTimes = {
  scheduled_start: at('10:00'),
  scheduled_end: at('11:00'),
  actual_start: at('10:02'),
  actual_end: at('11:03'),
  tutor_join_at: at('09:55'),
  tutor_leave_at: at('11:05'),
}

describe('minutesBetween', () => {
  it('returns whole minutes, clamps negatives, and is null on missing/bad input', () => {
    expect(minutesBetween(at('10:00'), at('10:45'))).toBe(45)
    expect(minutesBetween(at('11:00'), at('10:00'))).toBe(0) // clamped
    expect(minutesBetween(null, at('10:00'))).toBeNull()
    expect(minutesBetween(at('10:00'), 'not-a-date')).toBeNull()
  })
})

describe('sessionMetrics', () => {
  it('derives scheduled, actual (falling back to scheduled), and tutor working minutes', () => {
    expect(sessionMetrics(session)).toEqual({
      scheduledMinutes: 60,
      sessionMinutes: 61, // actual window 10:02-11:03
      tutorWorkingMinutes: 70, // 09:55-11:05
    })
  })

  it('falls back to the scheduled window when no actual times are recorded', () => {
    const m = sessionMetrics({ ...session, actual_start: null, actual_end: null })
    expect(m.sessionMinutes).toBe(60)
  })
})

describe('studentMetrics', () => {
  it('computes learning, late-join, early-leave and missed time for a partial attendance', () => {
    expect(studentMetrics(session, { join_at: at('10:05'), leave_at: at('10:55') })).toEqual({
      learningMinutes: 50,
      lateJoinMinutes: 5,
      earlyLeaveMinutes: 5,
      missedMinutes: 10, // scheduled 60 - learning 50
    })
  })

  it('is zero late/early/missed for a full attendance', () => {
    expect(studentMetrics(session, { join_at: at('10:00'), leave_at: at('11:00') })).toEqual({
      learningMinutes: 60,
      lateJoinMinutes: 0,
      earlyLeaveMinutes: 0,
      missedMinutes: 0,
    })
  })

  it('treats an absent student (no join/leave) as missing the whole scheduled window', () => {
    expect(studentMetrics(session, { join_at: null, leave_at: null })).toEqual({
      learningMinutes: null,
      lateJoinMinutes: null,
      earlyLeaveMinutes: null,
      missedMinutes: 60,
    })
  })

  it('has no late/early/missed when there is no scheduled window to compare against', () => {
    const m = studentMetrics(
      { ...session, scheduled_start: null, scheduled_end: null },
      { join_at: at('10:05'), leave_at: at('10:55') },
    )
    expect(m).toEqual({ learningMinutes: 50, lateJoinMinutes: null, earlyLeaveMinutes: null, missedMinutes: null })
  })
})

describe('formatters + sumMinutes', () => {
  it('formats minutes and hours', () => {
    expect(formatMinutes(90)).toBe('1h 30m')
    expect(formatMinutes(45)).toBe('45m')
    expect(formatMinutes(120)).toBe('2h')
    expect(formatMinutes(null)).toBe('-')
    expect(formatHours(90)).toBe('1.5h')
    expect(formatHours(null)).toBe('-')
  })

  it('sums minutes treating null as 0, null only for an empty list', () => {
    expect(sumMinutes([50, null, 10])).toBe(60)
    expect(sumMinutes([])).toBeNull()
  })
})
