import { describe, it, expect, vi } from 'vitest'
import { fetchAllPaged, fetchUpTo } from '@/lib/data/paginate'

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

describe('fetchUpTo', () => {
  // `.limit(n)` cannot express "the first n" once n passes the PostgREST row cap: the
  // response is capped regardless, so the caller gets 1000 while believing it asked for
  // more. That is what silently broke the announcements Stream past roughly page 50, where
  // n is `page * pageSize` rather than a fixed number.

  it('returns exactly n when the source has more', async () => {
    const page = pagerOf(5000)
    const rows = await fetchUpTo(page, 2500, 'label')
    expect(rows.length).toBe(2500)
    expect(page).toHaveBeenCalledTimes(3) // 1000 + 1000 + 500
  })

  it('never over-fetches: the last chunk is clamped to n, not to the page size', async () => {
    const page = pagerOf(5000)
    await fetchUpTo(page, 2500, 'label')
    // from/to pairs are inclusive, so the final call must stop at row 2499.
    expect(page.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2499],
    ])
  })

  it('stops early when the source runs out, rather than paging to n', async () => {
    const page = pagerOf(30)
    const rows = await fetchUpTo(page, 5000, 'label')
    expect(rows.length).toBe(30)
    expect(page).toHaveBeenCalledTimes(1) // one short page is enough to know there is no more
  })

  it('asks for one round trip when n is under the chunk size', async () => {
    const page = pagerOf(1000)
    expect((await fetchUpTo(page, 20, 'label')).length).toBe(20)
    expect(page).toHaveBeenCalledWith(0, 19)
    expect(page).toHaveBeenCalledTimes(1)
  })

  it('returns empty for n = 0 without touching the database', async () => {
    const page = pagerOf(100)
    expect(await fetchUpTo(page, 0, 'label')).toEqual([])
    expect(page).not.toHaveBeenCalled()
  })

  it('returns empty when the source has nothing', async () => {
    expect(await fetchUpTo(pagerOf(0), 100, 'label')).toEqual([])
  })

  it('throws with the label on a query error', async () => {
    await expect(
      fetchUpTo(() => Promise.resolve({ data: null, error: { message: 'boom' } }), 100, 'announcements.page'),
    ).rejects.toThrow('announcements.page: boom')
  })
})
