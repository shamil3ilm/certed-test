import { describe, it, expect } from 'vitest'
import {
  breakdownByPerson,
  breakdownByStudent,
  ledgerForPerson,
  ledgerForStudent,
  sessionWorker,
  workingMinutes,
  type BreakdownSession,
} from '@/lib/attendance/hours-breakdown'

/**
 * The hours breakdown is the answer to "who worked how long, on what, for whom" - so the
 * rules that decide whose time a session is, and what counts as WORKING time, are the whole
 * of the feature. Each is pinned here against a small fixed month.
 *
 *   regular -> the tutor's working time; the student's hours received
 *   demo    -> reported on its own; NEVER working time
 *   exam    -> working time of whoever MONITORED it (the tutor unless another was named)
 */

const T1 = 'tutor-1'
const T2 = 'tutor-2'
const MON = 'monitor-1'
const MATHS = 'subj-maths'
const PHYS = 'subj-phys'
const SARA = 'student-sara'
const SAM = 'student-sam'

/** A session with a window of `minutes`, starting 10:00 on 5 Aug. */
function session(id: string, over: Partial<BreakdownSession> & { minutes?: number } = {}): BreakdownSession {
  const { minutes = 60, ...rest } = over
  const start = new Date('2026-08-05T10:00:00Z')
  return {
    id,
    class_id: 'class-1',
    tutor_id: T1,
    monitor_id: null,
    subject_id: MATHS,
    kind: 'regular',
    actual_start: start.toISOString(),
    actual_end: new Date(start.getTime() + minutes * 60_000).toISOString(),
    ...rest,
  }
}

describe('sessionWorker - whose working time a session is', () => {
  it('is the tutor for a regular session', () => {
    expect(sessionWorker(session('s', { kind: 'regular' }))).toBe(T1)
  })

  it('is the tutor for a demo (reported, but the tutor is who gave it)', () => {
    expect(sessionWorker(session('s', { kind: 'demo' }))).toBe(T1)
  })

  it('is the MONITOR for an exam someone else watched', () => {
    expect(sessionWorker(session('s', { kind: 'exam', monitor_id: MON }))).toBe(MON)
  })

  it('is the tutor for an exam with no monitor named', () => {
    expect(sessionWorker(session('s', { kind: 'exam', monitor_id: null }))).toBe(T1)
  })

  it('treats a row with no kind (pre-0123 or mock mode) as regular', () => {
    const row = { ...session('s'), kind: undefined } as unknown as BreakdownSession
    expect(sessionWorker(row)).toBe(T1)
  })
})

describe('workingMinutes - what counts as working time', () => {
  it('is regular + exam, and excludes demo', () => {
    expect(workingMinutes({ regular: 120, demo: 30, exam: 45 })).toBe(165)
  })
})

describe('breakdownByStudent - hours RECEIVED, split by kind', () => {
  const sessions = [
    session('reg', { minutes: 60 }),
    session('demo', { kind: 'demo', minutes: 30 }),
    session('exam', { kind: 'exam', monitor_id: MON, minutes: 90 }),
  ]

  it('keeps regular, demo and exam apart in the student total', () => {
    const marks = [
      { session_id: 'reg', student_id: SARA },
      { session_id: 'demo', student_id: SARA },
      { session_id: 'exam', student_id: SARA },
    ]
    const [sara] = breakdownByStudent(sessions, marks)
    expect(sara.studentId).toBe(SARA)
    expect(sara.total).toEqual({ regular: 60, demo: 30, exam: 90 })
  })

  it('credits only the sessions the student was marked for', () => {
    const [sara] = breakdownByStudent(sessions, [{ session_id: 'reg', student_id: SARA }])
    expect(sara.total).toEqual({ regular: 60, demo: 0, exam: 0 })
  })

  it('splits by subject, with an unlabelled session as its own null subject', () => {
    const rows = [
      session('m', { subject_id: MATHS, minutes: 60 }),
      session('p', { subject_id: PHYS, minutes: 45 }),
      session('n', { subject_id: null, minutes: 15 }),
    ]
    const marks = rows.map((r) => ({ session_id: r.id, student_id: SARA }))
    const [sara] = breakdownByStudent(rows, marks)
    const by = new Map(sara.bySubject.map((s) => [s.subjectId, s.minutes.regular]))
    expect(by.get(MATHS)).toBe(60)
    expect(by.get(PHYS)).toBe(45)
    expect(by.get(null)).toBe(15)
  })

  it('splits by the session tutor, so a change of tutor mid-month shows both', () => {
    const rows = [session('a', { tutor_id: T1, minutes: 60 }), session('b', { tutor_id: T2, minutes: 30 })]
    const marks = rows.map((r) => ({ session_id: r.id, student_id: SARA }))
    const [sara] = breakdownByStudent(rows, marks)
    const by = new Map(sara.byTutor.map((t) => [t.tutorId, t.minutes.regular]))
    expect(by.get(T1)).toBe(60)
    expect(by.get(T2)).toBe(30)
  })

  it('names who monitored each exam, which is the tutor when no one else was named', () => {
    const rows = [
      session('e1', { kind: 'exam', monitor_id: MON, minutes: 90 }),
      session('e2', { kind: 'exam', monitor_id: null, minutes: 60 }),
    ]
    const marks = rows.map((r) => ({ session_id: r.id, student_id: SARA }))
    const [sara] = breakdownByStudent(rows, marks)
    const by = new Map(sara.examMonitors.map((m) => [m.monitorId, m.minutes]))
    expect(by.get(MON)).toBe(90)
    expect(by.get(T1)).toBe(60)
  })

  it('keeps students apart', () => {
    const marks = [
      { session_id: 'reg', student_id: SARA },
      { session_id: 'reg', student_id: SAM },
    ]
    const result = breakdownByStudent(sessions, marks)
    expect(result.map((r) => r.studentId).sort()).toEqual([SAM, SARA].sort())
  })

  it('ignores a mark for a session outside the set it was given', () => {
    expect(breakdownByStudent(sessions, [{ session_id: 'elsewhere', student_id: SARA }])).toEqual([])
  })
})

describe('breakdownByPerson - hours WORKED, split by kind', () => {
  it('credits regular and demo to the tutor, and keeps demo out of working time', () => {
    const rows = [session('r', { minutes: 120 }), session('d', { kind: 'demo', minutes: 30 })]
    const [tutor] = breakdownByPerson(rows, [])
    expect(tutor.personId).toBe(T1)
    expect(tutor.minutes).toEqual({ regular: 120, demo: 30, exam: 0 })
    expect(workingMinutes(tutor.minutes)).toBe(120)
  })

  it('credits an exam to the MONITOR, not to the tutor of the class', () => {
    const rows = [session('e', { kind: 'exam', monitor_id: MON, minutes: 90 })]
    const people = breakdownByPerson(rows, [])
    expect(people.map((p) => p.personId)).toEqual([MON])
    expect(people[0].minutes.exam).toBe(90)
  })

  it('credits an exam to the tutor when nobody else monitored', () => {
    const [tutor] = breakdownByPerson([session('e', { kind: 'exam', minutes: 45 })], [])
    expect(tutor.personId).toBe(T1)
    expect(tutor.minutes.exam).toBe(45)
  })

  it('counts sessions as well as minutes, per kind', () => {
    const rows = [session('a'), session('b'), session('d', { kind: 'demo' })]
    const [tutor] = breakdownByPerson(rows, [])
    expect(tutor.sessions).toEqual({ regular: 2, demo: 1, exam: 0 })
  })

  it('splits a person by subject', () => {
    const rows = [session('m', { subject_id: MATHS, minutes: 60 }), session('p', { subject_id: PHYS, minutes: 30 })]
    const [tutor] = breakdownByPerson(rows, [])
    const by = new Map(tutor.bySubject.map((s) => [s.subjectId, s.minutes.regular]))
    expect(by.get(MATHS)).toBe(60)
    expect(by.get(PHYS)).toBe(30)
  })

  it('splits a person by the student who attended', () => {
    const rows = [session('a', { minutes: 60 }), session('b', { minutes: 30 })]
    const marks = [
      { session_id: 'a', student_id: SARA },
      { session_id: 'b', student_id: SAM },
    ]
    const [tutor] = breakdownByPerson(rows, marks)
    const by = new Map(tutor.byStudent.map((s) => [s.studentId, s.minutes.regular]))
    expect(by.get(SARA)).toBe(60)
    expect(by.get(SAM)).toBe(30)
  })

  it('puts a session nobody attended under a null student, so the rows still add up', () => {
    const rows = [session('a', { minutes: 60 }), session('empty', { minutes: 30 })]
    const [tutor] = breakdownByPerson(rows, [{ session_id: 'a', student_id: SARA }])
    const by = new Map(tutor.byStudent.map((s) => [s.studentId, s.minutes.regular]))
    expect(by.get(SARA)).toBe(60)
    expect(by.get(null)).toBe(30)
    const summed = tutor.byStudent.reduce((n, s) => n + s.minutes.regular, 0)
    expect(summed).toBe(tutor.minutes.regular)
  })

  it('credits the monitor, per student, for the exam the students sat', () => {
    const rows = [session('e', { kind: 'exam', monitor_id: MON, minutes: 90 })]
    const [monitor] = breakdownByPerson(rows, [{ session_id: 'e', student_id: SARA }])
    expect(monitor.personId).toBe(MON)
    expect(monitor.byStudent).toEqual([{ studentId: SARA, minutes: { regular: 0, demo: 0, exam: 90 } }])
  })

  it('counts a session with no recorded window as a session of zero minutes', () => {
    const open = { ...session('open'), actual_start: null, actual_end: null }
    const [tutor] = breakdownByPerson([open], [])
    expect(tutor.minutes.regular).toBe(0)
    expect(tutor.sessions.regular).toBe(1)
  })

  it('files a session with no tutor and no monitor under a null person (Unassigned)', () => {
    const [unassigned] = breakdownByPerson([session('u', { tutor_id: null, minutes: 20 })], [])
    expect(unassigned.personId).toBeNull()
    expect(unassigned.minutes.regular).toBe(20)
  })

  it('reconciles: every minute recorded lands on exactly one person', () => {
    const rows = [
      session('r', { minutes: 60 }),
      session('d', { kind: 'demo', minutes: 30 }),
      session('e', { kind: 'exam', monitor_id: MON, minutes: 90 }),
      session('x', { tutor_id: T2, minutes: 15 }),
    ]
    const recorded = 60 + 30 + 90 + 15
    const placed = breakdownByPerson(rows, []).reduce(
      (n, p) => n + p.minutes.regular + p.minutes.demo + p.minutes.exam,
      0,
    )
    expect(placed).toBe(recorded)
  })

  it('orders people by working time, heaviest first', () => {
    const rows = [session('a', { tutor_id: T2, minutes: 30 }), session('b', { tutor_id: T1, minutes: 90 })]
    expect(breakdownByPerson(rows, []).map((p) => p.personId)).toEqual([T1, T2])
  })
})

describe('ledgerForStudent - the month, session by session', () => {
  const rows = [
    session('late-day', { actual_start: '2026-08-07T10:00:00.000Z', actual_end: '2026-08-07T11:00:00.000Z' }),
    session('early-day', {
      actual_start: '2026-08-03T10:00:00.000Z',
      actual_end: '2026-08-03T10:30:00.000Z',
      minutes: 30,
    }),
    session('exam', {
      kind: 'exam',
      monitor_id: MON,
      actual_start: '2026-08-05T10:00:00.000Z',
      actual_end: '2026-08-05T11:30:00.000Z',
    }),
  ].map((s) => ({ ...s, session_date: s.actual_start?.slice(0, 10) }))

  const mark = (sessionId: string, status: 'present' | 'late' | 'absent', join: string | null = null) => ({
    session_id: sessionId,
    student_id: SARA,
    status,
    join_at: join,
    leave_at: null,
  })

  it('lists every session the student has a mark for, oldest first', () => {
    const out = ledgerForStudent(rows, [
      mark('late-day', 'present'),
      mark('early-day', 'present'),
      mark('exam', 'present'),
    ])
    expect(out.map((r) => r.sessionId)).toEqual(['early-day', 'exam', 'late-day'])
  })

  it('keeps an ABSENT session in the ledger but does not count its hours', () => {
    const [absent] = ledgerForStudent(rows, [mark('early-day', 'absent')])
    expect(absent).toMatchObject({ status: 'absent', counted: false, minutes: 30 })
  })

  it('counts present and late', () => {
    const out = ledgerForStudent(rows, [mark('early-day', 'late'), mark('late-day', 'present')])
    expect(out.map((r) => r.counted)).toEqual([true, true])
  })

  it('carries the kind, the exam monitor and the student`s own join time', () => {
    const [exam] = ledgerForStudent(rows, [mark('exam', 'present', '2026-08-05T10:05:00.000Z')])
    expect(exam).toMatchObject({
      kind: 'exam',
      monitorId: MON,
      joinAt: '2026-08-05T10:05:00.000Z',
      sessionDate: '2026-08-05',
      minutes: 90,
    })
  })

  it('has no monitor for a regular session, even if the row carries a stray one', () => {
    const stray = [{ ...rows[0], monitor_id: MON }]
    expect(ledgerForStudent(stray, [mark('late-day', 'present')])[0].monitorId).toBeNull()
  })

  it('ignores a mark for a session it was not given', () => {
    expect(ledgerForStudent(rows, [mark('elsewhere', 'present')])).toEqual([])
  })

  it('is exactly the sessions the hours figures are built from: counted minutes equal the student total', () => {
    const marks = [mark('late-day', 'present'), mark('early-day', 'absent'), mark('exam', 'late')]
    const counted = ledgerForStudent(rows, marks)
      .filter((r) => r.counted)
      .reduce((n, r) => n + r.minutes, 0)
    const attended = marks.filter((m) => m.status !== 'absent')
    const [student] = breakdownByStudent(rows, attended)
    expect(counted).toBe(student.total.regular + student.total.demo + student.total.exam)
  })
})

describe('ledgerForPerson - what a person taught or monitored, session by session', () => {
  const rows = [
    session('taught', { actual_start: '2026-08-03T10:00:00.000Z', actual_end: '2026-08-03T11:00:00.000Z' }),
    session('demo', { kind: 'demo', actual_start: '2026-08-04T10:00:00.000Z', actual_end: '2026-08-04T10:30:00.000Z' }),
    session('exam-other', {
      kind: 'exam',
      monitor_id: MON,
      actual_start: '2026-08-05T10:00:00.000Z',
      actual_end: '2026-08-05T11:00:00.000Z',
    }),
    session('exam-own', {
      kind: 'exam',
      monitor_id: null,
      actual_start: '2026-08-06T10:00:00.000Z',
      actual_end: '2026-08-06T11:00:00.000Z',
    }),
    session('someone-else', { tutor_id: T2 }),
  ]
  const attended = [
    { session_id: 'taught', student_id: SARA },
    { session_id: 'exam-other', student_id: SARA },
  ]

  it('names the class of every session, so a pay slip can keep one line per class', () => {
    const out = ledgerForPerson(T1, rows, attended)
    expect(out.every((r) => typeof r.classId === 'string' && r.classId.length > 0)).toBe(true)
  })

  it('lists what the tutor taught, oldest first, and leaves out an exam someone else monitored', () => {
    const out = ledgerForPerson(T1, rows, attended)
    expect(out.map((r) => r.sessionId)).toEqual(['taught', 'demo', 'exam-own'])
  })

  it('lists the exam under the MONITOR, as monitored', () => {
    const out = ledgerForPerson(MON, rows, attended)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ sessionId: 'exam-other', role: 'monitored', kind: 'exam', studentIds: [SARA] })
  })

  it('says taught for regular and demo, and for an exam the tutor monitored themselves', () => {
    const roles = new Map(ledgerForPerson(T1, rows, attended).map((r) => [r.sessionId, r.role]))
    expect(roles.get('taught')).toBe('taught')
    expect(roles.get('demo')).toBe('taught')
    expect(roles.get('exam-own')).toBe('taught')
  })

  it('names the students who attended, and none when nobody did', () => {
    const out = ledgerForPerson(T1, rows, attended)
    expect(out.find((r) => r.sessionId === 'taught')?.studentIds).toEqual([SARA])
    expect(out.find((r) => r.sessionId === 'demo')?.studentIds).toEqual([])
  })

  it('adds up to the person`s working and demo minutes', () => {
    const out = ledgerForPerson(T1, rows, attended)
    const [person] = breakdownByPerson(rows, attended).filter((p) => p.personId === T1)
    const sum = (k: 'regular' | 'demo' | 'exam') => out.filter((r) => r.kind === k).reduce((n, r) => n + r.minutes, 0)
    expect({ regular: sum('regular'), demo: sum('demo'), exam: sum('exam') }).toEqual(person.minutes)
  })
})
