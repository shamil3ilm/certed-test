import { describe, it, expect } from 'vitest'
import { formatWeeklySlotInZone } from '@/lib/time/weekly-slot-format'

describe('formatWeeklySlotInZone', () => {
  it('shows the slot in the viewer zone (same day)', () => {
    // Dubai Mon 09:00-10:00 seen from India = Mon 10:30-11:30.
    const slot = { day_of_week: 1, start_time: '09:00', end_time: '10:00', timezone: 'Asia/Dubai' }
    expect(formatWeeklySlotInZone(slot, 'Asia/Kolkata')).toBe('Mon 10:30-11:30')
  })

  it('renders same-zone slots unchanged', () => {
    const slot = { day_of_week: 3, start_time: '14:00', end_time: '15:30', timezone: 'Asia/Kolkata' }
    expect(formatWeeklySlotInZone(slot, 'Asia/Kolkata')).toBe('Wed 14:00-15:30')
  })

  it('shows BOTH weekdays when the class crosses the viewer midnight', () => {
    // Dubai Mon 22:00-23:00 seen from India = Mon 23:30 -> Tue 00:30.
    const slot = { day_of_week: 1, start_time: '22:00', end_time: '23:00', timezone: 'Asia/Dubai' }
    expect(formatWeeklySlotInZone(slot, 'Asia/Kolkata')).toBe('Mon 23:30 - Tue 00:30')
  })

  it('handles a "HH:mm:ss" Postgres time', () => {
    const slot = { day_of_week: 1, start_time: '09:00:00', end_time: '10:00:00', timezone: 'Asia/Dubai' }
    expect(formatWeeklySlotInZone(slot, 'Asia/Kolkata')).toBe('Mon 10:30-11:30')
  })

  it('falls back to the academy zone when the slot has no timezone', () => {
    // No timezone -> DISPLAY_TZ (Asia/Kolkata); viewed in Kolkata = unchanged.
    const slot = { day_of_week: 1, start_time: '09:00', end_time: '10:00', timezone: null }
    expect(formatWeeklySlotInZone(slot, 'Asia/Kolkata')).toBe('Mon 09:00-10:00')
  })
})
