import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfilesByIds: vi.fn() }))
vi.mock('@/lib/security/rate-limit', () => ({ rateLimit: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { getProfilesByIds } from '@/lib/services/users'
import { rateLimit } from '@/lib/security/rate-limit'
import {
  createCommentFromActionInput,
  listCommentsForEntities,
  validateCreateCommentInput,
} from '@/lib/services/comments'
import { ValidationError, RateLimitError } from '@/lib/errors'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(rateLimit).mockReturnValue({ ok: true, remaining: 99, retryAfterSec: 0 })
})

describe('createCommentFromActionInput rate limiting', () => {
  it('throttles a burst of comments with RateLimitError before any DB call', async () => {
    vi.mocked(rateLimit).mockReturnValueOnce({ ok: false, remaining: 0, retryAfterSec: 5 })
    await expect(
      createCommentFromActionInput('user-1', { entity_type: 'resource', entity_id: 'r1', content: 'spam' }),
    ).rejects.toBeInstanceOf(RateLimitError)
    expect(createClient).not.toHaveBeenCalled()
  })
})

describe('validateCreateCommentInput', () => {
  it('trims content and returns the parsed action payload', () => {
    expect(
      validateCreateCommentInput({
        entity_type: 'resource',
        entity_id: '550e8400-e29b-41d4-a716-446655440000',
        content: ' Helpful note ',
      }),
    ).toEqual({
      entity_type: 'resource',
      entity_id: '550e8400-e29b-41d4-a716-446655440000',
      content: 'Helpful note',
    })
  })

  it('throws a typed validation error for invalid comment input', () => {
    expect(() =>
      validateCreateCommentInput({
        entity_type: 'bad',
        entity_id: 'oops',
        content: '',
      }),
    ).toThrow(ValidationError)
  })
})

describe('createCommentFromActionInput', () => {
  it('creates a comment from the validated action payload', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      makeClient({
        data: {
          id: 'comment-1',
          entity_type: 'resource',
          entity_id: '550e8400-e29b-41d4-a716-446655440000',
          author_id: 'user-1',
          content: 'Helpful note',
          created_at: '2026-07-16T00:00:00.000Z',
        },
        error: null,
      }) as any,
    )
    const created = await createCommentFromActionInput('user-1', {
      entity_type: 'resource',
      entity_id: '550e8400-e29b-41d4-a716-446655440000',
      content: ' Helpful note ',
    })
    expect(created.content).toBe('Helpful note')
  })
})

describe('listCommentsForEntities', () => {
  it('groups comments by entity and hydrates author metadata once', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      makeClient({
        data: [
          {
            id: 'comment-1',
            entity_type: 'resource',
            entity_id: 'res-1',
            author_id: 'user-1',
            content: 'One',
            created_at: '2026-07-16T00:00:00.000Z',
          },
        ],
        error: null,
      }) as any,
    )
    vi.mocked(getProfilesByIds).mockResolvedValueOnce(
      new Map([['user-1', { email: 'user@example.com', full_name: 'User Name', role: 'student' } as any]]),
    )

    const grouped = await listCommentsForEntities('resource', ['res-1', 'res-2'])

    expect(grouped.get('res-1')?.[0]).toMatchObject({
      author_name: 'User Name',
      author_role: 'student',
    })
    expect(grouped.get('res-2')).toEqual([])
  })
})
