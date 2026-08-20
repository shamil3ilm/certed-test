import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import {
  enqueuePendingEmails,
  claimPendingEmails,
  requeueStaleClaims,
  markEmailSent,
  markEmailFailed,
} from '@/lib/data/pending-emails'

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

  it('claims the oldest pending rows atomically via the RPC', async () => {
    const row = { id: 'e1', to_email: 'a@x.dev', subject: 's', html: 'h', attempts: 0 }
    const client = makeClient({ data: null, error: null }, { data: [row], error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as any)
    await expect(claimPendingEmails(50)).resolves.toEqual([row])
    expect(client.rpc).toHaveBeenCalledWith('claim_pending_emails', { p_limit: 50 })
  })

  it('throws loudly (prefixed) when the claim RPC errors', async () => {
    const client = makeClient({ data: null, error: null }, { data: null, error: { message: 'no fn' } })
    vi.mocked(createAdminClient).mockReturnValue(client as any)
    await expect(claimPendingEmails(50)).rejects.toThrow(/pendingEmails\.claim: no fn/)
  })

  it('reaps rows stuck sending past the lease back to pending', async () => {
    const client = makeClient({ data: null, error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as any)
    await requeueStaleClaims('2026-01-01T00:00:00.000Z')
    const builder = client.from.mock.results[0].value
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', claimed_at: null }))
    expect(builder.eq).toHaveBeenCalledWith('status', 'sending')
    expect(builder.lt).toHaveBeenCalledWith('claimed_at', '2026-01-01T00:00:00.000Z')
  })

  it('marks a row sent, compare-and-swapping on the sending claim', async () => {
    const client = makeClient({ data: null, error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as any)
    await markEmailSent('e1', 1)
    const builder = client.from.mock.results[0].value
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sent', attempts: 1, sent_at: expect.any(String) }),
    )
    // Only the drain still holding the claim writes the outcome.
    expect(builder.eq).toHaveBeenCalledWith('status', 'sending')
  })

  it('parks a terminal failure as failed, keeping the error', async () => {
    const client = makeClient({ data: null, error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as any)
    await markEmailFailed('e1', 3, true, 'provider down')
    const builder = client.from.mock.results[0].value
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', attempts: 3, last_error: 'provider down' }),
    )
    expect(builder.eq).toHaveBeenCalledWith('status', 'sending')
  })

  it('returns a non-terminal failure to pending for the next drain to re-claim', async () => {
    const client = makeClient({ data: null, error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as any)
    await markEmailFailed('e1', 1, false, 'transient')
    const builder = client.from.mock.results[0].value
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', attempts: 1 }))
  })
})
