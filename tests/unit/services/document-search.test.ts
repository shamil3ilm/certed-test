import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/data/resources', () => ({ selectDocumentSearchPage: vi.fn() }))
vi.mock('@/lib/services/classes', () => ({ listClassesByIds: vi.fn() }))
vi.mock('@/lib/data/class-membership', () => ({ selectActiveEnrollmentRefsByClassIds: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileNamesByIds: vi.fn() }))

import { selectDocumentSearchPage } from '@/lib/data/resources'
import { listClassesByIds } from '@/lib/services/classes'
import { selectActiveEnrollmentRefsByClassIds } from '@/lib/data/class-membership'
import { getProfileNamesByIds } from '@/lib/services/users'
import { searchDocuments } from '@/lib/services/resources'
import { documentSearchUrl, loadDocumentSearchPageData } from '@/lib/services/page-data/document-search'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(selectActiveEnrollmentRefsByClassIds).mockResolvedValue([])
  vi.mocked(getProfileNamesByIds).mockResolvedValue(new Map())
})

describe('searchDocuments', () => {
  it('translates page -> range, forwards filters, and decorates rows with class names', async () => {
    vi.mocked(selectDocumentSearchPage).mockResolvedValueOnce({
      items: [
        { id: 'd1', class_id: 'c1', title: 'Algebra paper', category: 'question_papers', download_count: 0 },
        { id: 'd2', class_id: 'c2', title: 'Physics sheet', category: 'practice_sheets', download_count: 3 },
      ] as any,
      total: 2,
    })
    vi.mocked(listClassesByIds).mockResolvedValueOnce([
      { id: 'c1', name: 'Grade 10 Maths' },
      { id: 'c2', name: 'Grade 11 Physics' },
    ] as any)

    const result = await searchDocuments({ page: 2, pageSize: 20, search: 'paper', category: 'question_papers' })

    expect(selectDocumentSearchPage).toHaveBeenCalledWith(
      expect.objectContaining({ from: 20, to: 39, search: 'paper', category: 'question_papers', sort: 'latest' }),
    )
    expect(result.total).toBe(2)
    expect(result.items[0]).toEqual({ document: expect.objectContaining({ id: 'd1' }), className: 'Grade 10 Maths' })
    expect(result.items[1].className).toBe('Grade 11 Physics')
  })

  it('falls back to a generic class label when a name cannot be resolved', async () => {
    vi.mocked(selectDocumentSearchPage).mockResolvedValueOnce({
      items: [{ id: 'd1', class_id: 'gone', title: 'Orphan', category: 'general_documents', download_count: 0 }] as any,
      total: 1,
    })
    vi.mocked(listClassesByIds).mockResolvedValueOnce([] as any)
    const result = await searchDocuments({ page: 1, pageSize: 20 })
    expect(result.items[0].className).toBe('Class')
  })
})

describe('loadDocumentSearchPageData', () => {
  it('parses filters, marks active filters, and pages the results', async () => {
    vi.mocked(selectDocumentSearchPage).mockResolvedValueOnce({ items: [], total: 45 } as any)
    vi.mocked(listClassesByIds).mockResolvedValueOnce([] as any)

    const data = await loadDocumentSearchPageData({ q: ' maths ', cat: 'question_papers', page: '3' })

    expect(data.filters.q).toBe('maths')
    expect(data.filters.category).toBe('question_papers')
    expect(data.filters.page).toBe(3)
    expect(data.hasActiveFilters).toBe(true)
    expect(data.totalPages).toBe(3) // 45 / 20 -> 3 pages
    // page 3 of size 20 -> rows 40..59
    expect(selectDocumentSearchPage).toHaveBeenCalledWith(expect.objectContaining({ from: 40, to: 59 }))
  })

  it('ignores an unknown category and reports no active filters on a clean search', async () => {
    vi.mocked(selectDocumentSearchPage).mockResolvedValueOnce({ items: [], total: 0 } as any)
    vi.mocked(listClassesByIds).mockResolvedValueOnce([] as any)
    const data = await loadDocumentSearchPageData({ cat: 'made_up' })
    expect(data.filters.category).toBe('')
    expect(data.hasActiveFilters).toBe(false)
  })
})

describe('documentSearchUrl', () => {
  it('omits defaults and carries only active filters + a non-first page', () => {
    const base = { page: 1, q: '', category: '' as const, subject: '', from: '', to: '', sort: 'latest' as const }
    expect(documentSearchUrl(base)).toBe('/documents')
    expect(documentSearchUrl(base, { q: 'algebra', page: 2 })).toBe('/documents?page=2&q=algebra')
    expect(documentSearchUrl(base, { sort: 'oldest' })).toBe('/documents?sort=oldest')
  })
})

describe('document search: grouping a page under the student who owns the class', () => {
  const docs = (rows: { id: string; class_id: string }[]) => {
    vi.mocked(selectDocumentSearchPage).mockResolvedValue({ items: rows as never, total: rows.length })
    vi.mocked(listClassesByIds).mockResolvedValue(
      [...new Set(rows.map((r) => r.class_id))].map((id) => ({ id, name: id.toUpperCase() })) as never,
    )
  }

  it('groups by student, and orders groups by FIRST APPEARANCE so recency survives', async () => {
    // The list is newest-first. If groups were sorted by name instead, the newest document
    // could land halfway down the page - which is the one thing a "what's new" list may
    // not do.
    docs([
      { id: 'd1', class_id: 'cB' },
      { id: 'd2', class_id: 'cA' },
      { id: 'd3', class_id: 'cB' },
    ])
    vi.mocked(selectActiveEnrollmentRefsByClassIds).mockResolvedValue([
      { class_id: 'cA', student_id: 'aaa' },
      { class_id: 'cB', student_id: 'zzz' },
    ] as never)
    vi.mocked(getProfileNamesByIds).mockResolvedValue(
      new Map([
        ['aaa', 'Ann'],
        ['zzz', 'Zoe'],
      ]),
    )

    const data = await loadDocumentSearchPageData({})

    // Zoe first: she owns d1, the newest document. Alphabetical would have put Ann first.
    expect(data.groups.map((g) => g.label)).toEqual(['Zoe', 'Ann'])
    expect(data.groups[0].results.map((r) => r.document.id)).toEqual(['d1', 'd3'])
    expect(data.groups[1].results.map((r) => r.document.id)).toEqual(['d2'])
  })

  it('keeps a document whose class has no active student, in a trailing group', async () => {
    // Dropping it would make the page show fewer documents than the total it just printed.
    docs([
      { id: 'd1', class_id: 'cA' },
      { id: 'd2', class_id: 'cOrphan' },
    ])
    vi.mocked(selectActiveEnrollmentRefsByClassIds).mockResolvedValue([{ class_id: 'cA', student_id: 'aaa' }] as never)
    vi.mocked(getProfileNamesByIds).mockResolvedValue(new Map([['aaa', 'Ann']]))

    const data = await loadDocumentSearchPageData({})

    expect(data.groups.map((g) => g.label)).toEqual(['Ann', 'Not linked to a student'])
    // Every result the page counted is still rendered by exactly one group.
    expect(data.groups.flatMap((g) => g.results)).toHaveLength(data.results.length)
  })

  it('resolves only the CLASSES ON THIS PAGE, so grouping cannot grow with the library', async () => {
    docs([
      { id: 'd1', class_id: 'cA' },
      { id: 'd2', class_id: 'cA' },
      { id: 'd3', class_id: 'cB' },
    ])
    await loadDocumentSearchPageData({})
    // De-duplicated to the page's two distinct classes, not one lookup per document.
    expect(vi.mocked(selectActiveEnrollmentRefsByClassIds).mock.calls[0][0]).toEqual(['cA', 'cB'])
  })

  it('does not query at all for an empty page', async () => {
    docs([])
    const data = await loadDocumentSearchPageData({})
    expect(data.groups).toEqual([])
    expect(selectActiveEnrollmentRefsByClassIds).not.toHaveBeenCalled()
  })
})
