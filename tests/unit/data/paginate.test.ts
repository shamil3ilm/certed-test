import { describe, it, expect, vi } from 'vitest'
import { fetchAllPaged } from '@/lib/data/paginate'

/** A fake PostgREST-style pager over `total` synthetic rows. */
function pagerOf(total: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ i }))
  return vi.fn((from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }))
}

describe('fetchAllPaged', () => {
  it('returns everything when under one page', async () => {
    expect((await fetchAllPaged(pagerOf(3), 'label')).length).toBe(3)
  })

  it('crosses page boundaries to fetch every row (2.5 pages)', async () => {
    const page = pagerOf(2500)
    const rows = await fetchAllPaged(page, 'label')
    expect(rows.length).toBe(2500)
    expect(page).toHaveBeenCalledTimes(3) // 1000 + 1000 + 500
  })

  it('handles an exact multiple of the page size (fetches a final empty page)', async () => {
    const page = pagerOf(2000)
    const rows = await fetchAllPaged(page, 'label')
    expect(rows.length).toBe(2000)
    expect(page).toHaveBeenCalledTimes(3) // 1000 + 1000 + 0
  })

  it('returns empty for zero rows', async () => {
    expect(await fetchAllPaged(pagerOf(0), 'label')).toEqual([])
  })

  it('throws with the label on a query error', async () => {
    await expect(
      fetchAllPaged(() => Promise.resolve({ data: null, error: { message: 'boom' } }), 'analytics.thing'),
    ).rejects.toThrow('analytics.thing: boom')
  })
})
