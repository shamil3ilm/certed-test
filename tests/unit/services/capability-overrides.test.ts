import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

vi.mock('@/lib/permission/personas', () => ({
  requireAdminPersona: vi.fn(),
  loadActivePersonas: vi.fn(async () => []),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/data/audit', () => ({ writeAudit: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ getProfileById: vi.fn() }))
vi.mock('@/lib/services/capability-overrides', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/capability-overrides')>()
  return { ...actual, getCapabilityOverrides: vi.fn(actual.getCapabilityOverrides) }
})

import { requireAdminPersona } from '@/lib/permission/personas'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAudit } from '@/lib/data/audit'
import { getProfileById } from '@/lib/services/users'
import { setCapabilityOverride, getCapabilityOverrides } from '@/lib/services/capability-overrides'
import { loadUserPermissionsView } from '@/lib/services/page-data/user-permissions'
import { ValidationError } from '@/lib/errors'

const admin = { id: 'admin-1', role: 'admin', status: 'active' } as any

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requireAdminPersona).mockResolvedValue(undefined)
})

describe('setCapabilityOverride', () => {
  it('rejects a hard-rule capability before touching the DB', async () => {
    await expect(
      setCapabilityOverride(admin, { profileId: 'u1', capability: 'manageAdminTier', effect: 'allow' }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('clears the override on effect=default and audits it', async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeClient({ data: null, error: null }) as any)
    await setCapabilityOverride(admin, { profileId: 'u1', capability: 'viewClasses', effect: 'default' })
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'capability_override.clear', entity_id: 'u1' }),
    )
  })

  it('clears then creates the override on effect=allow', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeClient({ data: { id: 'ovr-1', capability: 'viewGrading', effect: 'allow' }, error: null }) as any,
    )
    await setCapabilityOverride(admin, { profileId: 'u1', capability: 'viewGrading', effect: 'allow' })
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'capability_override.create' }))
  })
})

describe('loadUserPermissionsView', () => {
  it('assembles each capability with its baseline, override and resolved outcome', async () => {
    vi.mocked(getProfileById).mockResolvedValue({
      id: 'stu-1',
      full_name: 'Sara',
      email: 's@x.c',
      role: 'student',
      status: 'active',
    } as any)
    vi.mocked(getCapabilityOverrides).mockResolvedValue([
      { capability: 'viewFinance', effect: 'allow' }, // granted beyond the student baseline
      { capability: 'viewClasses', effect: 'deny' }, // revoked from the baseline
    ])

    const { target, rows } = await loadUserPermissionsView(admin, 'stu-1')
    expect(target).toMatchObject({ name: 'Sara', role: 'student' })
    const byCap = new Map(rows.map((r) => [r.capability, r]))

    // Baseline-on, untouched -> default/effective.
    expect(byCap.get('viewDashboard')).toMatchObject({ baselineAllowed: true, effect: 'default', effective: true })
    // Granted by override (not in the student baseline) + reason-required.
    expect(byCap.get('viewFinance')).toMatchObject({
      baselineAllowed: false,
      effect: 'allow',
      effective: true,
      reasonRequired: true,
    })
    // Revoked by override from the baseline.
    expect(byCap.get('viewClasses')).toMatchObject({ baselineAllowed: true, effect: 'deny', effective: false })
    // Hard rule: locked, never granted by a student baseline or an override.
    expect(byCap.get('manageAdminTier')).toMatchObject({ isHard: true, effect: 'default', effective: false })
  })
})
