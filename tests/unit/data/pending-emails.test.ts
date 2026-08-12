import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { enqueuePendingEmails, selectPendingEmails, markEmailSent, markEmailFailed } from '@/lib/data/pending-emails'

beforeEach(() => vi.resetAllMocks())

describe('pending-emails data layer', () => {
  it('enqueues the rendered rows in one insert', async () => {
    const client = makeClient({ data: null, error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as any)
    await enqueuePendingEmails([{ to_email: 'a@x.dev', subject: 's', html: 'h' }])
    const builder = client.from.mock.results[0].value
    expect(client.from).toHaveBeenCalledWith('pending_emails')
    expect(builder.insert).toHaveBeenCalledWith([{ to_email: 'a@x.dev', subject: 's', html: 'h' }])
  })

  it('no-ops (no DB call) for an empty batch', async () => {
    await enqueuePendingEmails([])
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('throws loudly (prefixed) on an enqueue error', async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeClient({ data: null, error: { message: 'boom' } }) as any)
    await expect(enqueuePendingEmails([{ to_email: 'a@x.dev', subject: 's', html: 'h' }])).rejects.toThrow(
      /pendingEmails\.enqueue: boom/,
    )
  })

  it('reads the oldest pending rows', async () => {
    const row = { id: 'e1', to_email: 'a@x.dev', subject: 's', html: 'h', attempts: 0 }
    vi.mocked(createAdminClient).mockReturnValue(makeClient({ data: [row], error: null }) as any)
    await expect(selectPendingEmails(50)).resolves.toEqual([row])
  })

  it('marks a row sent', async () => {
    const client = makeClient({ data: null, error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as any)
    await markEmailSent('e1', 1)
    const builder = client.from.mock.results[0].value
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sent', attempts: 1, sent_at: expect.any(String) }),
    )
  })

  it('parks a terminal failure as failed, keeping the error', async () => {
    const client = makeClient({ data: null, error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as any)
    await markEmailFailed('e1', 3, true, 'provider down')
    const builder = client.from.mock.results[0].value
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', attempts: 3, last_error: 'provider down' }),
    )
  })

  it('keeps a non-terminal failure pending for the next drain', async () => {
    const client = makeClient({ data: null, error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as any)
    await markEmailFailed('e1', 1, false, 'transient')
    const builder = client.from.mock.results[0].value
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', attempts: 1 }))
  })
})
