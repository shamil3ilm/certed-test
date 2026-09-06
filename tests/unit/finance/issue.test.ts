import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/users', () => ({ getProfileById: vi.fn() }))
vi.mock('@/lib/services/finance/org-settings', () => ({ getOrgSettings: vi.fn() }))
vi.mock('@/lib/services/finance/finance-docs', () => ({ issueDocRecord: vi.fn() }))
vi.mock('@/lib/services/finance/fx-conversion', () => ({ convertIssuedDoc: vi.fn() }))
vi.mock('@/lib/data/audit', () => ({ writeAudit: vi.fn() }))
vi.mock('@/lib/data/finance-docs-reads', () => ({ selectRecentLiveDuplicate: vi.fn() }))

import { getProfileById } from '@/lib/services/users'
import { getOrgSettings } from '@/lib/services/finance/org-settings'
import { issueDocRecord } from '@/lib/services/finance/finance-docs'
import { convertIssuedDoc } from '@/lib/services/finance/fx-conversion'
import { writeAudit } from '@/lib/data/audit'
import { selectRecentLiveDuplicate } from '@/lib/data/finance-docs-reads'
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
  // Default: no near-identical document was just issued. The refusal is asserted below.
  vi.mocked(selectRecentLiveDuplicate).mockResolvedValue(null)
  vi.mocked(getOrgSettings).mockResolvedValue({ receipt_prefix: 'CEA-R', payslip_prefix: 'CEA-P' } as any)
  vi.mocked(issueDocRecord).mockResolvedValue({ id: 'doc1', number: 'CEA-R-1' } as any)
  vi.mocked(convertIssuedDoc).mockResolvedValue(undefined as any)
  vi.mocked(writeAudit).mockResolvedValue(undefined as any)
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

  it('issues an active receipt: records the doc and audits it', async () => {
    vi.mocked(getProfileById).mockResolvedValueOnce(activeStudent as any)
    const out = await issueDocFromApiInput('receipt', validInput, 'admin-1')
    expect(out).toEqual({ id: 'doc1', number: 'CEA-R-1' })
    expect(issueDocRecord).toHaveBeenCalledWith(
      'admin-1',
      'receipt',
      expect.objectContaining({ party_id: activeStudent.id, prefix: 'CEA-R', class_level: 'Grade 10' }),
    )
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'receipt.issue', entity_id: 'doc1' }))
  })

  it('still reports success when the best-effort audit / fx conversion fail (doc already committed)', async () => {
    vi.mocked(getProfileById).mockResolvedValueOnce(activeStudent as any)
    vi.mocked(writeAudit).mockRejectedValueOnce(new Error('audit down'))
    vi.mocked(convertIssuedDoc).mockRejectedValueOnce(new Error('no rate'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(issueDocFromApiInput('receipt', validInput, 'admin-1')).resolves.toEqual({
      id: 'doc1',
      number: 'CEA-R-1',
    })
  })
})

describe('finance issue - double-submit guard on the hand-typed path', () => {
  it('refuses an identical live document issued moments ago, naming it', async () => {
    // 0100's unique indexes are PARTIAL on `billing_period is not null`, so a document
    // that bills no particular month - the default the issue form sends - has no database
    // constraint behind it. On a void-and-reissue-only model a double submit is expensive.
    vi.mocked(getProfileById).mockResolvedValue(activeStudent as never)
    vi.mocked(getOrgSettings).mockResolvedValue({ receipt_prefix: 'CEA-R', payslip_prefix: 'CEA-P' } as never)
    vi.mocked(selectRecentLiveDuplicate).mockResolvedValue({ number: 'CEA-R-2026-0007' })

    await expect(issueDocFromApiInput('receipt', validInput, 'admin-1')).rejects.toThrow(/CEA-R-2026-0007/)
    expect(issueDocRecord).not.toHaveBeenCalled()
  })

  it('does NOT apply the window when a billing period is given - the DB index owns that case', async () => {
    vi.mocked(getProfileById).mockResolvedValue(activeStudent as never)
    vi.mocked(getOrgSettings).mockResolvedValue({ receipt_prefix: 'CEA-R', payslip_prefix: 'CEA-P' } as never)
    vi.mocked(issueDocRecord).mockResolvedValue({ id: 'doc-1', number: 'CEA-R-2026-0008' } as never)

    await issueDocFromApiInput('receipt', { ...validInput, billing_period: '2026-06' }, 'admin-1').catch(() => null)
    expect(selectRecentLiveDuplicate).not.toHaveBeenCalled()
  })
})
