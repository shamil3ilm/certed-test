import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/data/class-membership', () => ({ selectActiveEnrollmentPairsByStudentIds: vi.fn() }))
vi.mock('@/lib/data/classes', () => ({ selectClassesByIds: vi.fn() }))

import { selectActiveEnrollmentPairsByStudentIds } from '@/lib/data/class-membership'
import { selectClassesByIds } from '@/lib/data/classes'
import { buildStudentRelationshipSubtitles } from '@/lib/services/student-relationship-subtitles'

beforeEach(() => vi.resetAllMocks())

describe('buildStudentRelationshipSubtitles', () => {
  it('returns an empty map for no students (and reads nothing)', async () => {
    const out = await buildStudentRelationshipSubtitles([])
    expect(out.size).toBe(0)
    expect(selectActiveEnrollmentPairsByStudentIds).not.toHaveBeenCalled()
  })

  it('combines class_level with the class summary, and collapses many classes to "+N more"', async () => {
    vi.mocked(selectActiveEnrollmentPairsByStudentIds).mockResolvedValueOnce([
      { student_id: 's1', class_id: 'c1' },
      { student_id: 's1', class_id: 'c2' },
      { student_id: 's2', class_id: 'c1' },
    ] as any)
    vi.mocked(selectClassesByIds).mockResolvedValueOnce([
      { id: 'c1', name: 'Math' },
      { id: 'c2', name: 'Science' },
    ] as any)

    const out = await buildStudentRelationshipSubtitles([
      { id: 's1', classLevel: 'Grade 10' },
      { id: 's2', classLevel: null },
    ])
    // s1: level + two classes -> "Grade 10 - Math +1 more"
    expect(out.get('s1')).toBe('Grade 10 - Math +1 more')
    // s2: one class, no level -> just the class name
    expect(out.get('s2')).toBe('Math')
  })

  it('falls back to class_level when the student has no active classes', async () => {
    vi.mocked(selectActiveEnrollmentPairsByStudentIds).mockResolvedValueOnce([] as any)
    const out = await buildStudentRelationshipSubtitles([{ id: 's1', classLevel: 'Grade 9' }])
    expect(out.get('s1')).toBe('Grade 9')
  })

  it('de-duplicates repeated students before resolving', async () => {
    vi.mocked(selectActiveEnrollmentPairsByStudentIds).mockResolvedValueOnce([] as any)
    const out = await buildStudentRelationshipSubtitles([
      { id: 's1', classLevel: 'Grade 8' },
      { id: 's1', classLevel: 'Grade 8' },
    ])
    expect(out.size).toBe(1)
    expect(out.get('s1')).toBe('Grade 8')
  })

  it('is undefined when there is neither a class nor a level', async () => {
    vi.mocked(selectActiveEnrollmentPairsByStudentIds).mockResolvedValueOnce([] as any)
    const out = await buildStudentRelationshipSubtitles([{ id: 's1' }])
    expect(out.get('s1')).toBeUndefined()
  })
})
