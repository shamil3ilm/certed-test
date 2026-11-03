import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/data/class-sessions', () => ({
  selectTutorOverlappingSessions: vi.fn(),
  selectStudentOverlappingSessions: vi.fn(),
}))

import { selectTutorOverlappingSessions, selectStudentOverlappingSessions } from '@/lib/data/class-sessions'
import { assertNoTutorOverlap, assertNoStudentOverlap } from '@/lib/services/attendance/session-overlap'
import { ValidationError } from '@/lib/errors'

describe('assertNoTutorOverlap', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('no-ops when tutorId or times are missing', async () => {
    await assertNoTutorOverlap(null, '2026-08-05T10:00:00Z', '2026-08-05T11:00:00Z', null)
    await assertNoTutorOverlap('t1', null, '2026-08-05T11:00:00Z', null)
    await assertNoTutorOverlap('t1', '2026-08-05T10:00:00Z', null, null)
    expect(selectTutorOverlappingSessions).not.toHaveBeenCalled()
  })

  it('passes when no other overlapping sessions exist', async () => {
    vi.mocked(selectTutorOverlappingSessions).mockResolvedValueOnce([])
    await assertNoTutorOverlap('t1', '2026-08-05T10:00:00Z', '2026-08-05T11:00:00Z', null)
    expect(selectTutorOverlappingSessions).toHaveBeenCalledWith('t1', '2026-08-05T10:00:00Z', '2026-08-05T11:00:00Z')
  })

  it('ignores the session being edited', async () => {
    vi.mocked(selectTutorOverlappingSessions).mockResolvedValueOnce([
      { id: 'ses-1', class_id: 'c1', session_date: '2026-08-05' },
    ])
    await assertNoTutorOverlap('t1', '2026-08-05T10:00:00Z', '2026-08-05T11:00:00Z', 'ses-1')
  })

  it('rejects an overlap with another session', async () => {
    vi.mocked(selectTutorOverlappingSessions).mockResolvedValueOnce([
      { id: 'ses-2', class_id: 'c2', session_date: '2026-08-05' },
    ])
    await expect(
      assertNoTutorOverlap('t1', '2026-08-05T10:00:00Z', '2026-08-05T11:00:00Z', 'ses-1'),
    ).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('assertNoStudentOverlap', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('no-ops when student has no active classes or times are null', async () => {
    await assertNoStudentOverlap([], '2026-08-05T10:00:00Z', '2026-08-05T11:00:00Z', null)
    await assertNoStudentOverlap(['c1'], null, '2026-08-05T11:00:00Z', null)
    await assertNoStudentOverlap(['c1'], '2026-08-05T10:00:00Z', null, null)
    expect(selectStudentOverlappingSessions).not.toHaveBeenCalled()
  })

  it('passes when no overlapping sessions exist for the student across classes', async () => {
    vi.mocked(selectStudentOverlappingSessions).mockResolvedValueOnce([])
    await assertNoStudentOverlap(['c1', 'c2'], '2026-08-05T10:00:00Z', '2026-08-05T11:00:00Z', null)
    expect(selectStudentOverlappingSessions).toHaveBeenCalledWith(
      ['c1', 'c2'],
      '2026-08-05T10:00:00Z',
      '2026-08-05T11:00:00Z',
    )
  })

  it('ignores the session being edited', async () => {
    vi.mocked(selectStudentOverlappingSessions).mockResolvedValueOnce([
      { id: 'ses-1', class_id: 'c1', session_date: '2026-08-05' },
    ])
    await assertNoStudentOverlap(['c1', 'c2'], '2026-08-05T10:00:00Z', '2026-08-05T11:00:00Z', 'ses-1')
  })

  it('throws ValidationError when student is already in a concurrent session in another class', async () => {
    vi.mocked(selectStudentOverlappingSessions).mockResolvedValueOnce([
      { id: 'ses-other-class', class_id: 'c2', session_date: '2026-08-05' },
    ])
    await expect(
      assertNoStudentOverlap(['c1', 'c2'], '2026-08-05T10:00:00Z', '2026-08-05T11:00:00Z', 'ses-1'),
    ).rejects.toThrow('The student already has an overlapping session in another class at this time.')
  })
})
