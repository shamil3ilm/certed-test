import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission/personas', () => ({ loadPersonaFlags: vi.fn() }))

import { canManageTarget } from '@/lib/services/users/admin-lifecycle'
import { loadPersonaFlags } from '@/lib/permission/personas'

const actor = { id: 'actor-1' } as never

beforeEach(() => vi.resetAllMocks())

describe('canManageTarget - who a manager may act on', () => {
  it('a sub_admin manages every non-admin account (tutor, mentor, student) but never an admin', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: false, isSubAdmin: true } as never)
    expect(await canManageTarget(actor, 'tutor')).toBe(true)
    expect(await canManageTarget(actor, 'mentor')).toBe(true)
    expect(await canManageTarget(actor, 'student')).toBe(true)
    expect(await canManageTarget(actor, 'admin')).toBe(false)
    expect(await canManageTarget(actor, 'sub_admin')).toBe(false)
  })

  it('an admin may act on anyone', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: true, isSubAdmin: false } as never)
    expect(await canManageTarget(actor, 'admin')).toBe(true)
    expect(await canManageTarget(actor, 'mentor')).toBe(true)
  })

  it('a plain user manages no one', async () => {
    vi.mocked(loadPersonaFlags).mockResolvedValue({ isAdmin: false, isSubAdmin: false } as never)
    expect(await canManageTarget(actor, 'student')).toBe(false)
    expect(await canManageTarget(actor, 'mentor')).toBe(false)
  })
})
