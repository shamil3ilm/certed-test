import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/data/profiles', () => ({
  selectProfilesLiteByIds: vi.fn(),
  selectActiveProfilesByRoles: vi.fn(),
}))
vi.mock('@/lib/services/notifications', () => ({ notifyBestEffort: vi.fn() }))
vi.mock('@/lib/observability/log', () => ({ logError: vi.fn() }))

import { selectActiveProfilesByRoles, selectProfilesLiteByIds } from '@/lib/data/profiles'
import { notifyBestEffort } from '@/lib/services/notifications'
import { logError } from '@/lib/observability/log'
import { notifyAccountActivated } from '@/lib/services/users/activation-notice'

const newMember = { id: 'p1', full_name: 'Eve Newbie', email: 'eve@x.dev', role: 'student' }
const managers = [
  { id: 'admin-1', full_name: 'Ada Admin', email: 'ada@x.dev', role: 'admin' },
  { id: 'sub-1', full_name: 'Sam Sub', email: 'sam@x.dev', role: 'sub_admin' },
]

beforeEach(() => vi.resetAllMocks())

describe('notifyAccountActivated', () => {
  it('tells the admin tier who set up their account, and links to them', async () => {
    vi.mocked(selectProfilesLiteByIds).mockResolvedValue([newMember] as any)
    vi.mocked(selectActiveProfilesByRoles).mockResolvedValue(managers as any)

    await notifyAccountActivated('p1')

    expect(selectActiveProfilesByRoles).toHaveBeenCalledWith(['admin', 'sub_admin'])
    expect(notifyBestEffort).toHaveBeenCalledWith(['admin-1', 'sub-1'], {
      kind: 'account',
      title: 'Eve Newbie has set up their account',
      body: 'eve@x.dev - student',
      link: '/admin/users/p1',
    })
  })

  it('does not tell an admin about their OWN account going live', async () => {
    vi.mocked(selectProfilesLiteByIds).mockResolvedValue([{ ...newMember, id: 'admin-1' }] as any)
    vi.mocked(selectActiveProfilesByRoles).mockResolvedValue(managers as any)

    await notifyAccountActivated('admin-1')

    expect(notifyBestEffort).toHaveBeenCalledWith(['sub-1'], expect.anything())
  })

  it('names someone with no full name by their email', async () => {
    vi.mocked(selectProfilesLiteByIds).mockResolvedValue([{ ...newMember, full_name: null }] as any)
    vi.mocked(selectActiveProfilesByRoles).mockResolvedValue(managers as any)

    await notifyAccountActivated('p1')

    expect(notifyBestEffort).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: 'eve@x.dev has set up their account' }),
    )
  })

  it('never throws - the account is already active, so a failure here is logged and swallowed', async () => {
    vi.mocked(selectProfilesLiteByIds).mockRejectedValue(new Error('db down'))

    await expect(notifyAccountActivated('p1')).resolves.toBeUndefined()

    expect(notifyBestEffort).not.toHaveBeenCalled()
    expect(logError).toHaveBeenCalledWith(
      'users.notifyAccountActivated',
      expect.any(Error),
      { profileId: 'p1' },
      {
        toSentry: false,
      },
    )
  })
})
