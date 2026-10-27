import { describe, expect, it } from 'vitest'
import { matchExams, matchOccurrences, type HeldSession } from '@/lib/calendar/held'

const session = (id: string, start: string, end: string | null, over: Partial<HeldSession> = {}): HeldSession => ({
  id,
  class_id: 'c-1',
  actual_start: start,
  actual_end: end,
  kind: 'regular',
  subjectName: 'Maths',
  ...over,
})
const occ = (key: string, start: string, end: string, classId: string | null = 'c-1') => ({
  key,
  classId,
  startIso: start,
  endIso: end,
})

describe('matchOccurrences - a session is the slot occurrence it overlaps', () => {
  it('pairs a session with the occurrence of its own class that it overlaps', () => {
    const m = matchOccurrences(
      [occ('o1', '2026-07-06T03:30:00Z', '2026-07-06T04:30:00Z')],
      [session('s1', '2026-07-06T03:40:00Z', '2026-07-06T04:20:00Z')],
    )
    expect([...m]).toEqual([['o1', 's1']])
  })

  it('does not pair across classes - a different class at the same hour is not it', () => {
    const m = matchOccurrences(
      [occ('o1', '2026-07-06T03:30:00Z', '2026-07-06T04:30:00Z')],
      [session('s1', '2026-07-06T03:30:00Z', '2026-07-06T04:30:00Z', { class_id: 'c-2' })],
    )
    expect(m.size).toBe(0)
  })

  it('does not pair a session that merely touches the slot, or one that never got an end time', () => {
    const m = matchOccurrences(
      [occ('o1', '2026-07-06T03:30:00Z', '2026-07-06T04:30:00Z')],
      [
        session('touches', '2026-07-06T04:30:00Z', '2026-07-06T05:30:00Z'),
        session('open', '2026-07-06T03:30:00Z', null),
      ],
    )
    expect(m.size).toBe(0)
  })

  it('gives a session to the occurrence it fills most, and to one only', () => {
    const m = matchOccurrences(
      [
        occ('early', '2026-07-06T03:00:00Z', '2026-07-06T04:00:00Z'),
        occ('late', '2026-07-06T04:00:00Z', '2026-07-06T05:00:00Z'),
      ],
      [session('s1', '2026-07-06T03:50:00Z', '2026-07-06T05:00:00Z')],
    )
    expect([...m]).toEqual([['late', 's1']])
  })

  it('lets a two-session day match two occurrences without sharing a session', () => {
    const m = matchOccurrences(
      [
        occ('am', '2026-07-06T03:30:00Z', '2026-07-06T04:30:00Z'),
        occ('pm', '2026-07-06T09:30:00Z', '2026-07-06T10:30:00Z'),
      ],
      [
        session('s-pm', '2026-07-06T09:30:00Z', '2026-07-06T10:30:00Z'),
        session('s-am', '2026-07-06T03:30:00Z', '2026-07-06T04:30:00Z'),
      ],
    )
    expect(Object.fromEntries(m)).toEqual({ am: 's-am', pm: 's-pm' })
  })

  it('ignores an occurrence with no class', () => {
    expect(
      matchOccurrences(
        [occ('o1', '2026-07-06T03:30:00Z', '2026-07-06T04:30:00Z', null)],
        [session('s1', '2026-07-06T03:30:00Z', '2026-07-06T04:30:00Z')],
      ).size,
    ).toBe(0)
  })
})

describe('matchExams - an exam session is the exam due that day', () => {
  const dayOf = (iso: string) => iso.slice(0, 10)
  const exam = { id: 'x1', class_id: 'c-1', due_date: '2026-07-10T04:00:00Z' }

  it('pairs an exam session in the same class on the same day', () => {
    const m = matchExams(
      [exam],
      [session('s1', '2026-07-10T03:00:00Z', '2026-07-10T04:00:00Z', { kind: 'exam' })],
      dayOf,
    )
    expect([...m]).toEqual([['x1', 's1']])
  })

  it('ignores a regular or demo session, another class, and another day', () => {
    const m = matchExams(
      [exam],
      [
        session('regular', '2026-07-10T03:00:00Z', '2026-07-10T04:00:00Z'),
        session('demo', '2026-07-10T03:00:00Z', '2026-07-10T04:00:00Z', { kind: 'demo' }),
        session('other-class', '2026-07-10T03:00:00Z', '2026-07-10T04:00:00Z', { kind: 'exam', class_id: 'c-2' }),
        session('other-day', '2026-07-11T03:00:00Z', '2026-07-11T04:00:00Z', { kind: 'exam' }),
      ],
      dayOf,
    )
    expect(m.size).toBe(0)
  })

  it('lets one exam session answer for one exam only', () => {
    const m = matchExams(
      [exam, { ...exam, id: 'x2' }],
      [session('s1', '2026-07-10T03:00:00Z', '2026-07-10T04:00:00Z', { kind: 'exam' })],
      dayOf,
    )
    expect([...m]).toEqual([['x1', 's1']])
  })
})
