import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/permission/personas', () => ({ requireAdminPersona: vi.fn() }))
vi.mock('@/lib/data/capability-overrides', () => ({
  callSetGlobalOverride: vi.fn(),
  selectActiveGlobalOverrides: vi.fn(),
}))
vi.mock('@/lib/services/users', () => ({ getProfileById: vi.fn() }))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))
vi.mock('@/lib/services/notifications', () => ({ notifyBestEffort: vi.fn() }))

import { callSetGlobalOverride } from '@/lib/data/capability-overrides'
import { getProfileById } from '@/lib/services/users'
import { notifyBestEffort } from '@/lib/services/notifications'
import { CAPABILITY_META } from '@/lib/capabilities/labels'
import { setCapabilityOverride } from '@/lib/services/capability-overrides'

// The label the editor shows, read from the same place the notification reads it: if a
// capability is renamed for people, this test follows rather than pinning the old wording.
const CALENDAR = CAPABILITY_META.viewCalendar.label

const admin = { id: 'admin-1', role: 'admin', status: 'active' } as never

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getProfileById).mockResolvedValue({ id: 'user-2', status: 'active' } as never)
  vi.mocked(callSetGlobalOverride).mockResolvedValue({ ok: true, id: 'ovr-1' } as never)
})

/**
 * Activation, revocation and restoration all notify the account they happen to. An override is
 * the same event at a finer grain: what a person can do changes, and otherwise they find out by
 * meeting a refusal.
 */
describe('setCapabilityOverride', () => {
  it('tells the person when a capability is granted, by its human label', async () => {
    await setCapabilityOverride(admin, { profileId: 'user-2', capability: 'viewCalendar', effect: 'allow' })

    expect(notifyBestEffort).toHaveBeenCalledWith(['user-2'], {
      kind: 'account',
      title: 'Your access was extended',
      body: `${CALENDAR} is now available to you.`,
      link: '/dashboard',
    })
  })

  it('tells them when one is withdrawn', async () => {
    await setCapabilityOverride(admin, { profileId: 'user-2', capability: 'viewCalendar', effect: 'deny' })

    expect(notifyBestEffort).toHaveBeenCalledWith(
      ['user-2'],
      expect.objectContaining({
        title: 'Your access was restricted',
        body: `${CALENDAR} is no longer available to you.`,
      }),
    )
  })

  it('tells them when the override is cleared and their role decides again', async () => {
    vi.mocked(callSetGlobalOverride).mockResolvedValue({ ok: true, id: null } as never)

    await setCapabilityOverride(admin, { profileId: 'user-2', capability: 'viewCalendar', effect: 'default' })

    expect(notifyBestEffort).toHaveBeenCalledWith(
      ['user-2'],
      expect.objectContaining({ title: 'Your access changed', body: `${CALENDAR} follows your role again.` }),
    )
  })

  it("never repeats the admin's REASON back to the person it is about", async () => {
    await setCapabilityOverride(admin, {
      profileId: 'user-2',
      capability: 'viewFinance',
      effect: 'allow',
      reason: 'covering for the bursar while under investigation',
    })

    const body = String(vi.mocked(notifyBestEffort).mock.calls[0][1].body)
    expect(body).not.toContain('investigation')
  })

  it('says nothing when the change is refused', async () => {
    await expect(
      setCapabilityOverride(admin, { profileId: 'user-2', capability: 'notACapability', effect: 'allow' }),
    ).rejects.toThrow()

    expect(notifyBestEffort).not.toHaveBeenCalled()
  })
})
