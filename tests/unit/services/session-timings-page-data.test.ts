import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/mentor-session-timings', () => ({ listMenteeSessionTimings: vi.fn() }))
vi.mock('@/lib/data/subjects', () => ({ selectActiveSubjects: vi.fn() }))
vi.mock('@/lib/data/class-membership', () => ({ selectActiveClassIdsForStudent: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ listActiveByRole: vi.fn() }))

import { listMenteeSessionTimings } from '@/lib/services/mentor-session-timings'
import { selectActiveSubjects } from '@/lib/data/subjects'
import { selectActiveClassIdsForStudent } from '@/lib/data/class-membership'
import { listActiveByRole } from '@/lib/services/users'
import { loadSessionTimingsPageData, sessionTimingsUrl } from '@/lib/services/page-data/session-timings'

/**
 * The session-timing filters come straight off the URL, so this is where a hand-edited or
 * stale query string is either made harmless or turned into an error page. Two rules carry
 * the weight: a malformed value is DROPPED rather than forwarded to PostgREST (which answers
 * a bad uuid with a 400), and a student filter that resolves to no classes must mean "no
 * matches" rather than falling through to the unfiltered list.
 */

const ACTOR = { id: 'me' } as never
const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listMenteeSessionTimings).mockResolvedValue({ items: [], total: 0 })
  vi.mocked(selectActiveSubjects).mockResolvedValue([{ id: UUID_A, name: 'Algebra' }] as never)
  vi.mocked(listActiveByRole).mockResolvedValue([] as never)
  vi.mocked(selectActiveClassIdsForStudent).mockResolvedValue(['c1'])
})

describe('session-timings filters: a malformed URL narrows nothing, it does not error', () => {
  it.each([
    ['subject', 'not-a-uuid'],
    ['tutor', "'; drop table class_sessions;--"],
    ['student', '12345'],
    ['classId', 'null'],
  ])('drops a malformed %s rather than passing it to the query', async (key, value) => {
    const data = await loadSessionTimingsPageData(ACTOR, { [key]: value })
    expect(data.filters[key as 'subject']).toBe('')
    expect(data.hasActiveFilters).toBe(false)
    const passed = vi.mocked(listMenteeSessionTimings).mock.calls[0][1].filters ?? {}
    expect(Object.values(passed).filter((v) => v !== undefined)).toEqual([])
  })

  it.each([
    ['from', '05-08-2026'],
    ['to', '2026-13-45'],
    ['from', 'yesterday'],
  ])('drops a malformed date in %s', async (key, value) => {
    const data = await loadSessionTimingsPageData(ACTOR, { [key]: value })
    expect(data.filters[key as 'from']).toBe('')
  })

  it('keeps well-formed values and forwards them to the query', async () => {
    const data = await loadSessionTimingsPageData(ACTOR, {
      subject: UUID_A,
      tutor: UUID_B,
      from: '2026-08-01',
      to: '2026-08-31',
    })
    expect(data.hasActiveFilters).toBe(true)
    expect(vi.mocked(listMenteeSessionTimings).mock.calls[0][1].filters).toMatchObject({
      subjectId: UUID_A,
      tutorId: UUID_B,
      from: '2026-08-01',
      to: '2026-08-31',
    })
  })
})

describe('session-timings: the student filter', () => {
  it("narrows to the student's own classes", async () => {
    vi.mocked(selectActiveClassIdsForStudent).mockResolvedValue(['c1', 'c2'])
    await loadSessionTimingsPageData(ACTOR, { student: UUID_A })
    expect(vi.mocked(listMenteeSessionTimings).mock.calls[0][1].filters?.studentClassIds).toEqual(['c1', 'c2'])
  })

  it('a student with NO active class matches nothing, rather than showing every session', async () => {
    // Dropping an empty array would leave the query unfiltered - the filter would appear to
    // be applied while quietly showing the whole list.
    vi.mocked(selectActiveClassIdsForStudent).mockResolvedValue([])
    const data = await loadSessionTimingsPageData(ACTOR, { student: UUID_A })
    expect(listMenteeSessionTimings).not.toHaveBeenCalled()
    expect(data.items).toEqual([])
    expect(data.total).toBe(0)
  })
})

describe('session-timings: paging', () => {
  it('folds a page past the end back onto the last real page', async () => {
    vi.mocked(listMenteeSessionTimings).mockResolvedValue({ items: [], total: 25 })
    const data = await loadSessionTimingsPageData(ACTOR, { page: '999' })
    expect(data.filters.page).toBe(2)
    // Re-read at the corrected page rather than rendering the empty slice it first got.
    expect(vi.mocked(listMenteeSessionTimings).mock.calls.map((c) => c[1].page)).toEqual([999, 2])
  })

  it('does not re-read when the requested page is already in range', async () => {
    vi.mocked(listMenteeSessionTimings).mockResolvedValue({ items: [], total: 100 })
    await loadSessionTimingsPageData(ACTOR, { page: '2' })
    expect(listMenteeSessionTimings).toHaveBeenCalledTimes(1)
  })
})

describe('sessionTimingsUrl', () => {
  const base = { page: 1, student: '', subject: '', tutor: '', classId: '', from: '', to: '' }

  it('an unfiltered first page is the bare path', () => {
    expect(sessionTimingsUrl(base)).toBe('/session-timings')
  })

  it('carries every active filter through a page change', () => {
    // Paging must not silently drop a filter - the reader would think the list changed.
    const url = sessionTimingsUrl({ ...base, subject: UUID_A, tutor: UUID_B, from: '2026-08-01' }, { page: 3 })
    expect(url).toContain('subject=' + UUID_A)
    expect(url).toContain('tutor=' + UUID_B)
    expect(url).toContain('from=2026-08-01')
    expect(url).toContain('page=3')
  })
})
