import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/authorization', () => ({ requireActorCapability: vi.fn() }))
vi.mock('@/lib/data/billing-rates', () => ({ selectAllBillingRates: vi.fn(), upsertBillingRate: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ listActiveByRole: vi.fn(), listActiveMentorCandidates: vi.fn() }))
vi.mock('@/lib/services/finance/org-settings', () => ({ getOrgSettings: vi.fn() }))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))

import { requireActorCapability } from '@/lib/services/authorization'
import { selectAllBillingRates, upsertBillingRate } from '@/lib/data/billing-rates'
import { listActiveByRole, listActiveMentorCandidates } from '@/lib/services/users'
import { getOrgSettings } from '@/lib/services/finance/org-settings'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { loadBillingRatesPageData, setBillingRate } from '@/lib/services/finance/billing-rates-admin'

/**
 * An hourly rate decides what every FUTURE receipt and pay slip charges, and the page read
 * returns the full roster of active students and payees. Both re-check the capability in
 * the SERVICE rather than resting on the action and the page each remembering to - these
 * assert that, and the one-sided write that a blind upsert would get wrong.
 */

const ACTOR = 'admin-1'
// profile_id is validated as a uuid, so the fixture has to be one.
const PROFILE = '550e8400-e29b-41d4-a716-446655440000'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getOrgSettings).mockResolvedValue({ base_currency: 'INR' } as never)
  vi.mocked(listActiveByRole).mockResolvedValue([] as never)
  vi.mocked(listActiveMentorCandidates).mockResolvedValue([] as never)
  vi.mocked(selectAllBillingRates).mockResolvedValue([] as never)
})

describe('billing rates are admin-tier in the service, not only at the edge', () => {
  it('the page read is refused without manageAdminTier, before it reads the roster', async () => {
    vi.mocked(requireActorCapability).mockRejectedValueOnce(new Error('denied'))
    await expect(loadBillingRatesPageData(ACTOR)).rejects.toThrow('denied')
    expect(listActiveByRole).not.toHaveBeenCalled()
    expect(selectAllBillingRates).not.toHaveBeenCalled()
  })

  it('the write is refused without manageAdminTier, before it touches the table', async () => {
    vi.mocked(requireActorCapability).mockRejectedValueOnce(new Error('denied'))
    await expect(
      setBillingRate(ACTOR, { profile_id: PROFILE, side: 'fee', rate: 600, currency: 'INR' }),
    ).rejects.toThrow('denied')
    expect(upsertBillingRate).not.toHaveBeenCalled()
    expect(auditPrivilegedAction).not.toHaveBeenCalled()
  })

  it('both check the same capability', async () => {
    await loadBillingRatesPageData(ACTOR)
    await setBillingRate(ACTOR, { profile_id: PROFILE, side: 'fee', rate: 600, currency: 'INR' })
    for (const call of vi.mocked(requireActorCapability).mock.calls) {
      expect(call[0]).toBe(ACTOR)
      expect(call[1]).toBe('manageAdminTier')
    }
  })
})

describe('setBillingRate preserves the side it is not editing', () => {
  it('writing the fee rate keeps an existing pay rate', async () => {
    // A person can be BOTH a student and a payee in a family-run academy, and the two sides
    // are edited by separate forms - a blind upsert would blank whichever was not submitted.
    vi.mocked(selectAllBillingRates).mockResolvedValue([
      { profile_id: PROFILE, fee_rate: null, pay_rate: 50, currency: 'INR' },
    ] as never)
    await setBillingRate(ACTOR, { profile_id: PROFILE, side: 'fee', rate: 100, currency: 'INR' })
    expect(upsertBillingRate).toHaveBeenCalledWith(
      expect.objectContaining({ profile_id: PROFILE, fee_rate: 100, pay_rate: 50 }),
    )
  })

  it('writing the pay rate keeps an existing fee rate', async () => {
    vi.mocked(selectAllBillingRates).mockResolvedValue([
      { profile_id: PROFILE, fee_rate: 100, pay_rate: null, currency: 'INR' },
    ] as never)
    await setBillingRate(ACTOR, { profile_id: PROFILE, side: 'pay', rate: 80, currency: 'INR' })
    expect(upsertBillingRate).toHaveBeenCalledWith(
      expect.objectContaining({ profile_id: PROFILE, fee_rate: 100, pay_rate: 80 }),
    )
  })

  it('rejects a malformed rate rather than writing it', async () => {
    await expect(
      setBillingRate(ACTOR, { profile_id: PROFILE, side: 'fee', rate: 'six hundred', currency: 'INR' }),
    ).rejects.toThrow(/valid rate/i)
    expect(upsertBillingRate).not.toHaveBeenCalled()
  })

  it('a blank rate CLEARS it, which is how an admin stops someone being billable', async () => {
    await setBillingRate(ACTOR, { profile_id: PROFILE, side: 'fee', rate: '', currency: 'INR' })
    expect(upsertBillingRate).toHaveBeenCalledWith(expect.objectContaining({ fee_rate: null }))
    expect(auditPrivilegedAction).toHaveBeenCalledWith(
      { id: ACTOR },
      'billing_rate.fee_set',
      'profile',
      PROFILE,
      expect.objectContaining({ cleared: true }),
    )
  })

  it('audits the change without putting the VALUE in the metadata', async () => {
    // The audit log is readable by more people than the rate itself is.
    await setBillingRate(ACTOR, { profile_id: PROFILE, side: 'fee', rate: 600, currency: 'INR' })
    expect(auditPrivilegedAction).toHaveBeenCalledWith(
      { id: ACTOR },
      'billing_rate.fee_set',
      'profile',
      PROFILE,
      expect.objectContaining({ cleared: false }),
    )
    const metadata = vi.mocked(auditPrivilegedAction).mock.calls[0][4] as Record<string, unknown>
    expect(JSON.stringify(metadata)).not.toContain('600')
  })
})

describe('loadBillingRatesPageData', () => {
  it('falls back to INR when the org row predates the base_currency default', async () => {
    vi.mocked(getOrgSettings).mockResolvedValue({} as never)
    await expect(loadBillingRatesPageData(ACTOR)).resolves.toMatchObject({ baseCurrency: 'INR' })
  })
})
