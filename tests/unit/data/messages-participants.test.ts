import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { selectMyParticipations } from '@/lib/data/messages-participants'

/**
 * A person's inbox is built by resolving EVERY conversation they are in and then paging
 * that id set in SQL. So a capped read here does not shorten a page - it drops
 * conversations out of the inbox entirely, out of its total, and out of what the unread
 * filter considers. The reader sees a shorter list with a confident count, which looks
 * exactly like being in fewer conversations.
 *
 * The stub therefore pages for real: it slices a synthetic set by the requested range, so
 * a read that stops at the first response returns 1000 of 1500 and fails these tests.
 */
function pagingClient(totalRows: number) {
  const rows = Array.from({ length: totalRows }, (_, i) => ({
    // Zero-padded so lexical order matches numeric order - the assertion below compares
    // the returned sequence against the requested one.
    conversation_id: `c-${String(i).padStart(5, '0')}`,
    last_read_at: null,
  }))
  const calls = { eq: [] as unknown[][], order: [] as unknown[][], ranges: [] as number[][] }
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn((...args: unknown[]) => {
      calls.eq.push(args)
      return builder
    }),
    order: vi.fn((...args: unknown[]) => {
      calls.order.push(args)
      return builder
    }),
    range: vi.fn((from: number, to: number) => {
      calls.ranges.push([from, to])
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null })
    }),
  }
  return { client: { from: vi.fn(() => builder) }, calls }
}

beforeEach(() => vi.resetAllMocks())

describe('selectMyParticipations is complete, not a first page', () => {
  it('walks past the row cap and returns every conversation', async () => {
    const { client, calls } = pagingClient(1500)
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    const rows = await selectMyParticipations('me')

    // 1500, not the 1000 a single uncapped read would silently return.
    expect(rows).toHaveLength(1500)
    expect(calls.ranges.length).toBeGreaterThan(1)
    // No conversation appears twice and none is missing - the property an offset walk only
    // has when its ordering is a TOTAL order.
    expect(new Set(rows.map((r) => r.conversation_id)).size).toBe(1500)
  })

  it('orders by conversation_id, which is unique within one person rows', async () => {
    // (conversation_id, profile_id) is UNIQUE, so for a single profile conversation_id is
    // by itself a total order. Without any order the walk is free to repeat one row at a
    // page boundary and skip another, losing a conversation while still returning 1500.
    const { client, calls } = pagingClient(5)
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    await selectMyParticipations('me')

    expect(calls.order).toContainEqual(['conversation_id', { ascending: true }])
  })

  it('keys on the caller profile, not the conversation', async () => {
    const { client, calls } = pagingClient(1)
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    await selectMyParticipations('me')

    expect(calls.eq).toEqual([['profile_id', 'me']])
  })
})
