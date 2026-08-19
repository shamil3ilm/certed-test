import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  selectAllTags,
  insertTag,
  insertEntityTag,
  deleteEntityTag,
  selectTagsForEntity,
  selectTagsForEntities,
  selectEntityIdsForTag,
} from '@/lib/data/tags'

const tag = { id: 't1', name: 'Urgent', color: '#f00' }

beforeEach(() => vi.resetAllMocks())

describe('tags data layer', () => {
  it('selectAllTags returns the vocabulary (RLS client) and throws on error', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: [tag], error: null }) as any)
    expect(await selectAllTags()).toEqual([tag])
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: { message: 'x' } }) as any)
    await expect(selectAllTags()).rejects.toThrow(/tags.all: x/)
  })

  it('insertTag returns the created tag and throws on error', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: tag, error: null }) as any)
    expect(await insertTag({ name: 'Urgent', color: '#f00', created_by: 'a' })).toEqual(tag)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(insertTag({ name: 'x', color: null, created_by: 'a' })).rejects.toThrow(/tags.insert: e/)
  })

  it('insertEntityTag upserts idempotently and throws on error', async () => {
    const client = makeClient({ data: null, error: null })
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    await insertEntityTag({ tag_id: 't1', entity_type: 'submission', entity_id: 'e1', created_by: 'a' })
    const builder = client.from.mock.results[0].value
    expect(client.from).toHaveBeenCalledWith('entity_tags')
    expect(builder.upsert).toHaveBeenCalledWith(expect.any(Object), {
      onConflict: 'tag_id,entity_type,entity_id',
      ignoreDuplicates: true,
    })
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(insertEntityTag({ tag_id: 't', entity_type: 's', entity_id: 'e', created_by: 'a' })).rejects.toThrow(
      /tags.attach: e/,
    )
  })

  it('deleteEntityTag resolves on success and throws on error', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    await expect(deleteEntityTag('t1', 'submission', 'e1')).resolves.toBeUndefined()
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(deleteEntityTag('t1', 'submission', 'e1')).rejects.toThrow(/tags.detach: e/)
  })

  it('selectTagsForEntity normalises a to-one embed (object OR array) and throws on error', async () => {
    // Embed returns an object at runtime even though the type is an array.
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: [{ tags: tag }], error: null }) as any)
    expect(await selectTagsForEntity('submission', 'e1')).toEqual([tag])
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: [{ tags: [tag] }], error: null }) as any)
    expect(await selectTagsForEntity('submission', 'e1')).toEqual([tag])
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(selectTagsForEntity('submission', 'e1')).rejects.toThrow(/tags.forEntity: e/)
  })

  it('selectTagsForEntities short-circuits on [] and otherwise groups by entity id', async () => {
    expect((await selectTagsForEntities('submission', [])).size).toBe(0)
    expect(createAdminClient).not.toHaveBeenCalled()

    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({
        data: [
          { entity_id: 'e1', tags: tag },
          { entity_id: 'e1', tags: { id: 't2', name: 'Late', color: null } },
          { entity_id: 'e2', tags: null },
        ],
        error: null,
      }) as any,
    )
    const map = await selectTagsForEntities('submission', ['e1', 'e2'])
    expect(map.get('e1')).toHaveLength(2)
    expect(map.has('e2')).toBe(false) // null tags contribute nothing
  })

  it('selectEntityIdsForTag maps to a flat id list and throws on error', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(
      makeClient({ data: [{ entity_id: 'e1' }, { entity_id: 'e2' }], error: null }) as any,
    )
    expect(await selectEntityIdsForTag('submission', 't1')).toEqual(['e1', 'e2'])
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: { message: 'e' } }) as any)
    await expect(selectEntityIdsForTag('submission', 't1')).rejects.toThrow(/tags.entityIds: e/)
  })
})
