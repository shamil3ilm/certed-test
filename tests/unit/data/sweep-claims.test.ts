import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeClientCapturing } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { claimDueReminders, selectDueReminderBacklog } from '@/lib/data/reminders-sweep'
import { claimAssignmentsDueSoon } from '@/lib/data/assignments-due-sweep'

const NOW = '2026-09-28T12:00:00.000Z'

beforeEach(() => vi.resetAllMocks())

/**
 * The claim IS the exclusivity, and it lives in the query rather than in any TypeScript the
 * service tests exercise: they mock this layer out entirely. What has to be true here is that the
 * SECOND step re-checks the marker - without that predicate two overlapping passes both "claim"
 * the same rows and every recipient is notified twice.
 *
 * A wrong column here returns plausible rows and passes any test that only counts them, so these
 * assert the keys, with makeClientCapturing's caveat respected: the builder is shared across
 * queries, so each test states which queries ran.
 */
describe('claimDueReminders', () => {
  it('re-checks notified_at IS NULL when it stamps, not only when it selects', async () => {
    const { builder, client } = makeClientCapturing({ data: [{ id: 'r1' }], error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    await claimDueReminders(NOW)

    // Two queries over the shared builder: select-due, then the claiming update.
    expect(client.from).toHaveBeenCalledTimes(2)
    expect(builder.update).toHaveBeenCalledWith({ notified_at: NOW })
    // Once for the select, once for the update - the second is what makes the claim exclusive.
    expect(builder.is.mock.calls.filter((c) => c[0] === 'notified_at' && c[1] === null)).toHaveLength(2)
  })

  it('scopes to what is DUE and not already ticked off by its owner', async () => {
    const { builder, client } = makeClientCapturing({ data: [], error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    await claimDueReminders(NOW)

    expect(builder.lte).toHaveBeenCalledWith('remind_at', NOW)
    expect(builder.eq).toHaveBeenCalledWith('is_sent', false)
    expect(builder.order).toHaveBeenCalledWith('remind_at', { ascending: true })
  })

  it('does not issue the update at all when nothing is due', async () => {
    const { client } = makeClientCapturing({ data: [], error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    await expect(claimDueReminders(NOW)).resolves.toEqual([])

    expect(client.from).toHaveBeenCalledTimes(1)
  })

  it('fails loudly - a swallowed error here is a silent day with no reminders', async () => {
    const { client } = makeClientCapturing({ data: null, error: { message: 'boom' } })
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    await expect(claimDueReminders(NOW)).rejects.toThrow(/reminders.selectDue: boom/)
  })
})

describe('claimAssignmentsDueSoon', () => {
  it('re-checks due_notified_at IS NULL when it stamps', async () => {
    const { builder, client } = makeClientCapturing({ data: [{ id: 'a1' }], error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    await claimAssignmentsDueSoon(NOW, '2026-09-29T12:00:00.000Z')

    expect(client.from).toHaveBeenCalledTimes(2)
    expect(builder.update).toHaveBeenCalledWith({ due_notified_at: NOW })
    expect(builder.is.mock.calls.filter((c) => c[0] === 'due_notified_at' && c[1] === null)).toHaveLength(2)
  })

  it('asks for a WINDOW - from now, up to the horizon - and only live assignments', async () => {
    const { builder, client } = makeClientCapturing({ data: [], error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    await claimAssignmentsDueSoon(NOW, '2026-09-29T12:00:00.000Z')

    expect(builder.gte).toHaveBeenCalledWith('due_date', NOW)
    expect(builder.lte).toHaveBeenCalledWith('due_date', '2026-09-29T12:00:00.000Z')
    expect(builder.eq).toHaveBeenCalledWith('status', 'active')
  })
})

/**
 * The health alarm's two numbers. They are deliberately two queries: a head count cannot return
 * rows and the row read cannot return a count, so "how many are waiting" can never silently
 * become "how many did I fetch".
 */
describe('selectDueReminderBacklog', () => {
  it('counts with head:true, so the number is the backlog and not the page size', async () => {
    const { builder, client } = makeClientCapturing({ data: [{ remind_at: NOW }], error: null, count: 42 })
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    await expect(selectDueReminderBacklog(NOW)).resolves.toEqual({ due: 42, oldestDueAt: NOW })

    expect(client.from).toHaveBeenCalledTimes(2)
    expect(builder.select).toHaveBeenCalledWith('remind_at', { count: 'exact', head: true })
    // The oldest-row query is ordered and capped; the count query is neither.
    expect(builder.limit).toHaveBeenCalledWith(1)
  })

  it('reports an empty queue as zero due and no age, never as an age of zero', async () => {
    const { client } = makeClientCapturing({ data: [], error: null, count: 0 })
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    await expect(selectDueReminderBacklog(NOW)).resolves.toEqual({ due: 0, oldestDueAt: null })
  })

  it('treats a missing count as zero rather than as NaN in the alarm text', async () => {
    const { client } = makeClientCapturing({ data: [], error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    await expect(selectDueReminderBacklog(NOW)).resolves.toEqual({ due: 0, oldestDueAt: null })
  })
})
