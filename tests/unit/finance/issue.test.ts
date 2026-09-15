import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/users', () => ({ getProfileById: vi.fn() }))
vi.mock('@/lib/services/finance/org-settings', () => ({ getOrgSettings: vi.fn(), getInstituteTimeZone: vi.fn() }))
vi.mock('@/lib/services/finance/finance-docs', () => ({ issueDocRecord: vi.fn() }))
vi.mock('@/lib/services/finance/fx-conversion', () => ({ convertIssuedDoc: vi.fn() }))
vi.mock('@/lib/services/finance/hours-billing', () => ({ buildBillingDraft: vi.fn() }))
vi.mock('@/lib/data/audit', () => ({ writeAudit: vi.fn() }))
vi.mock('@/lib/data/finance-docs-reads', () => ({ callBillingSourceFingerprint: vi.fn() }))

import { getProfileById } from '@/lib/services/users'
import { getInstituteTimeZone, getOrgSettings } from '@/lib/services/finance/org-settings'
import { issueDocRecord } from '@/lib/services/finance/finance-docs'
import { convertIssuedDoc } from '@/lib/services/finance/fx-conversion'
import { buildBillingDraft } from '@/lib/services/finance/hours-billing'
import { writeAudit } from '@/lib/data/audit'
import { callBillingSourceFingerprint } from '@/lib/data/finance-docs-reads'
import { issueDocFromApiInput } from '@/lib/finance/issue'

const validInput = {
  party_id: '550e8400-e29b-41d4-a716-446655440000',
  issue_date: '2026-06-20T00:00:00.000Z',
  currency: 'INR',
  lines: [{ subject: 'Tuition', hours: 2, rate: 500 }],
}

const activeStudent = {
  id: validInput.party_id,
  role: 'student',
  status: 'active',
  full_name: 'Sara',
  class_level: 'Grade 10',
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getOrgSettings).mockResolvedValue({ receipt_prefix: 'CEA-R', payslip_prefix: 'CEA-P' } as any)
  vi.mocked(getInstituteTimeZone).mockResolvedValue('Asia/Kolkata')
  vi.mocked(issueDocRecord).mockResolvedValue({ id: 'doc1', number: 'CEA-R-1' } as any)
  vi.mocked(convertIssuedDoc).mockResolvedValue(undefined as any)
  vi.mocked(writeAudit).mockResolvedValue(undefined as any)
  vi.mocked(callBillingSourceFingerprint).mockResolvedValue('fp-1')
})

describe('finance issue', () => {
  it('rejects invalid input with a ValidationError (400, not a 5xx)', async () => {
    await expect(issueDocFromApiInput('receipt', {}, 'admin-1')).rejects.toThrow(/invalid input/)
  })

  it('rejects issuing to a missing / inactive / wrong-role party', async () => {
    vi.mocked(getProfileById).mockResolvedValueOnce(null as any)
    await expect(issueDocFromApiInput('receipt', validInput, 'admin-1')).rejects.toThrow(/active student/)
    // A payslip issued to a student (wrong role) is rejected too.
    vi.mocked(getProfileById).mockResolvedValueOnce(activeStudent as any)
    await expect(issueDocFromApiInput('payslip', validInput, 'admin-1')).rejects.toThrow(/active payee/)
  })

  it('issues an active receipt through issueDocRecord, which records it', async () => {
    vi.mocked(getProfileById).mockResolvedValueOnce(activeStudent as any)
    const out = await issueDocFromApiInput('receipt', validInput, 'admin-1')
    expect(out).toEqual({ id: 'doc1', number: 'CEA-R-1' })
    expect(issueDocRecord).toHaveBeenCalledWith(
      'admin-1',
      'receipt',
      expect.objectContaining({ party_id: activeStudent.id, prefix: 'CEA-R', class_level: 'Grade 10' }),
    )
    // issueDocRecord writes the one `receipt.issue` audit, with the number and party; a second,
    // thinner row from here would record every issuance twice.
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('snapshots no class level on a pay slip', async () => {
    vi.mocked(getProfileById).mockResolvedValueOnce({ ...activeStudent, role: 'tutor' } as any)
    await issueDocFromApiInput('payslip', validInput, 'admin-1')
    expect(issueDocRecord).toHaveBeenCalledWith(
      'admin-1',
      'payslip',
      expect.objectContaining({ prefix: 'CEA-P', class_level: null }),
    )
  })

  it('still reports success when the best-effort fx conversion fails (doc already committed)', async () => {
    vi.mocked(getProfileById).mockResolvedValueOnce(activeStudent as any)
    vi.mocked(convertIssuedDoc).mockRejectedValueOnce(new Error('no rate'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(issueDocFromApiInput('receipt', validInput, 'admin-1')).resolves.toEqual({
      id: 'doc1',
      number: 'CEA-R-1',
    })
  })
})

/**
 * The hours a billing-period document bills are checked inside the issue function (0110): the
 * service hands over a fingerprint of the recorded hours, and the function refuses if they moved.
 * What these pin is the part only the service can get right - WHEN the fingerprint is taken.
 */
describe('finance issue - the billing source travels with a billing-period document', () => {
  const period = { ...validInput, billing_period: '2026-06', lines: [{ subject: 'Maths', hours: 2, rate: 500 }] }
  const draft = {
    blocked: null,
    currency: 'INR',
    lines: [{ subject: 'Maths', hours: 2, rate: 500, amount: 1000 }],
  }

  it('reads the fingerprint BEFORE building the draft, so a racing edit can only cause a refusal', async () => {
    vi.mocked(getProfileById).mockResolvedValue(activeStudent as never)
    const order: string[] = []
    vi.mocked(callBillingSourceFingerprint).mockImplementation(async () => {
      order.push('fingerprint')
      return 'fp-june'
    })
    vi.mocked(buildBillingDraft).mockImplementation(async () => {
      order.push('draft')
      return draft as never
    })

    await issueDocFromApiInput('receipt', period, 'admin-1')

    expect(order).toEqual(['fingerprint', 'draft'])
  })

  it('fingerprints the month in the INSTITUTE time zone, and passes it with its window to the write', async () => {
    vi.mocked(getProfileById).mockResolvedValue(activeStudent as never)
    vi.mocked(buildBillingDraft).mockResolvedValue(draft as never)

    await issueDocFromApiInput('receipt', period, 'admin-1')

    // June in Asia/Kolkata starts at 18:30 UTC on 31 May.
    expect(callBillingSourceFingerprint).toHaveBeenCalledWith(
      'receipt',
      activeStudent.id,
      '2026-05-31T18:30:00.000Z',
      '2026-06-30T18:30:00.000Z',
    )
    expect(issueDocRecord).toHaveBeenCalledWith(
      'admin-1',
      'receipt',
      expect.objectContaining({
        billing_period: '2026-06',
        billing_source: { fingerprint: 'fp-1', from: '2026-05-31T18:30:00.000Z', to: '2026-06-30T18:30:00.000Z' },
      }),
    )
  })

  it('sends no billing source for a document that bills no particular month', async () => {
    vi.mocked(getProfileById).mockResolvedValue(activeStudent as never)
    await issueDocFromApiInput('receipt', validInput, 'admin-1')
    expect(callBillingSourceFingerprint).not.toHaveBeenCalled()
    expect(issueDocRecord).toHaveBeenCalledWith(
      'admin-1',
      'receipt',
      expect.objectContaining({ billing_period: null, billing_source: null }),
    )
  })
})
