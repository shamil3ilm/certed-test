import { describe, it, expect, vi, beforeEach } from 'vitest'
import { queryBuilder } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { issueDocRecord, listDocsPage, validateFinanceDocId } from '@/lib/services/finance/finance-docs'
import { ValidationError } from '@/lib/errors'

const receiptRow = {
  id: 'r-1', number: 'CEA-R-2026-0001', student_id: 'stud-1', student_name_snapshot: 'Sara Student',
  class_snapshot: 'Grade 10', issue_date: '2026-06-01', currency: 'INR', note: null,
  subtotal: 5000, discount: null, total: 5000, voided: false, created_by: 'admin-1', created_at: 't',
}

beforeEach(() => vi.resetAllMocks())

describe('listDocsPage', () => {
  it('requests the correct range and maps rows through toDoc', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [receiptRow], error: null, count: 45 })) }
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    const result = await listDocsPage('receipt', { page: 2, pageSize: 20 })
    const builder = client.from.mock.results[0].value
    expect(builder.range).toHaveBeenCalledWith(20, 39)
    expect(result.total).toBe(45)
    expect(result.items[0]).toMatchObject({ id: 'r-1', number: 'CEA-R-2026-0001', party_name: 'Sara Student' })
  })

  it('filters by voided status when given', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 0 })) }
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    await listDocsPage('receipt', { page: 1, pageSize: 20, status: 'voided' })
    const builder = client.from.mock.results[0].value
    expect(builder.eq).toHaveBeenCalledWith('voided', true)
  })

  it('filters by active status when given', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 0 })) }
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    await listDocsPage('payslip', { page: 1, pageSize: 20, status: 'active' })
    const builder = client.from.mock.results[0].value
    expect(builder.eq).toHaveBeenCalledWith('voided', false)
  })

  it('searches document number OR the kind-specific name-snapshot column', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 0 })) }
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    await listDocsPage('payslip', { page: 1, pageSize: 20, search: 'tarun' })
    const builder = client.from.mock.results[0].value
    expect(builder.or).toHaveBeenCalledWith('number.ilike.%tarun%,tutor_name_snapshot.ilike.%tarun%')
  })

  it('ignores a blank search', async () => {
    const client = { from: vi.fn(() => queryBuilder({ data: [], error: null, count: 0 })) }
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    await listDocsPage('receipt', { page: 1, pageSize: 20, search: '  ' })
    const builder = client.from.mock.results[0].value
    expect(builder.or).not.toHaveBeenCalled()
  })
})

describe('validateFinanceDocId', () => {
  it('accepts a UUID finance document id', () => {
    expect(validateFinanceDocId('550e8400-e29b-41d4-a716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    )
  })

  it('rejects an invalid finance document id with a typed validation error', () => {
    expect(() => validateFinanceDocId('bad')).toThrow(ValidationError)
  })
})

describe('issueDocRecord', () => {
  it('issues a receipt through the atomic RPC and maps the returned row', async () => {
    const admin = {
      rpc: vi.fn(async () => ({ data: receiptRow, error: null })),
    }
    vi.mocked(createAdminClient).mockReturnValueOnce(admin as any)
    const result = await issueDocRecord('receipt', {
      prefix: 'CEA-R',
      party_id: 'stud-1',
      party_name: 'Sara Student',
      class_level: 'Grade 10',
      issue_date: '2026-06-01',
      currency: 'INR',
      note: null,
      subtotal: 5000,
      discount: null,
      total: 5000,
      created_by: 'admin-1',
      lines: [{ label: 'Math', hours: 10, rate: 500, amount: 5000 }],
    })
    expect(admin.rpc).toHaveBeenCalledWith(
      'issue_receipt_doc',
      expect.objectContaining({
        p_prefix: 'CEA-R',
        p_party_id: 'stud-1',
        p_lines: [{ label: 'Math', hours: 10, rate: 500, amount: 5000 }],
      }),
    )
    expect(result).toMatchObject({ id: 'r-1', number: 'CEA-R-2026-0001', party_name: 'Sara Student' })
  })

  it('surfaces atomic issue RPC failures with the finance issue error prefix', async () => {
    const admin = {
      rpc: vi.fn(async () => ({ data: null, error: { message: 'write failed' } })),
    }
    vi.mocked(createAdminClient).mockReturnValueOnce(admin as any)
    await expect(
      issueDocRecord('payslip', {
        prefix: 'CEA-P',
        party_id: 'teach-1',
        party_name: 'Tarun Tutor',
        class_level: null,
        issue_date: '2026-06-01',
        currency: 'INR',
        note: null,
        subtotal: 2000,
        discount: null,
        total: 2000,
        created_by: 'admin-1',
        lines: [{ label: 'Coaching', hours: 4, rate: 500, amount: 2000 }],
      }),
    ).rejects.toThrow('payslip.issue: write failed')
  })
})
