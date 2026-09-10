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
    // results[0] is the classes lookup that resolves the session's subject; the insert is
    // the second call on the same client.
    const builder = client.from.mock.results[1].value
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
})

describe('insertSession stamps WHAT was taught', () => {
  // A tutor teaches several subjects, so a session cannot be read back through its tutor -
  // and it must not be read back through the CLASS either, because re-pointing a class would
  // rewrite what past sessions taught. Hence a column on the session, filled here so EVERY
  // writer gets it rather than only the one that remembers to.
  it('fills the subject from the class when the caller does not supply one', async () => {
    const client = makeClient({ data: { subject_id: 'sub-1' }, error: null })
    // Second call is the insert itself; the first resolves the class's subject.
    const inserted = makeClient({ data: session, error: null })
    vi.mocked(createAdminClient)
      .mockReturnValueOnce(client as never)
      .mockReturnValueOnce(inserted as never)

    await insertSession({ class_id: 'c1', session_date: '2026-06-20' } as never)

    expect(client.from).toHaveBeenCalledWith('classes')
  })

  it('keeps an EXPLICIT subject, including a deliberate null', async () => {
    // An explicit value is a decision the caller has already made; re-deriving it from the
    // class would quietly overrule them.
    const client = makeClient({ data: session, error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    await insertSession({ class_id: 'c1', session_date: '2026-06-20', subject_id: null } as never)

    expect(client.from).not.toHaveBeenCalledWith('classes')
  })
})
