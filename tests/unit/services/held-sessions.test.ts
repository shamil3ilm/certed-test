import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/data/class-sessions', () => ({ selectHeldSessionsInRange: vi.fn() }))
vi.mock('@/lib/data/classes', () => ({ selectArchivedClassIds: vi.fn() }))
vi.mock('@/lib/data/subjects', () => ({ selectSubjectsByIds: vi.fn() }))

import { selectHeldSessionsInRange } from '@/lib/data/class-sessions'
import { selectArchivedClassIds } from '@/lib/data/classes'
import { selectSubjectsByIds } from '@/lib/data/subjects'
import { listHeldSessionsInRange } from '@/lib/services/held-sessions'

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  class_id: 'c-1',
  actual_start: '2026-07-06T03:30:00.000Z',
  actual_end: '2026-07-06T04:30:00.000Z',
  kind: 'regular',
  subject_id: 'sub-1',
  ...over,
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(selectArchivedClassIds).mockResolvedValue([])
  vi.mocked(selectSubjectsByIds).mockResolvedValue([{ id: 'sub-1', name: 'Maths' }] as never)
})

describe('listHeldSessionsInRange', () => {
  it('names the subject each session recorded, and its kind', async () => {
    vi.mocked(selectHeldSessionsInRange).mockResolvedValue([row('a'), row('b', { kind: 'exam' })] as never)
    const out = await listHeldSessionsInRange('2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z')
    expect(out.map((s) => [s.id, s.kind, s.subjectName])).toEqual([
      ['a', 'regular', 'Maths'],
      ['b', 'exam', 'Maths'],
    ])
    expect(selectHeldSessionsInRange).toHaveBeenCalledWith('2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z')
  })

  it('leaves out an archived class - the timetable and the hours reports do too', async () => {
    vi.mocked(selectArchivedClassIds).mockResolvedValue(['old'])
    vi.mocked(selectHeldSessionsInRange).mockResolvedValue([row('a'), row('b', { class_id: 'old' })] as never)
    const out = await listHeldSessionsInRange('s', 'e')
    expect(out.map((s) => s.id)).toEqual(['a'])
  })

  it('reads a row from before kinds existed as regular, and a missing subject as unnamed', async () => {
    vi.mocked(selectHeldSessionsInRange).mockResolvedValue([row('a', { kind: null, subject_id: null })] as never)
    const [s] = await listHeldSessionsInRange('s', 'e')
    expect(s).toMatchObject({ kind: 'regular', subjectName: null })
    expect(selectSubjectsByIds).not.toHaveBeenCalled()
  })

  it('keeps a session with no recorded end - it happened, it just has no window to match a slot by', async () => {
    vi.mocked(selectHeldSessionsInRange).mockResolvedValue([row('a', { actual_end: null })] as never)
    const [s] = await listHeldSessionsInRange('s', 'e')
    expect(s.actual_end).toBeNull()
  })
})
