import { describe, it, expect } from 'vitest'
import { formatWeeklySlotInZone } from '@/lib/time/weekly-slot-format'

// The CONFIGURED org_settings.timezone, passed in explicitly. It used to be a hardcoded
// DISPLAY_TZ fallback inside the formatter, which diverged from expandSlots for any
// academy not on Asia/Kolkata.
const ACADEMY_TZ = 'Asia/Kolkata'

describe('formatWeeklySlotInZone', () => {
  it('shows the slot in the viewer zone (same day)', () => {
    // Dubai Mon 09:00-10:00 seen from India = Mon 10:30-11:30.
    const slot = { day_of_week: 1, start_time: '09:00', end_time: '10:00', timezone: 'Asia/Dubai' }
    expect(formatWeeklySlotInZone(slot, 'Asia/Kolkata', ACADEMY_TZ)).toBe('Mon 10:30-11:30')
  })

  it('renders same-zone slots unchanged', () => {
    const slot = { day_of_week: 3, start_time: '14:00', end_time: '15:30', timezone: 'Asia/Kolkata' }
    expect(formatWeeklySlotInZone(slot, 'Asia/Kolkata', ACADEMY_TZ)).toBe('Wed 14:00-15:30')
  })

  it('shows BOTH weekdays when the class crosses the viewer midnight', () => {
    // Dubai Mon 22:00-23:00 seen from India = Mon 23:30 -> Tue 00:30.
    const slot = { day_of_week: 1, start_time: '22:00', end_time: '23:00', timezone: 'Asia/Dubai' }
    expect(formatWeeklySlotInZone(slot, 'Asia/Kolkata', ACADEMY_TZ)).toBe('Mon 23:30 - Tue 00:30')
  })

  it('handles a "HH:mm:ss" Postgres time', () => {
    const slot = { day_of_week: 1, start_time: '09:00:00', end_time: '10:00:00', timezone: 'Asia/Dubai' }
    expect(formatWeeklySlotInZone(slot, 'Asia/Kolkata', ACADEMY_TZ)).toBe('Mon 10:30-11:30')
  })

  it('falls back to the academy zone when the slot has no timezone', () => {
    const slot = { day_of_week: 1, start_time: '09:00', end_time: '10:00', timezone: null }
    expect(formatWeeklySlotInZone(slot, 'Asia/Kolkata', ACADEMY_TZ)).toBe('Mon 09:00-10:00')
  })

  it('uses the CONFIGURED academy zone for a legacy slot, not a hardcoded constant', () => {
    // The regression: the fallback was DISPLAY_TZ ('Asia/Kolkata'), while expandSlots
    // anchors a zone-less row to org_settings.timezone. For an academy on Asia/Dubai the
    // timetable listed a legacy slot 1.5h away from where the calendar expanded it.
    const slot = { day_of_week: 1, start_time: '09:00', end_time: '10:00', timezone: null }
    expect(formatWeeklySlotInZone(slot, 'Asia/Kolkata', 'Asia/Dubai')).toBe('Mon 10:30-11:30')
  })
})
