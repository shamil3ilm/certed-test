import { describe, it, expect } from 'vitest'
import { hoursNotices, type HoursState } from '@/lib/attendance/hours-notice'

const TUTOR = 'tutor-1'
const MONITOR = 'monitor-1'
const OTHER = 'monitor-2'
const ADMIN = 'admin-1'

const START = '2026-08-05T10:00:00.000Z'
const END = '2026-08-05T11:00:00.000Z'
const LATER = '2026-08-05T12:00:00.000Z'

const regular = (over: Partial<HoursState> = {}): HoursState => ({
  tutor_id: TUTOR,
  kind: 'regular',
  monitor_id: null,
  actual_start: START,
  actual_end: END,
  ...over,
})
const exam = (over: Partial<HoursState> = {}): HoursState => regular({ kind: 'exam', monitor_id: MONITOR, ...over })

const ids = (notices: Array<{ personId: string }>) => notices.map((n) => n.personId)

describe('hoursNotices - a class session', () => {
  it('tells the tutor when someone else changes the window', () => {
    expect(hoursNotices(regular(), regular({ actual_end: LATER }), ADMIN)).toEqual([
      { personId: TUTOR, title: 'A session of yours was changed' },
    ])
  })

  it('tells the tutor when someone else records a session for them', () => {
    expect(hoursNotices(null, regular(), ADMIN)).toEqual([{ personId: TUTOR, title: 'A session was recorded for you' }])
  })

  it('tells nobody about a re-save of the same window, or the tutor about their own edit', () => {
    expect(hoursNotices(regular(), regular(), ADMIN)).toEqual([])
    expect(hoursNotices(regular(), regular({ actual_end: LATER }), TUTOR)).toEqual([])
  })

  it('reads the same instant in another notation as unchanged', () => {
    const same = regular({ actual_start: '2026-08-05T10:00:00+00:00', actual_end: '2026-08-05T11:00:00+00:00' })
    expect(hoursNotices(regular(), same, ADMIN)).toEqual([])
  })

  it('tells nobody when the session has no tutor', () => {
    expect(hoursNotices(regular({ tutor_id: null }), regular({ tutor_id: null, actual_end: LATER }), ADMIN)).toEqual([])
  })
})

describe('hoursNotices - an exam someone else monitored', () => {
  it('tells the monitor and NOT the class tutor, whose hours these are not', () => {
    const notices = hoursNotices(exam(), exam({ actual_end: LATER }), ADMIN)
    expect(notices).toEqual([{ personId: MONITOR, title: 'An exam you monitored was changed' }])
    expect(ids(notices)).not.toContain(TUTOR)
  })

  it('tells a newly named monitor nothing here - they are told, in those words, that they were named', () => {
    expect(hoursNotices(null, exam(), ADMIN)).toEqual([])
    expect(hoursNotices(regular(), exam(), ADMIN)).toEqual([
      // The tutor's session became somebody else's, so the tutor hears; the monitor is told they were named.
      { personId: TUTOR, title: 'A session of yours was changed' },
    ])
  })

  it('tells the monitor who loses the exam, and leaves the new one to the notice that names them', () => {
    const notices = hoursNotices(exam(), exam({ monitor_id: OTHER }), ADMIN)
    expect(notices).toEqual([{ personId: MONITOR, title: 'An exam you monitored was changed' }])
    expect(ids(notices)).not.toContain(OTHER)
  })

  it('tells nobody about a re-save of the same exam', () => {
    expect(hoursNotices(exam(), exam(), ADMIN)).toEqual([])
  })

  it('does not tell the monitor about their own edit', () => {
    expect(hoursNotices(exam(), exam({ actual_end: LATER }), MONITOR)).toEqual([])
  })
})

describe('hoursNotices - an exam the tutor monitored themselves', () => {
  it('is the tutor session as far as the tutor is concerned, told once', () => {
    const own = (over: Partial<HoursState> = {}) => exam({ monitor_id: TUTOR, ...over })
    expect(hoursNotices(own(), own({ actual_end: LATER }), ADMIN)).toEqual([
      { personId: TUTOR, title: 'A session of yours was changed' },
    ])
  })

  it('treats an exam with no named monitor as the tutor monitoring it', () => {
    expect(hoursNotices(exam({ monitor_id: null }), exam({ monitor_id: null, actual_end: LATER }), ADMIN)).toEqual([
      { personId: TUTOR, title: 'A session of yours was changed' },
    ])
  })
})

describe('hoursNotices - a type change moves the hours between people', () => {
  it('tells the tutor who loses a class session that became an exam, not the new monitor', () => {
    expect(ids(hoursNotices(regular(), exam(), ADMIN))).toEqual([TUTOR])
  })

  it('tells the tutor who gains a session back when an exam becomes a class', () => {
    expect(hoursNotices(exam(), regular(), ADMIN)).toEqual(
      expect.arrayContaining([{ personId: TUTOR, title: 'A session of yours was changed' }]),
    )
  })
})
