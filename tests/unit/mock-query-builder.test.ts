import { describe, it, expect } from 'vitest'
import { MockQueryBuilder } from '@/lib/mock/query-builder'

const rows = [
  { id: '1', role: 'student', status: 'active' },
  { id: '2', role: 'student', status: 'active' },
  { id: '3', role: 'tutor', status: 'active' },
  { id: '4', role: 'student', status: 'disabled' },
]

describe('MockQueryBuilder — count/head (mirrors Supabase-js select(cols, {count, head}))', () => {
  it('plain select is unaffected (no count field, full rows returned)', async () => {
    const { data, error, count } = await new MockQueryBuilder([...rows], 'profiles').eq('role', 'student').select('*')
    expect(error).toBeNull()
    expect(data).toHaveLength(3)
    expect(count).toBeUndefined()
  })

  it('count:"exact" without head returns both matching rows and the count', async () => {
    const { data, count } = await new MockQueryBuilder([...rows], 'profiles')
      .eq('role', 'student')
      .select('*', { count: 'exact' })
    expect(data).toHaveLength(3)
    expect(count).toBe(3)
  })

  it('count:"exact", head:true returns zero rows but the correct count', async () => {
    const { data, count } = await new MockQueryBuilder([...rows], 'profiles')
      .eq('role', 'student')
      .select('id', { count: 'exact', head: true })
    expect(data).toEqual([])
    expect(count).toBe(3)
  })

  it('head count reflects the filtered set, not the whole table', async () => {
    const { count } = await new MockQueryBuilder([...rows], 'profiles')
      .eq('role', 'student')
      .eq('status', 'active')
      .select('id', { count: 'exact', head: true })
    expect(count).toBe(2)
  })

  it('count reflects all matches, not the page size — a subsequent limit() does not shrink it', async () => {
    const { count } = await new MockQueryBuilder([...rows], 'profiles')
      .eq('role', 'student')
      .select('id', { count: 'exact' })
      .limit(1)
    expect(count).toBe(3)
  })
})

describe('MockQueryBuilder — range() (pagination)', () => {
  const paged = Array.from({ length: 25 }, (_, i) => ({ id: String(i), n: i }))

  it('range(from, to) returns the requested window, not just the first N rows', async () => {
    // Regression: range() used to only apply the SPAN as a limit() and ignore
    // the offset, so every "page" silently returned the same first N rows.
    const page1 = await new MockQueryBuilder([...paged], 't').order('n').range(0, 9).select('*')
    const page2 = await new MockQueryBuilder([...paged], 't').order('n').range(10, 19).select('*')
    expect((page1.data as { n: number }[]).map((r) => r.n)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect((page2.data as { n: number }[]).map((r) => r.n)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
  })

  it('the last partial page returns only the remaining rows', async () => {
    const lastPage = await new MockQueryBuilder([...paged], 't').order('n').range(20, 29).select('*')
    expect((lastPage.data as { n: number }[]).map((r) => r.n)).toEqual([20, 21, 22, 23, 24])
  })

  it('count with range still reflects the total, not the page size', async () => {
    const { count } = await new MockQueryBuilder([...paged], 't').range(0, 9).select('id', { count: 'exact' })
    expect(count).toBe(25)
  })
})

describe('MockQueryBuilder — or() (cross-column search)', () => {
  const people = [
    { id: '1', full_name: 'Sara Student', email: 'sara@x.c' },
    { id: '2', full_name: 'Sam Sample', email: 'other@x.c' },
    { id: '3', full_name: 'Nobody', email: 'sample@x.c' },
    { id: '4', full_name: 'Unrelated', email: 'unrelated@x.c' },
  ]

  it('matches a row if ANY clause matches (ilike on either column)', async () => {
    const { data } = await new MockQueryBuilder([...people], 'profiles')
      .or('full_name.ilike.%sample%,email.ilike.%sample%')
      .select('*')
    expect((data as { id: string }[]).map((r) => r.id).sort()).toEqual(['2', '3'])
  })

  it('throws on an unsupported operator rather than silently matching nothing', () => {
    expect(() => new MockQueryBuilder([...people], 'profiles').or('full_name.gt.5')).toThrow()
  })
})
