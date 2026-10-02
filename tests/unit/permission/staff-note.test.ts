import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/session/actor-context', () => ({ getActorContext: vi.fn() }))

import { getActorContext } from '@/lib/session/actor-context'
import { canEditStaffNote } from '@/lib/permission/staff-note'

const actorWith = (...allowed: string[]) => ({ capabilities: { allowed: new Set(allowed) } }) as never

beforeEach(() => vi.resetAllMocks())

describe('canEditStaffNote', () => {
  it('lets a manageClassContent holder write the note', async () => {
    vi.mocked(getActorContext).mockResolvedValue(actorWith('manageAttendance', 'manageClassContent'))
    await expect(canEditStaffNote()).resolves.toBe(true)
  })

  it('refuses a mentor, who holds manageAttendance but not manageClassContent', async () => {
    // The whole point of the separate gate: a mentor may correct a mentee's session times and
    // the shared summary, and must never reach the staff-private note about that mentee.
    vi.mocked(getActorContext).mockResolvedValue(actorWith('manageAttendance'))
    await expect(canEditStaffNote()).resolves.toBe(false)
  })

  it('refuses an actor holding nothing', async () => {
    vi.mocked(getActorContext).mockResolvedValue(actorWith())
    await expect(canEditStaffNote()).resolves.toBe(false)
  })
})
