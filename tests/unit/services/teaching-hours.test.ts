import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission/class', () => ({ mentorAuthorityClassIds: vi.fn() }))
vi.mock('@/lib/data/analytics', () => ({ selectSessionsForClassesInRange: vi.fn() }))
vi.mock('@/lib/services/finance/org-settings', () => ({ getInstituteTimeZone: vi.fn() }))
vi.mock('@/lib/data/classes', () => ({
  selectClassesByIds: vi.fn(),
  selectActiveClassIds: vi.fn(),
  // Archived-class filter: by default pass every given id through as active.
  selectActiveClassIdsAmong: vi.fn(async (ids: string[]) => ids),
}))
vi.mock('@/lib/services/users', () => ({ getProfileNamesByIds: vi.fn() }))
vi.mock('@/lib/services/classes', () => ({ myClassIds: vi.fn() }))

import { mentorAuthorityClassIds } from '@/lib/permission/class'
import { selectSessionsForClassesInRange, type SessionHoursRow } from '@/lib/data/analytics'
import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { selectClassesByIds, selectActiveClassIds } from '@/lib/data/classes'
import { getProfileNamesByIds } from '@/lib/services/users'
import { myClassIds } from '@/lib/services/classes'
import {
  aggregateClassTutorHours,
  getClassTutorHours,
  getTutorPersonalHours,
  getAllClassTutorHours,
} from '@/lib/services/teaching-hours'

const row = (over: Partial<SessionHoursRow>): SessionHoursRow => ({
  class_id: 'C1',
  tutor_id: 'T1',
  actual_start: '2026-08-02T10:00:00.000Z',
  actual_end: '2026-08-02T11:30:00.000Z',
  ...over,
})

const actor = { id: 'M1' } as never

describe('aggregateClassTutorHours (pure)', () => {
  it('groups by (class, tutor) and sums minutes', () => {
    const groups = aggregateClassTutorHours([
      row({
        class_id: 'C1',
        tutor_id: 'T1',
        actual_start: '2026-08-02T10:00:00.000Z',
        actual_end: '2026-08-02T11:30:00.000Z',
      }), // 90
      row({
        class_id: 'C1',
        tutor_id: 'T1',
        actual_start: '2026-08-03T10:00:00.000Z',
        actual_end: '2026-08-03T11:00:00.000Z',
      }), // 60
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ classId: 'C1', tutorId: 'T1', minutes: 150, sessionCount: 2 })
  })

  it('keeps a null tutor in its own "unassigned" bucket, separate from a named tutor', () => {
    const groups = aggregateClassTutorHours([
      row({ class_id: 'C1', tutor_id: 'T1', actual_end: '2026-08-02T11:00:00.000Z' }), // 60
      row({ class_id: 'C1', tutor_id: null, actual_end: '2026-08-02T10:30:00.000Z' }), // 30
    ])
    expect(groups).toHaveLength(2)
    const named = groups.find((g) => g.tutorId === 'T1')
    const unassigned = groups.find((g) => g.tutorId === null)
    expect(named?.minutes).toBe(60)
    expect(unassigned?.minutes).toBe(30)
  })

  it('treats a missing end as zero minutes (never negative)', () => {
    const groups = aggregateClassTutorHours([row({ class_id: 'C1', tutor_id: 'T1', actual_end: null })])
    expect(groups[0].minutes).toBe(0)
    expect(groups[0].sessionCount).toBe(1)
  })
})

describe('getClassTutorHours (mentor scope isolation)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getInstituteTimeZone).mockResolvedValue('Asia/Kolkata')
    vi.mocked(selectClassesByIds).mockResolvedValue([{ id: 'C1', name: 'Maths' }] as never)
    vi.mocked(getProfileNamesByIds).mockResolvedValue(new Map([['T1', 'Tutor One']]))
  })

  it('queries ONLY the mentor-authority classes - a tutor other classes never enter the query', async () => {
    // Mentor M1 has authority over C1 only (their mentee is enrolled there).
    vi.mocked(mentorAuthorityClassIds).mockResolvedValue(new Set(['C1']))
    vi.mocked(selectSessionsForClassesInRange).mockResolvedValue([
      row({ class_id: 'C1', tutor_id: 'T1', actual_end: '2026-08-02T11:30:00.000Z' }), // 90
    ])

    const result = await getClassTutorHours(actor, '2026-08')

    // The class-id list passed to the data layer is EXACTLY the authority set - not C2.
    const passedClassIds = vi.mocked(selectSessionsForClassesInRange).mock.calls[0][0]
    expect(passedClassIds).toEqual(['C1'])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ classId: 'C1', className: 'Maths', totalMinutes: 90 })
    expect(result[0].tutors[0]).toMatchObject({ tutorId: 'T1', tutorName: 'Tutor One', minutes: 90 })
  })

  it('returns nothing (and never queries sessions) when the mentor has no authority classes', async () => {
    vi.mocked(mentorAuthorityClassIds).mockResolvedValue(new Set())
    const result = await getClassTutorHours(actor, '2026-08')
    expect(result).toEqual([])
    expect(selectSessionsForClassesInRange).not.toHaveBeenCalled()
  })
})

describe('getTutorPersonalHours', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getInstituteTimeZone).mockResolvedValue('Asia/Kolkata')
  })

  it("sums only the tutor's OWN sessions - a co-teacher's are excluded (W-07)", async () => {
    vi.mocked(myClassIds).mockResolvedValue(['C1', 'C2'])
    vi.mocked(selectSessionsForClassesInRange).mockResolvedValue([
      row({ class_id: 'C1', tutor_id: 'M1', actual_end: '2026-08-02T11:30:00.000Z' }), // 90 - mine
      row({ class_id: 'C2', tutor_id: 'M1', actual_end: '2026-08-02T10:30:00.000Z' }), // 30 - mine
      row({ class_id: 'C1', tutor_id: 'OTHER', actual_end: '2026-08-02T12:00:00.000Z' }), // co-teacher - excluded
    ])
    const result = await getTutorPersonalHours(actor, '2026-08')
    expect(result).toEqual({ month: '2026-08', minutes: 120, sessionCount: 2 })
  })

  it('is zero with no classes and never queries', async () => {
    vi.mocked(myClassIds).mockResolvedValue([])
    const result = await getTutorPersonalHours(actor, '2026-08')
    expect(result).toEqual({ month: '2026-08', minutes: 0, sessionCount: 0 })
    expect(selectSessionsForClassesInRange).not.toHaveBeenCalled()
  })
})

describe('getAllClassTutorHours (admin scope)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getInstituteTimeZone).mockResolvedValue('Asia/Kolkata')
    vi.mocked(getProfileNamesByIds).mockResolvedValue(new Map([['T1', 'Tutor One']]))
  })

  it('spans every class and splits hours per class x tutor', async () => {
    vi.mocked(selectActiveClassIds).mockResolvedValue(['C1', 'C2'])
    vi.mocked(selectClassesByIds).mockResolvedValue([
      { id: 'C1', name: 'Maths' },
      { id: 'C2', name: 'Science' },
    ] as never)
    vi.mocked(selectSessionsForClassesInRange).mockResolvedValue([
      row({ class_id: 'C1', tutor_id: 'T1', actual_end: '2026-08-02T11:00:00.000Z' }), // 60
      row({ class_id: 'C2', tutor_id: 'T1', actual_end: '2026-08-02T10:30:00.000Z' }), // 30
    ])
    const result = await getAllClassTutorHours('2026-08')
    expect(result.map((c) => c.className)).toEqual(['Maths', 'Science'])
    expect(result.find((c) => c.classId === 'C1')?.totalMinutes).toBe(60)
    expect(result.find((c) => c.classId === 'C2')?.totalMinutes).toBe(30)
  })
})
