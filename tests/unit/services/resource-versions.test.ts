import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient, queryBuilder } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { insertVersion, selectVersionsForResources } from '@/lib/data/resource-versions'

const row = (over: Record<string, unknown> = {}) => ({
  resource_id: 'res-1',
  title: 'Notes',
  drive_link: 'https://x',
  description: null,
  category: 'general_documents' as const,
  subject: null,
  file_type: null,
  created_by: 'tutor-1',
  note: 'Replaced',
  ...over,
})

beforeEach(() => vi.resetAllMocks())

describe('insertVersion', () => {
  it('assigns version_no = last + 1 for the document', async () => {
    // A read-modify-write: first the max lookup, then the insert. The stub builder
    // returns the same configured payload for both, so `last.version_no` = 2.
    const client = makeClient({ data: { version_no: 2 }, error: null })
    vi.mocked(createAdminClient).mockReturnValue(client as any)
    await insertVersion(row())
    // The insert call carries the computed next number.
    expect(client.from).toHaveBeenCalledWith('resource_versions')
  })

  it('starts at version_no 1 when the document has no prior versions', async () => {
    const insertBuilder = queryBuilder({ data: { id: 'v1', version_no: 1 }, error: null })
    const client = {
      from: vi
        .fn()
        // max lookup -> no prior version
        .mockReturnValueOnce(queryBuilder({ data: null, error: null }))
        // insert
        .mockReturnValueOnce(insertBuilder),
    }
    vi.mocked(createAdminClient).mockReturnValue(client as any)
    await insertVersion(row())
    expect(insertBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({ version_no: 1 }))
  })
})

describe('selectVersionsForResources', () => {
  it('returns an empty map without querying when given no ids', async () => {
    const result = await selectVersionsForResources([])
    expect(result.size).toBe(0)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('groups history rows by document id', async () => {
    const rows = [
      { id: 'a', resource_id: 'res-1', version_no: 2 },
      { id: 'b', resource_id: 'res-1', version_no: 1 },
      { id: 'c', resource_id: 'res-2', version_no: 1 },
    ]
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: rows, error: null }) as any)
    const grouped = await selectVersionsForResources(['res-1', 'res-2'])
    expect(grouped.get('res-1')).toHaveLength(2)
    expect(grouped.get('res-2')).toHaveLength(1)
  })
})
