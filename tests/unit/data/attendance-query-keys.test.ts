import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClientCapturing } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { deleteSessionMarks, upsertMarks, updateJoinAtAsService, studentHasAttendance } from '@/lib/data/attendance'
import { selectAttendedForSessions } from '@/lib/data/analytics'

/**
 * These assert WHICH COLUMN each query filters on, not what it returns.
 *
 * The distinction is the whole point. A read keyed on the wrong column still returns
 * plausible rows and still passes a returns-the-rows test - which is why the entire unit
 * suite stayed green while a student could read a session they never attended. The key was
 * `session_date` where `session_id` was meant, and nothing asserted the key.
 *
 * Since 0093/0094 a class may hold several sessions a day and each attendance mark belongs
 * to one, so on these functions the difference between the two keys is the difference
 * between "the session" and "the whole day". Every case below would still pass if the data
 * came back correctly but the filter were wrong - so the filter is what is asserted.
 */

function capture() {
  const { client, builder } = makeClientCapturing({ data: [{ id: 'a1' }], error: null })
  vi.mocked(createAdminClient).mockReturnValue(client as never)
  return { builder, client }
}

/** One query only - the stub reuses a single builder, so a second `.from()` would blend
 *  two queries' filters together and make a key assertion meaningless. */
function expectSingleQuery(client: { from: { mock: { calls: unknown[] } } }) {
  expect(client.from.mock.calls.length).toBe(1)
}

/** The columns a query filtered on, in call order. */
function eqKeys(builder: ReturnType<typeof capture>['builder']): string[] {
  return builder.eq.mock.calls.map((c: unknown[]) => String(c[0]))
}

beforeEach(() => vi.resetAllMocks())

describe('attendance query keys are per SESSION, not per date', () => {
  it('deleteSessionMarks filters on session_id alone - never on class_id/session_date', async () => {
    const { builder, client } = capture()
    await deleteSessionMarks('sess-1')

    expectSingleQuery(client)
    expect(eqKeys(builder)).toEqual(['session_id'])
    expect(builder.eq).toHaveBeenCalledWith('session_id', 'sess-1')
    // A day key here would clear every session's marks on the date - the bug this replaced.
    expect(eqKeys(builder)).not.toContain('session_date')
  })

  it('updateJoinAtAsService targets ONE mark: (session_id, student_id)', async () => {
    const { builder, client } = capture()
    await updateJoinAtAsService('sess-1', 'stu-1', '2026-09-05T10:00:00.000Z')

    expectSingleQuery(client)
    expect(eqKeys(builder).sort()).toEqual(['session_id', 'student_id'])
    expect(eqKeys(builder)).not.toContain('session_date')
  })

  it('upsertMarks resolves conflicts on (session_id, student_id)', async () => {
    const { builder, client } = capture()
    await upsertMarks([{ class_id: 'c1', student_id: 's1', session_id: 'sess-1', session_date: '2026-09-05' } as never])

    expectSingleQuery(client)
    expect(builder.upsert).toHaveBeenCalledWith(expect.anything(), { onConflict: 'session_id,student_id' })
  })

  it('selectAttendedForSessions reads by session id and counts late as attended', async () => {
    const { client, builder } = makeClientCapturing({ data: [], error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as never)
    await selectAttendedForSessions(['sess-1', 'sess-2'])

    // `in` on the session ids, and on the statuses that mean "was there".
    expect(builder.in).toHaveBeenCalledWith('session_id', ['sess-1', 'sess-2'])
    expect(builder.in).toHaveBeenCalledWith('status', ['present', 'late'])
    expect(eqKeys(builder)).not.toContain('session_date')
  })
})

describe('the guards that remain day-scoped, deliberately', () => {
  it('studentHasAttendance is a per-DAY pre-check, matching the one-box-per-day feedback UI', async () => {
    const { client, builder } = makeClientCapturing({ data: null, error: null, count: 1 })
    vi.mocked(createAdminClient).mockReturnValue(client as never)
    await studentHasAttendance('c1', 's1', '2026-09-05')

    // Day-keyed ON PURPOSE: it cheaply rejects a date the student never attended at all,
    // while RLS (0097) does the per-session scoping. Asserted so the choice is visible
    // rather than looking like the bug that was just fixed elsewhere in this file.
    expect(eqKeys(builder).sort()).toEqual(['class_id', 'session_date', 'student_id'])
  })
})
