import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  selectSession,
  upsertSession,
  upsertSessionStudentFeedback,
  selectSessionsForClassesAsService,
  selectRecentSessions,
} from '@/lib/data/class-sessions'

const session = { id: 'ses1', class_id: 'c1', session_date: '2026-06-20' }

beforeEach(() => vi.resetAllMocks())

describe('class-sessions data layer', () => {
  it('selectSession returns the row (RLS client) or null', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: session, error: null }) as any)
    expect(await selectSession('c1', '2026-06-20')).toEqual(session)
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    expect(await selectSession('c1', '2026-06-21')).toBeNull()
  })

  it('upsertSession stamps updated_at, keys on class_id+session_date, returns the row', async () => {
    const client = makeClient({ data: session, error: null })
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    expect(await upsertSession({ class_id: 'c1', session_date: '2026-06-20', tutor_id: 't1' } as any)).toEqual(session)
    const builder = client.from.mock.results[0].value
    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ class_id: 'c1', updated_at: expect.any(String) }),
      { onConflict: 'class_id,session_date' },
    )
  })

  it('upsertSession throws on error', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(upsertSession({ class_id: 'c1', session_date: 'd' } as any)).rejects.toThrow(/classSessions.upsert: e/)
  })

  it('upsertSessionStudentFeedback upserts only the feedback and throws on error', async () => {
    const client = makeClient({ data: null, error: null })
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    await upsertSessionStudentFeedback('c1', '2026-06-20', 'great class')
    const builder = client.from.mock.results[0].value
    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ class_id: 'c1', student_feedback: 'great class' }),
      { onConflict: 'class_id,session_date' },
    )
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(upsertSessionStudentFeedback('c1', 'd', null)).rejects.toThrow(/classSessions.feedback: e/)
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
