import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/services/authorization', () => ({ requireActorCapability: vi.fn() }))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { requireActorCapability } from '@/lib/services/authorization'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { issueDocRecord, listDocsPage, validateFinanceDocId, voidDoc } from '@/lib/services/finance/finance-docs'
import { PermissionError, ValidationError } from '@/lib/errors'

const receiptRow = {
  id: 'r-1',
  number: 'CEA-R-2026-0001',
  student_id: 'stud-1',
  student_name_snapshot: 'Sara Student',
  class_snapshot: 'Grade 10',
  issue_date: '2026-06-01',
  currency: 'INR',
  note: null,
  subtotal: 5000,
  discount: null,
  total: 5000,
  voided: false,
  created_by: 'admin-1',
  created_at: 't',
}

beforeEach(() => vi.resetAllMocks())

describe('listDocsPage', () => {
  it('requests the correct range and maps rows through toDoc', async () => {
    const client = makeClient({ data: [receiptRow], error: null, count: 45 })
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    const result = await listDocsPage('receipt', { page: 2, pageSize: 20 })
    const builder = client.from.mock.results[0].value
    expect(builder.range).toHaveBeenCalledWith(20, 39)
    expect(result.total).toBe(45)
    expect(result.items[0]).toMatchObject({ id: 'r-1', number: 'CEA-R-2026-0001', party_name: 'Sara Student' })
  })

  it('filters by voided status when given', async () => {
    const client = makeClient({ data: [], error: null, count: 0 })
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    await listDocsPage('receipt', { page: 1, pageSize: 20, status: 'voided' })
    const builder = client.from.mock.results[0].value
    expect(builder.eq).toHaveBeenCalledWith('voided', true)
  })

  it('filters by active status when given', async () => {
    const client = makeClient({ data: [], error: null, count: 0 })
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    await listDocsPage('payslip', { page: 1, pageSize: 20, status: 'active' })
    const builder = client.from.mock.results[0].value
    expect(builder.eq).toHaveBeenCalledWith('voided', false)
  })

  it('searches document number OR the kind-specific name-snapshot column', async () => {
    const client = makeClient({ data: [], error: null, count: 0 })
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    await listDocsPage('payslip', { page: 1, pageSize: 20, search: 'tarun' })
    const builder = client.from.mock.results[0].value
    expect(builder.or).toHaveBeenCalledWith('number.ilike.%tarun%,tutor_name_snapshot.ilike.%tarun%')
  })

  it('ignores a blank search', async () => {
    const client = makeClient({ data: [], error: null, count: 0 })
    vi.mocked(createAdminClient).mockReturnValueOnce(client as any)
    await listDocsPage('receipt', { page: 1, pageSize: 20, search: '  ' })
    const builder = client.from.mock.results[0].value
    expect(builder.or).not.toHaveBeenCalled()
  })
})

describe('validateFinanceDocId', () => {
  it('accepts a UUID finance document id', () => {
    expect(validateFinanceDocId('550e8400-e29b-41d4-a716-446655440000')).toBe('550e8400-e29b-41d4-a716-446655440000')
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
    const result = await issueDocRecord('admin-1', 'receipt', {
      prefix: 'CEA-R',
      billing_period: null,
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
      issueDocRecord('admin-1', 'payslip', {
        prefix: 'CEA-P',
        billing_period: null,
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

describe('finance mutations enforce their own permission check', () => {
  // Issuing and voiding enforce their own capability check, so a caller that
  // forgets to gate first is denied rather than silently writing to the
  // financial record.
  it('issueDocRecord refuses without the capability, and never reaches the RPC', async () => {
    vi.mocked(requireActorCapability).mockRejectedValueOnce(new PermissionError('nope'))
    await expect(
      issueDocRecord('not-an-admin', 'receipt', {
        prefix: 'CEA-R',
        billing_period: null,
        party_id: 'stud-1',
        party_name: 'Sara Student',
        class_level: null,
        issue_date: '2026-06-01',
        currency: 'INR',
        note: null,
        subtotal: 100,
        discount: null,
        total: 100,
        created_by: 'not-an-admin',
        lines: [],
      }),
    ).rejects.toBeInstanceOf(PermissionError)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('voidDoc refuses without the capability, and never reaches the update', async () => {
    vi.mocked(requireActorCapability).mockRejectedValueOnce(new PermissionError('nope'))
    await expect(voidDoc('not-an-admin', 'receipt', 'r-1')).rejects.toBeInstanceOf(PermissionError)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('voidDoc gates on the hard admin-tier capability, not a role string', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: [{ id: 'r-1' }], error: null }) as any)
    await expect(voidDoc('admin-1', 'receipt', 'r-1')).resolves.toBe(true)
    expect(requireActorCapability).toHaveBeenCalledWith('admin-1', 'manageAdminTier', expect.any(String))
  })
})

/**
 * Issuing and voiding a financial document are recorded in the audit log.
 *
 * This surface is the system of record for receipts and pay slips, and every other
 * privileged write in the app is audited - down to a document DOWNLOAD and a pastoral-note
 * VIEW. Minting or voiding money documents being the exception would leave the one question
 * an auditor actually asks - who issued this, and who cancelled it - answerable only from
 * the row itself, which a void leaves looking the same either way.
 */
describe('finance documents are audited', () => {
  const issueInput = {
    prefix: 'CEA-R',
    billing_period: null,
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
    lines: [],
  } as never

  it('records the ISSUE with the number and party, not just the row id', async () => {
    // The number and party are what identify the document to a human. Reading them back
    // off the row later is not equivalent: the row can be voided, superseded or reissued.
    vi.mocked(createAdminClient).mockReturnValueOnce({
      rpc: vi.fn(async () => ({ data: receiptRow, error: null })),
    } as never)
    await issueDocRecord('admin-1', 'receipt', issueInput)
    expect(auditPrivilegedAction).toHaveBeenCalledWith(
      { id: 'admin-1' },
      'receipt.issue',
      'receipt',
      'r-1',
      expect.objectContaining({ number: 'CEA-R-2026-0001', party_id: 'stud-1' }),
    )
  })

  it('records the VOID', async () => {
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: [{ id: 'r-1' }], error: null }) as never)
    await voidDoc('admin-1', 'receipt', 'r-1')
    expect(auditPrivilegedAction).toHaveBeenCalledWith({ id: 'admin-1' }, 'receipt.void', 'receipt', 'r-1')
  })

  it('does NOT record a void that voided nothing', async () => {
    // updateDocVoided returns false for an unknown id or one already void. Auditing those
    // would fill the trail with cancellations that never happened.
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: [], error: null }) as never)
    await expect(voidDoc('admin-1', 'receipt', 'missing')).resolves.toBe(false)
    expect(auditPrivilegedAction).not.toHaveBeenCalled()
  })

  it('audits nothing when the capability check refuses', async () => {
    vi.mocked(requireActorCapability).mockRejectedValueOnce(new PermissionError('nope'))
    await expect(voidDoc('not-an-admin', 'receipt', 'r-1')).rejects.toBeInstanceOf(PermissionError)
    expect(auditPrivilegedAction).not.toHaveBeenCalled()
  })
})
