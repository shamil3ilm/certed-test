import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/data/notification-mutes', () => ({ replaceMyMutes: vi.fn(), selectMyMutedKeys: vi.fn() }))

import { replaceMyMutes, selectMyMutedKeys } from '@/lib/data/notification-mutes'
import { getMyMutedKeys, setMyMutedKeys } from '@/lib/services/notification-preferences'
import { MUTABLE_NOTIFICATION_KEYS, isMutableNotificationKey } from '@/lib/notifications/keys'
import { ValidationError } from '@/lib/errors'

const actor = { id: 'p-1' } as never

beforeEach(() => vi.resetAllMocks())

describe('setMyMutedKeys', () => {
  it('stores exactly the kinds named, once each, for the signed-in person', async () => {
    await setMyMutedKeys(actor, ['grade', 'grade', 'attendance_present'])
    expect(replaceMyMutes).toHaveBeenCalledWith('p-1', ['grade', 'attendance_present'])
  })

  it('stores nothing muted for an empty set - everything switched back on', async () => {
    await setMyMutedKeys(actor, [])
    expect(replaceMyMutes).toHaveBeenCalledWith('p-1', [])
  })

  it.each(['account', 'security', 'finance', 'mentorship', 'nonsense'])(
    'refuses %s - a forged request cannot switch that off',
    async (key) => {
      await expect(setMyMutedKeys(actor, ['grade', key])).rejects.toBeInstanceOf(ValidationError)
      expect(replaceMyMutes).not.toHaveBeenCalled()
    },
  )
})

describe('getMyMutedKeys', () => {
  it('returns only keys that can be muted, ignoring a stale or unknown row', async () => {
    vi.mocked(selectMyMutedKeys).mockResolvedValue(['grade', 'old-kind'])
    await expect(getMyMutedKeys()).resolves.toEqual(['grade'])
  })
})

describe('the mutable keys', () => {
  it('are unique and describe themselves', () => {
    const keys = MUTABLE_NOTIFICATION_KEYS.map((k) => k.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of MUTABLE_NOTIFICATION_KEYS) {
      expect(k.label.length).toBeGreaterThan(2)
      expect(k.hint.length).toBeGreaterThan(2)
      expect(isMutableNotificationKey(k.key)).toBe(true)
    }
  })

  it('leave out what must always be sent', () => {
    for (const key of ['account', 'security', 'finance', 'mentorship']) {
      expect(isMutableNotificationKey(key)).toBe(false)
    }
  })
})
