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
    // range() must apply the offset, not just the span as a limit() - otherwise
    // every "page" returns the same first N rows.
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

describe('MockQueryBuilder - contracts a PAGED read depends on', () => {
  // Deliberately built so the two sort keys DISAGREE: ordering by created_at alone gives
  // b, c, a - a different answer from the compound (session_date desc, created_at desc),
  // which gives c, a, b. A fixture where both keys agree cannot tell the two apart, and so
  // could not fail against a builder that honoured only the last .order().
  const rows = [
    { id: 'a', class_id: 'c1', session_date: '2026-08-05', created_at: '2026-08-04T09:00:00Z' },
    { id: 'b', class_id: 'c2', session_date: '2026-08-04', created_at: '2026-08-06T09:00:00Z' },
    { id: 'c', class_id: 'c3', session_date: '2026-08-05', created_at: '2026-08-05T09:00:00Z' },
  ]

  it('applies EVERY .order() as a compound sort, not just the last', async () => {
    // A paged list orders by a primary key plus a tie-breaker precisely so the order is
    // total and a row cannot shift between pages. Honouring only the last .order() would
    // make mock-mode paging non-deterministic wherever the first key ties - and it did.
    const { data } = await new MockQueryBuilder([...rows], 'class_sessions')
      .order('session_date', { ascending: false })
      .order('created_at', { ascending: false })
      .select('*')
    expect((data as { id: string }[]).map((r) => r.id)).toEqual(['c', 'a', 'b'])
  })

  it("accepts .not(col, 'in', ...) in PostgREST's `(a,b)` string form as well as an array", async () => {
    // supabase-js does not wrap the list for you on .not() the way it does on .in(), so the
    // real wire form is a string. Treated as an array it would hit String.includes and
    // substring-match, excluding any id that is a fragment of another - in mock mode only.
    const asString = await new MockQueryBuilder([...rows], 'class_sessions')
      .not('class_id', 'in', '(c1,c3)')
      .select('*')
    const asArray = await new MockQueryBuilder([...rows], 'class_sessions')
      .not('class_id', 'in', ['c1', 'c3'])
      .select('*')
    expect((asString.data as { id: string }[]).map((r) => r.id)).toEqual(['b'])
    expect((asArray.data as { id: string }[]).map((r) => r.id)).toEqual(['b'])
  })

  it('does not substring-match an id that is a fragment of an excluded one', async () => {
    const { data } = await new MockQueryBuilder(
      [
        { id: '1', class_id: 'c1' },
        { id: '2', class_id: 'c11' },
      ],
      'class_sessions',
    )
      .not('class_id', 'in', '(c11)')
      .select('*')
    expect((data as { id: string }[]).map((r) => r.id)).toEqual(['1'])
  })
})
