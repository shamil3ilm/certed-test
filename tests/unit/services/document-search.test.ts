import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/data/resources', () => ({ selectDocumentSearchPage: vi.fn() }))
vi.mock('@/lib/services/classes', () => ({ listClassesByIds: vi.fn() }))

import { selectDocumentSearchPage } from '@/lib/data/resources'
import { listClassesByIds } from '@/lib/services/classes'
import { searchDocuments } from '@/lib/services/resources'
import { documentSearchUrl, loadDocumentSearchPageData } from '@/lib/services/page-data/document-search'

beforeEach(() => vi.resetAllMocks())

describe('searchDocuments', () => {
  it('translates page -> range, forwards filters, and decorates rows with class names', async () => {
    vi.mocked(selectDocumentSearchPage).mockResolvedValueOnce({
      rows: [
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
      rows: [{ id: 'd1', class_id: 'gone', title: 'Orphan', category: 'general_documents', download_count: 0 }] as any,
      total: 1,
    })
    vi.mocked(listClassesByIds).mockResolvedValueOnce([] as any)
    const result = await searchDocuments({ page: 1, pageSize: 20 })
    expect(result.items[0].className).toBe('Class')
  })
})

describe('loadDocumentSearchPageData', () => {
  it('parses filters, marks active filters, and pages the results', async () => {
    vi.mocked(selectDocumentSearchPage).mockResolvedValueOnce({ rows: [], total: 45 } as any)
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
    vi.mocked(selectDocumentSearchPage).mockResolvedValueOnce({ rows: [], total: 0 } as any)
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
