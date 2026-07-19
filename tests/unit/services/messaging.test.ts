import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient, queryBuilder } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/repos/audit', () => ({ writeAudit: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileNamesByIds: vi.fn(async () => new Map()) }))
vi.mock('@/lib/messaging/recipient-policy', () => ({ canMessage: vi.fn() }))
vi.mock('@/lib/security/rate-limit', () => ({ rateLimit: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { writeAudit } from '@/lib/repos/audit'
import { canMessage } from '@/lib/messaging/recipient-policy'
import { getProfileNamesByIds } from '@/lib/services/users'
import { rateLimit } from '@/lib/security/rate-limit'
import { createConversation, sendMessage, markRead, listInbox, loadThread } from '@/lib/services/messaging'
import { PermissionError, ValidationError, NotFoundError, RateLimitError } from '@/lib/errors'

const actor = { id: 'actor-1', email: 'a@x.c', role: 'tutor', status: 'active' } as any

function tableClient(byTable: Record<string, unknown[]>) {
  return { from: vi.fn((t: string) => queryBuilder({ data: byTable[t] ?? [], error: null })) }
}

/**
 * Like `tableClient`, but `single()`/`maybeSingle()` return the FIRST row of the
 * table (or null) while awaiting the builder returns the full array. Needed for
 * services that mix single-row reads (assertParticipant, the conversation row)
 * with list reads (messages, participants) against different tables.
 */
function multiTableClient(byTable: Record<string, unknown[]>) {
  const build = (t: string) => {
    const rows = () => (byTable[t] ?? []) as unknown[]
    const array = () => ({ data: rows(), error: null as unknown })
    const first = () => ({ data: (rows()[0] ?? null) as unknown, error: null as unknown })
    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: () => builder,
      update: () => builder,
      delete: () => builder,
      eq: () => builder,
      neq: () => builder,
      in: () => builder,
      lt: () => builder,
      gt: () => builder,
      order: () => builder,
      limit: () => builder,
      range: () => builder,
      single: async () => first(),
      maybeSingle: async () => first(),
      then: (resolve: (v: { data: unknown; error: unknown }) => void) => Promise.resolve(array()).then(resolve),
    }
    return builder
  }
  return { from: vi.fn((t: string) => build(t)) }
}

beforeEach(() => {
  vi.resetAllMocks()
  // Default: not throttled. Individual tests opt into a throttled response.
  vi.mocked(rateLimit).mockReturnValue({ ok: true, remaining: 99, retryAfterSec: 0 })
})

describe('createConversation', () => {
  it('rejects when a recipient is not messageable by the actor', async () => {
    vi.mocked(canMessage).mockResolvedValueOnce(false)
    await expect(createConversation(actor, { recipientIds: ['stranger'] })).rejects.toBeInstanceOf(PermissionError)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('rejects an empty recipient list', async () => {
    await expect(createConversation(actor, { recipientIds: [] })).rejects.toBeInstanceOf(ValidationError)
  })

  it('throttles a burst of new conversations with RateLimitError', async () => {
    vi.mocked(rateLimit).mockReturnValueOnce({ ok: false, remaining: 0, retryAfterSec: 5 })
    await expect(createConversation(actor, { recipientIds: ['r1'] })).rejects.toBeInstanceOf(RateLimitError)
    expect(canMessage).not.toHaveBeenCalled() // shed before recipient checks / DB
  })

  it('dedupes to an existing 1:1 conversation instead of creating a new one', async () => {
    vi.mocked(canMessage).mockResolvedValueOnce(true)
    vi.mocked(createAdminClient).mockReturnValue(
      tableClient({
        conversation_participants: [{ conversation_id: 'conv-existing' }],
        conversations: [{ id: 'conv-existing' }],
      }) as any,
    )
    await expect(createConversation(actor, { recipientIds: ['friend'] })).resolves.toEqual({ id: 'conv-existing' })
    expect(writeAudit).not.toHaveBeenCalled() // no new conversation -> no create audit
  })

  it('creates a group conversation (no 1:1 dedupe) for multiple allowed recipients', async () => {
    vi.mocked(canMessage).mockResolvedValue(true) // every recipient is messageable
    vi.mocked(createAdminClient).mockReturnValue(
      multiTableClient({
        conversations: [{ id: 'g1', kind: 'group', title: 'Study group', created_by: 'actor-1' }],
        conversation_participants: [],
      }) as any,
    )
    await expect(
      createConversation(actor, { recipientIds: ['r1', 'r2'], title: 'Study group' }),
    ).resolves.toEqual({ id: 'g1' })
    expect(writeAudit).toHaveBeenCalledTimes(1) // a newly created conversation is audited
  })
})

describe('sendMessage', () => {
  it('rejects an empty message before any DB call', async () => {
    await expect(sendMessage(actor, 'conv-1', '   ')).rejects.toBeInstanceOf(ValidationError)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('throttles a burst of sends with RateLimitError before touching the DB', async () => {
    vi.mocked(rateLimit).mockReturnValueOnce({ ok: false, remaining: 0, retryAfterSec: 5 })
    await expect(sendMessage(actor, 'conv-1', 'spam')).rejects.toBeInstanceOf(RateLimitError)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('rejects a non-participant', async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeClient({ data: null, error: null }) as any) // participant lookup -> null
    await expect(sendMessage(actor, 'conv-1', 'hello')).rejects.toBeInstanceOf(PermissionError)
  })

  it('inserts a message for a participant', async () => {
    const msg = { id: 'm-1', conversation_id: 'conv-1', sender_id: 'actor-1', body: 'hello', created_at: 't' }
    vi.mocked(createAdminClient).mockReturnValue(makeClient({ data: msg, error: null }) as any)
    await expect(sendMessage(actor, 'conv-1', 'hello')).resolves.toMatchObject({ id: 'm-1', body: 'hello' })
  })
})

describe('markRead', () => {
  it('rejects a non-participant with PermissionError (does not silently no-op)', async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeClient({ data: null, error: null }) as any)
    await expect(markRead(actor, 'conv-1')).rejects.toBeInstanceOf(PermissionError)
  })

  it('updates the read watermark for a participant', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      multiTableClient({ conversation_participants: [{ id: 'p1', profile_id: 'actor-1' }] }) as any,
    )
    await expect(markRead(actor, 'conv-1')).resolves.toBeUndefined()
  })
})

describe('listInbox', () => {
  it('returns empty when the actor is in no conversations', async () => {
    vi.mocked(createAdminClient).mockReturnValue(multiTableClient({ conversation_participants: [] }) as any)
    await expect(listInbox(actor)).resolves.toEqual([])
  })

  it('flags unread when the last message is from someone else and newer than the read watermark', async () => {
    vi.mocked(getProfileNamesByIds).mockResolvedValue(new Map([['other', 'Bob']]))
    vi.mocked(createAdminClient).mockReturnValue(
      multiTableClient({
        conversation_participants: [
          { conversation_id: 'c1', profile_id: 'actor-1', last_read_at: '2026-01-01T00:00:00Z' },
          { conversation_id: 'c1', profile_id: 'other', last_read_at: '2026-01-01T00:00:00Z' },
        ],
        conversations: [
          { id: 'c1', kind: 'direct', title: null, created_by: 'actor-1', last_message_at: '2026-01-02T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
        ],
        // The desc/limit-1 query returns the newest; the stub returns the first row.
        messages: [{ conversation_id: 'c1', sender_id: 'other', body: 'unread from bob', created_at: '2026-01-02T00:00:00Z' }],
      }) as any,
    )
    const inbox = await listInbox(actor)
    expect(inbox).toHaveLength(1)
    expect(inbox[0]).toMatchObject({ id: 'c1', title: 'Bob', hasUnread: true, lastMessage: 'unread from bob' })
  })

  it('does not flag unread when the actor sent the last message', async () => {
    vi.mocked(getProfileNamesByIds).mockResolvedValue(new Map([['other', 'Bob']]))
    vi.mocked(createAdminClient).mockReturnValue(
      multiTableClient({
        conversation_participants: [
          { conversation_id: 'c1', profile_id: 'actor-1', last_read_at: '2026-01-01T00:00:00Z' },
          { conversation_id: 'c1', profile_id: 'other', last_read_at: '2026-01-01T00:00:00Z' },
        ],
        conversations: [
          { id: 'c1', kind: 'direct', title: null, created_by: 'actor-1', last_message_at: '2026-01-03T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
        ],
        messages: [{ conversation_id: 'c1', sender_id: 'actor-1', body: 'my own reply', created_at: '2026-01-03T00:00:00Z' }],
      }) as any,
    )
    const inbox = await listInbox(actor)
    expect(inbox[0]).toMatchObject({ id: 'c1', hasUnread: false, lastMessage: 'my own reply' })
  })
})

describe('loadThread', () => {
  it('rejects a non-participant with PermissionError', async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeClient({ data: null, error: null }) as any)
    await expect(loadThread(actor, 'c1')).rejects.toBeInstanceOf(PermissionError)
  })

  it('throws NotFound when the actor participates but the conversation row is gone', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      multiTableClient({ conversation_participants: [{ id: 'p1', profile_id: 'actor-1' }], conversations: [] }) as any,
    )
    await expect(loadThread(actor, 'c1')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('returns messages and titles the direct thread with the other participant', async () => {
    vi.mocked(getProfileNamesByIds).mockResolvedValue(new Map([['actor-1', 'Me'], ['other', 'Bob']]))
    vi.mocked(createAdminClient).mockReturnValue(
      multiTableClient({
        conversation_participants: [
          { id: 'p1', profile_id: 'actor-1' },
          { id: 'p2', profile_id: 'other' },
        ],
        conversations: [
          { id: 'c1', kind: 'direct', title: null, created_by: 'actor-1', last_message_at: 't2', created_at: 't1' },
        ],
        // Returned newest-first by the desc query; loadThread reverses to ascending.
        messages: [
          { id: 'm2', conversation_id: 'c1', sender_id: 'actor-1', body: 'yo', created_at: 't2' },
          { id: 'm1', conversation_id: 'c1', sender_id: 'other', body: 'hi', created_at: 't1' },
        ],
      }) as any,
    )
    const thread = await loadThread(actor, 'c1')
    expect(thread.title).toBe('Bob')
    expect(thread.messages.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(thread.participants).toHaveLength(2)
    expect(thread.hasEarlier).toBe(false) // 2 messages < page size
    expect(thread.isLatestWindow).toBe(true)
  })

  it('windows to the most recent page and flags that older messages remain', async () => {
    vi.mocked(getProfileNamesByIds).mockResolvedValue(new Map([['other', 'Bob']]))
    vi.mocked(createAdminClient).mockReturnValue(
      multiTableClient({
        conversation_participants: [
          { id: 'p1', profile_id: 'actor-1' },
          { id: 'p2', profile_id: 'other' },
        ],
        conversations: [
          { id: 'c1', kind: 'direct', title: null, created_by: 'other', last_message_at: 't3', created_at: 't1' },
        ],
        // newest-first; with limit 2 the third (oldest) is the +1 sentinel -> older remain
        messages: [
          { id: 'm3', conversation_id: 'c1', sender_id: 'other', body: 'c', created_at: 't3' },
          { id: 'm2', conversation_id: 'c1', sender_id: 'other', body: 'b', created_at: 't2' },
          { id: 'm1', conversation_id: 'c1', sender_id: 'other', body: 'a', created_at: 't1' },
        ],
      }) as any,
    )
    const thread = await loadThread(actor, 'c1', { limit: 2 })
    expect(thread.hasEarlier).toBe(true)
    expect(thread.messages.map((m) => m.id)).toEqual(['m2', 'm3']) // recent 2, ascending
    expect(thread.earlierCursor).toBe('t2') // oldest shown -> the "load earlier" cursor
    expect(thread.isLatestWindow).toBe(true)
  })

  it('marks a cursor-paged (older) window as not the latest', async () => {
    vi.mocked(getProfileNamesByIds).mockResolvedValue(new Map([['other', 'Bob']]))
    vi.mocked(createAdminClient).mockReturnValue(
      multiTableClient({
        conversation_participants: [{ id: 'p1', profile_id: 'actor-1' }],
        conversations: [
          { id: 'c1', kind: 'direct', title: null, created_by: 'other', last_message_at: 't1', created_at: 't1' },
        ],
        messages: [{ id: 'm1', conversation_id: 'c1', sender_id: 'other', body: 'a', created_at: 't1' }],
      }) as any,
    )
    const thread = await loadThread(actor, 'c1', { before: 't5' })
    expect(thread.isLatestWindow).toBe(false)
  })

  it('auto-titles a group thread from the other participants when no title is set', async () => {
    vi.mocked(getProfileNamesByIds).mockResolvedValue(
      new Map([['actor-1', 'Me'], ['b', 'Bob'], ['c', 'Carol']]),
    )
    vi.mocked(createAdminClient).mockReturnValue(
      multiTableClient({
        conversation_participants: [
          { id: 'p1', profile_id: 'actor-1' },
          { id: 'p2', profile_id: 'b' },
          { id: 'p3', profile_id: 'c' },
        ],
        conversations: [
          { id: 'g1', kind: 'group', title: null, created_by: 'actor-1', last_message_at: 't', created_at: 't' },
        ],
        messages: [],
      }) as any,
    )
    const thread = await loadThread(actor, 'g1')
    expect(thread.title).toBe('Bob, Carol')
    expect(thread.participants).toHaveLength(3)
  })
})
