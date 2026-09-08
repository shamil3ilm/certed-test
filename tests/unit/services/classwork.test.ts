import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/permission', () => ({ canManageClass: vi.fn() }))
vi.mock('@/lib/permission/personas', () => ({
  loadActivePersonas: vi.fn(),
  hasPersona: vi.fn(),
  loadPersonaFlags: vi.fn(),
}))
vi.mock('@/lib/services/assignments', () => ({
  listAssignmentPage: vi.fn(),
  // The page-data validates ?aType against this list, so the mock has to carry the real
  // values - a stubbed empty array would make every type silently invalid.
  ASSIGNMENT_TYPES: ['assignment', 'exam', 'quiz', 'test', 'project'],
}))
vi.mock('@/lib/services/comments', () => ({ listCommentsForEntities: vi.fn() }))
vi.mock('@/lib/services/resources', () => ({
  listResourcesPage: vi.fn(),
  listVersionsForDocuments: vi.fn(async () => new Map()),
}))
vi.mock('@/lib/services/submissions', () => ({
  listMyActiveSubmissions: vi.fn(),
  listMySupersededSubmissions: vi.fn(),
}))

import { loadActivePersonas, hasPersona, loadPersonaFlags } from '@/lib/permission/personas'
import { canManageClass } from '@/lib/permission'
import { listAssignmentPage } from '@/lib/services/assignments'
import {
  loadClassworkPageData,
  classworkUrl,
  classworkParams,
  parseClassworkState,
  type DocumentFilterState,
} from '@/lib/services/page-data/classwork'
import { listCommentsForEntities } from '@/lib/services/comments'
import { listResourcesPage } from '@/lib/services/resources'
import { listMyActiveSubmissions, listMySupersededSubmissions } from '@/lib/services/submissions'

const BASE_FILTERS: DocumentFilterState = { q: '', category: '', subject: '', from: '', to: '', sort: 'latest' }
const doc = (o: Record<string, unknown>) => ({ category: 'general_documents', ...o })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadPersonaFlags).mockImplementation(async (profileId: string) => {
    const student = profileId === 'student-1'
    return {
      personas: [],
      isAdmin: false,
      isSubAdmin: false,
      isManager: !student,
      isStudent: student,
      isMentor: false,
      hasMentorAuthority: false,
    } as any
  })
  vi.mocked(canManageClass).mockImplementation(async (profile: { id: string }) => profile.id !== 'student-1')
})

/**
 * Assignments and Documents share ONE Classwork URL, so every link either carries the whole
 * state or silently discards the other section's. Paging assignments used to rebuild the
 * query from scratch with only aType/aPage, wiping a reader's document search mid-browse -
 * the docstring above it even said it must not. This is the single builder both sections
 * use, so the two cannot drift apart again.
 */
describe('classworkUrl', () => {
  const STATE = { filters: BASE_FILTERS, assignmentType: '' as const, assignmentPage: 1 }

  it('builds filter URLs, omitting defaults and clearing on empty', () => {
    expect(classworkUrl(STATE, {})).toBe('?')
    expect(classworkUrl(STATE, { category: 'question_papers' })).toBe('?cat=question_papers')
    expect(classworkUrl(STATE, { q: 'notes', sort: 'oldest' })).toBe('?q=notes&sort=oldest')
  })

  it('KEEPS the document filters when paging assignments', () => {
    const withFilters = { ...STATE, filters: { ...BASE_FILTERS, q: 'algebra', category: 'question_papers' as const } }
    const url = classworkUrl(withFilters, { assignmentPage: 3 }, 'assignments')
    expect(url).toContain('q=algebra')
    expect(url).toContain('cat=question_papers')
    expect(url).toContain('aPage=3')
    expect(url.endsWith('#assignments')).toBe(true)
  })

  it('KEEPS the assignment page and type when a document filter changes', () => {
    const browsing = { filters: BASE_FILTERS, assignmentType: 'exam' as const, assignmentPage: 4 }
    const url = classworkUrl(browsing, { q: 'notes' }, 'materials')
    expect(url).toContain('aType=exam')
    expect(url).toContain('aPage=4')
    expect(url).toContain('q=notes')
  })

  it('omits aPage on page 1, so a plain first page has no noise in the URL', () => {
    expect(classworkUrl({ ...STATE, assignmentPage: 1 }, {})).toBe('?')
  })

  it('clears one section without disturbing the other', () => {
    const both = { filters: { ...BASE_FILTERS, q: 'algebra' }, assignmentType: 'quiz' as const, assignmentPage: 2 }
    // "Clear" on the assignments bar drops the type and returns to page 1, keeping the docs.
    const cleared = classworkUrl(both, { assignmentType: '', assignmentPage: 1 }, 'assignments')
    expect(cleared).toContain('q=algebra')
    expect(cleared).not.toContain('aType')
    expect(cleared).not.toContain('aPage')
  })
})

describe('loadClassworkPageData', () => {
  it('groups the student document view by category and maps comments', async () => {
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([
      { persona_name: 'student', scope_type: null, scope_id: null, status: 'active' },
    ] as any)
    vi.mocked(hasPersona).mockImplementation((_, name) => name === 'student')
    vi.mocked(listResourcesPage).mockResolvedValueOnce({
      items: [doc({ id: 'r1', title: 'Notes', category: 'practice_sheets', created_at: '2026-07-15T00:00:00.000Z' })],
      total: 1,
    } as any)
    // The visibility rule is applied by the QUERY now, so the mock returns what that query
    // would: the active assignment, not the archived one the student never submitted to.
    vi.mocked(listAssignmentPage).mockResolvedValueOnce({
      items: [
        { id: 'a1', class_id: 'class-1', title: 'Essay', status: 'active', due_date: '2026-07-17T00:00:00.000Z' },
      ],
      total: 1,
    } as any)
    vi.mocked(listMyActiveSubmissions).mockResolvedValueOnce([
      { id: 's1', assignment_id: 'a1', submitted_at: '2026-07-15T09:00:00.000Z', status: 'submitted' },
    ] as any)
    vi.mocked(listMySupersededSubmissions).mockResolvedValueOnce([
      { id: 's0', assignment_id: 'a1', submitted_at: '2026-07-14T09:00:00.000Z', status: 'submitted' },
    ] as any)
    vi.mocked(listCommentsForEntities)
      .mockResolvedValueOnce(new Map([['s1', [{ id: 'c1' }]]]) as any)
      .mockResolvedValueOnce(new Map([['r1', [{ id: 'c2' }]]]) as any)

    const result = await loadClassworkPageData(
      { id: 'student-1', role: 'student' } as any,
      { id: 'class-1', name: 'Math', status: 'active' },
      {},
    )

    expect(result.canManage).toBe(false)
    expect(result.canManageContent).toBe(false)
    expect(result.documentTotal).toBe(1)
    expect(result.documentsByCategory.practice_sheets).toHaveLength(1)
    expect(result.documentsByCategory.practice_sheets[0].comments).toEqual([{ id: 'c2' }])
    expect(result.documentsByCategory.question_papers).toEqual([])
    expect(result.archivedDocuments).toEqual([])
    expect(result.assignmentViews).toHaveLength(1)
    // The rule that decides which assignments a student may see now travels INTO the query,
    // so the pager's total counts the same set the page renders. Applied afterwards it
    // would not, and pages would come back short.
    expect(vi.mocked(listAssignmentPage).mock.calls[0][2]).toEqual({
      activeOnly: true,
      alsoIds: ['a1'],
    })
    // No type filter requested -> undefined, so the query is not narrowed.
    expect(vi.mocked(listAssignmentPage).mock.calls[0][3]).toBeUndefined()
    expect(result.assignmentViews[0].submissionHistory.map((s) => s.id)).toEqual(['s0'])
  })

  it('forwards a valid ?aType to the query and drops an unknown one', async () => {
    vi.mocked(listResourcesPage).mockResolvedValue({ items: [], total: 0 } as any)
    vi.mocked(listAssignmentPage).mockResolvedValue({ items: [], total: 0 } as any)
    vi.mocked(listCommentsForEntities).mockResolvedValue(new Map() as any)
    const course = { id: 'class-1', name: 'Math', status: 'active' } as any
    const tutor = { id: 'tutor-1', role: 'tutor' } as any

    await loadClassworkPageData(tutor, course, { aType: 'exam' })
    expect(vi.mocked(listAssignmentPage).mock.calls[0][3]).toBe('exam')

    vi.mocked(listAssignmentPage).mockClear()
    // A stale or hand-edited value must show every type rather than an empty section.
    await loadClassworkPageData(tutor, course, { aType: 'nonsense' })
    expect(vi.mocked(listAssignmentPage).mock.calls[0][3]).toBeUndefined()
  })

  it('reads the filter state from search params', async () => {
    vi.mocked(listResourcesPage).mockResolvedValue({ items: [], total: 0 } as any)
    vi.mocked(listAssignmentPage).mockResolvedValue({ items: [], total: 0 } as any)
    vi.mocked(listCommentsForEntities).mockResolvedValue(new Map() as any)

    const result = await loadClassworkPageData(
      { id: 'tutor-1', role: 'tutor' } as any,
      { id: 'class-1', name: 'Math', status: 'active' },
      { q: ' notes ', cat: 'question_papers', subj: 'Maths', sort: 'oldest', from: '2026-07-01' },
    )
    expect(result.filters).toEqual({
      q: 'notes',
      category: 'question_papers',
      subject: 'Maths',
      from: '2026-07-01',
      to: '',
      sort: 'oldest',
    })
    expect(result.hasActiveFilters).toBe(true)
  })

  it('loads archived documents for a manager and skips student lookups', async () => {
    vi.mocked(loadActivePersonas).mockResolvedValueOnce([
      { persona_name: 'tutor', scope_type: null, scope_id: null, status: 'active' },
    ] as any)
    vi.mocked(hasPersona).mockImplementation((_, name) => name === 'tutor')
    const responses = [
      { items: [], total: 0 },
      { items: [doc({ id: 'r2', title: 'Archived Notes' })], total: 1 },
    ]
    let call = 0
    vi.mocked(listResourcesPage).mockImplementation(() => Promise.resolve(responses[call++] as any))
    vi.mocked(listAssignmentPage).mockResolvedValueOnce({ items: [], total: 0 } as any)
    vi.mocked(listCommentsForEntities).mockResolvedValue(new Map() as any)

    const result = await loadClassworkPageData(
      { id: 'tutor-1', role: 'tutor' } as any,
      { id: 'class-1', name: 'Math', status: 'active' },
      {},
    )

    expect(result.canManage).toBe(true)
    expect(result.canManageContent).toBe(true)
    expect(result.archivedDocuments).toEqual([doc({ id: 'r2', title: 'Archived Notes' })])
    expect(listMyActiveSubmissions).not.toHaveBeenCalled()
  })

  it('keeps archived-class classwork readable while disabling manager write actions', async () => {
    vi.mocked(listResourcesPage).mockResolvedValue({ items: [], total: 0 } as any)
    vi.mocked(listAssignmentPage).mockResolvedValueOnce({ items: [], total: 0 } as any)
    vi.mocked(listCommentsForEntities).mockResolvedValue(new Map() as any)

    const result = await loadClassworkPageData(
      { id: 'tutor-1', role: 'tutor' } as any,
      { id: 'class-1', name: 'Math', status: 'archived' },
      {},
    )

    expect(result.canManage).toBe(true)
    expect(result.canManageContent).toBe(false)
    expect(result.isArchived).toBe(true)
  })
})

/**
 * The guard that makes the shared-URL bug non-recurring.
 *
 * Every piece of Classwork state has to survive a trip through the URL and back. Adding a
 * filter to the builder but not the parser (or vice versa) fails here, which is the failure
 * mode that produced the original bug: the pager serialized its own keys and silently
 * dropped everyone else's. Using the page's REAL parser matters - a copy could agree with
 * the builder while the page disagreed with both.
 */
describe('Classwork URL state survives a round trip', () => {
  const parseUrl = (url: string) => Object.fromEntries(new URLSearchParams(url.split('#')[0].slice(1)))

  it('carries every key back out again', () => {
    const state = {
      filters: {
        q: 'algebra',
        category: 'question_papers' as const,
        subject: 'Maths',
        from: '2026-01-01',
        to: '2026-06-30',
        sort: 'oldest' as const,
      },
      assignmentType: 'exam' as const,
      assignmentPage: 3,
    }
    expect(parseClassworkState(parseUrl(classworkUrl(state, {})))).toEqual(state)
  })

  it('round-trips the empty state to itself', () => {
    const empty = { filters: BASE_FILTERS, assignmentType: '' as const, assignmentPage: 1 }
    expect(parseClassworkState(parseUrl(classworkUrl(empty, {})))).toEqual(empty)
  })

  it('serializes every key the parser reads - neither side may know a key the other does not', () => {
    const full = {
      filters: {
        q: 'a',
        category: 'question_papers' as const,
        subject: 'b',
        from: '2026-01-01',
        to: '2026-02-02',
        sort: 'oldest' as const,
      },
      assignmentType: 'quiz' as const,
      assignmentPage: 2,
    }
    const serialized = classworkParams(full)
      .map(([key]) => key)
      .sort()
    const parsedBack = parseClassworkState(parseUrl(classworkUrl(full, {})))
    // Nothing was dropped in transit, and nothing arrived that was never sent.
    expect(parsedBack).toEqual(full)
    expect(serialized).toEqual(['aPage', 'aType', 'cat', 'from', 'q', 'sort', 'subj', 'to'])
  })
})
