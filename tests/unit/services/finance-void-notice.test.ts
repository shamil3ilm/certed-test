import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/authorization', () => ({ requireActorCapability: vi.fn() }))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))
vi.mock('@/lib/services/notifications', () => ({ notifyBestEffort: vi.fn() }))
vi.mock('@/lib/observability/log', () => ({ logError: vi.fn() }))
vi.mock('@/lib/data/finance-docs', () => ({
  updateDocVoided: vi.fn(),
  selectDocById: vi.fn(),
  callFinanceTotalsBase: vi.fn(),
  callIssueDoc: vi.fn(),
  selectAllDocs: vi.fn(),
  selectDocLines: vi.fn(),
  selectDocPage: vi.fn(),
  selectDocPageForParty: vi.fn(),
  selectPartyDocTotals: vi.fn(),
  selectRecentDocs: vi.fn(),
}))

import { updateDocVoided, selectDocById } from '@/lib/data/finance-docs'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { notifyBestEffort } from '@/lib/services/notifications'
import { logError } from '@/lib/observability/log'
import { voidDoc } from '@/lib/services/finance/finance-docs'

const receipt = {
  id: 'doc-1',
  number: 'RCPT-0007',
  party_id: 'stud-1',
  currency: 'INR',
  total: 1500,
} as never

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(updateDocVoided).mockResolvedValue(true)
  vi.mocked(selectDocById).mockResolvedValue(receipt)
})

/**
 * Issuance tells the party. A correction is void + reissue, so without this they hear about the
 * replacement and never about what it replaced - and a void that simply cancels says nothing at all.
 */
describe('voidDoc', () => {
  it('tells the party their receipt no longer stands', async () => {
    await expect(voidDoc('admin-1', 'receipt', 'doc-1')).resolves.toBe(true)

    expect(notifyBestEffort).toHaveBeenCalledWith(['stud-1'], {
      kind: 'finance',
      title: 'Receipt RCPT-0007 was voided',
      body: 'It no longer stands. INR 1500',
      link: '/receipts',
    })
  })

  it('names a pay slip as a pay slip, and links to where the payee reads theirs', async () => {
    vi.mocked(selectDocById).mockResolvedValue({ ...(receipt as object), number: 'PAY-0003' } as never)

    await voidDoc('admin-1', 'payslip', 'doc-1')

    expect(notifyBestEffort).toHaveBeenCalledWith(
      ['stud-1'],
      expect.objectContaining({ title: 'Pay slip PAY-0003 was voided', link: '/payslips' }),
    )
  })

  it('says nothing when nothing was voided - an unknown or already-void id is not an event', async () => {
    vi.mocked(updateDocVoided).mockResolvedValue(false)

    await expect(voidDoc('admin-1', 'receipt', 'doc-1')).resolves.toBe(false)

    expect(auditPrivilegedAction).not.toHaveBeenCalled()
    expect(notifyBestEffort).not.toHaveBeenCalled()
  })

  it('has nobody to tell when the document has no party', async () => {
    vi.mocked(selectDocById).mockResolvedValue({ ...(receipt as object), party_id: null } as never)

    await expect(voidDoc('admin-1', 'receipt', 'doc-1')).resolves.toBe(true)

    expect(notifyBestEffort).not.toHaveBeenCalled()
  })

  it('stays voided when the notice cannot be composed - the void is committed and audited first', async () => {
    vi.mocked(selectDocById).mockRejectedValue(new Error('db down'))

    await expect(voidDoc('admin-1', 'receipt', 'doc-1')).resolves.toBe(true)

    expect(auditPrivilegedAction).toHaveBeenCalled()
    expect(logError).toHaveBeenCalled()
  })
})
