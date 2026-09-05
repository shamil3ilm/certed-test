import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  selectSessionsForDate,
  insertSession,
  updateSessionById,
  deleteSessionById,
  writeStudentSessionFeedback,
  selectSessionsForClassesAsService,
  selectRecentSessions,
} from '@/lib/data/class-sessions'

const session = { id: 'ses1', class_id: 'c1', session_date: '2026-06-20' }

beforeEach(() => vi.resetAllMocks())

describe('class-sessions data layer', () => {
  it('selectSessionsForDate returns EVERY session that day (a class may hold several)', async () => {
    const two = [session, { id: 'ses2', class_id: 'c1', session_date: '2026-06-20' }]
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: two, error: null }) as any)
    expect(await selectSessionsForDate('c1', '2026-06-20')).toEqual(two)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: [], error: null }) as any)
    expect(await selectSessionsForDate('c1', '2026-06-21')).toEqual([])
  })

  it('insertSession ALWAYS inserts - a second session that day must not replace the first', async () => {
    const client = makeClient({ data: session, error: null })
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    expect(await insertSession({ class_id: 'c1', session_date: '2026-06-20', tutor_id: 't1' } as any)).toEqual(session)
    const builder = client.from.mock.results[0].value
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ class_id: 'c1', updated_at: expect.any(String) }),
    )
    // The old upsert-on-(class,date) is what silently overwrote the day's earlier session.
    expect(builder.upsert).not.toHaveBeenCalled()
  })

  it('insertSession throws on error', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(insertSession({ class_id: 'c1', session_date: 'd' } as any)).rejects.toThrow(/classSessions.insert: e/)
  })

  it('updateSessionById targets the session id and stamps updated_at', async () => {
    const client = makeClient({ data: session, error: null })
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    expect(await updateSessionById('ses1', { summary: 'done' })).toEqual(session)
    const builder = client.from.mock.results[0].value
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ summary: 'done', updated_at: expect.any(String) }),
    )
    expect(builder.eq).toHaveBeenCalledWith('id', 'ses1')
  })

  it('deleteSessionById reports whether a row was actually removed', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: [{ id: 'ses1' }], error: null }) as any)
    expect(await deleteSessionById('ses1')).toBe(true)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: [], error: null }) as any)
    expect(await deleteSessionById('gone')).toBe(false)
  })

  it('writeStudentSessionFeedback updates via the RLS client, no insert when the row exists', async () => {
    const client = makeClient({ data: [{ id: 'ses1' }], error: null })
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    await writeStudentSessionFeedback('c1', '2026-06-20', 'great class')
    const updateBuilder = client.from.mock.results[0].value
    expect(updateBuilder.update).toHaveBeenCalledWith({ student_feedback: 'great class' })
    expect(client.from).toHaveBeenCalledTimes(1) // the row existed - no insert
    expect(createAdminClient).not.toHaveBeenCalled() // NOT service role
  })

  it('writeStudentSessionFeedback inserts a feedback-only row when none exists', async () => {
    const client = makeClient({ data: [], error: null })
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    await writeStudentSessionFeedback('c1', '2026-06-20', 'ok')
    expect(client.from).toHaveBeenCalledTimes(2)
    const insertBuilder = client.from.mock.results[1].value
    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ class_id: 'c1', session_date: '2026-06-20', student_feedback: 'ok' }),
    )
  })

  it('writeStudentSessionFeedback throws on update error', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(writeStudentSessionFeedback('c1', 'd', null)).rejects.toThrow(
      /classSessions.studentFeedback\(update\): e/,
    )
  })

  it('selectSessionsForClassesAsService short-circuits on [] and returns rows otherwise', async () => {
    expect(await selectSessionsForClassesAsService([])).toEqual([])
    expect(createAdminClient).not.toHaveBeenCalled()
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: [session], error: null }) as any)
    expect(await selectSessionsForClassesAsService(['c1'])).toEqual([session])
  })

  it('selectSessionsForClassesAsService throws on error', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(selectSessionsForClassesAsService(['c1'])).rejects.toThrow(/classSessions.forClasses: e/)
  })

  it('selectRecentSessions returns bounded rows (RLS client) and throws on error', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: [session], error: null }) as any)
    expect(await selectRecentSessions('c1')).toEqual([session])
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(selectRecentSessions('c1')).rejects.toThrow(/classSessions.recent: e/)
  })
})
