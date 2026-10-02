import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/finance/org-settings', () => ({ getInstituteTimeZone: vi.fn() }))
vi.mock('@/lib/services/notifications', () => ({ notifyClassRoleBestEffort: vi.fn() }))
vi.mock('@/lib/observability/log', () => ({ logError: vi.fn() }))

import { getInstituteTimeZone } from '@/lib/services/finance/org-settings'
import { notifyClassRoleBestEffort } from '@/lib/services/notifications'
import { logError } from '@/lib/observability/log'
import { notifyClassOfSlotChange } from '@/lib/services/timetable-notify'

const slot = {
  id: 'slot-1',
  class_id: 'class-1',
  subject: 'Physics',
  tutor_id: 'tutor-1',
  day_of_week: 1,
  start_time: '16:00:00',
  end_time: '17:00:00',
  mode_or_location: null,
  timezone: 'Asia/Kolkata',
  active: true,
  created_at: '2026-09-01T00:00:00.000Z',
} as never

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getInstituteTimeZone).mockResolvedValue('Asia/Kolkata')
})

/**
 * A one-off cancellation notifies (calendar-events). The RECURRING timetable is what says when
 * class is every week, and a slot moved silently is someone turning up to nothing.
 */
describe('notifyClassOfSlotChange', () => {
  it('tells students AND tutors - the tutor may not be the one who moved it', async () => {
    await notifyClassOfSlotChange(slot, 'changed')

    const roles = vi.mocked(notifyClassRoleBestEffort).mock.calls.map((c) => c[1])
    expect(roles).toEqual(['students', 'tutors'])
    expect(vi.mocked(notifyClassRoleBestEffort).mock.calls.every((c) => c[0] === 'class-1')).toBe(true)
  })

  it('names the subject and the weekly time', async () => {
    await notifyClassOfSlotChange(slot, 'changed')

    expect(notifyClassRoleBestEffort).toHaveBeenCalledWith('class-1', 'students', {
      kind: 'schedule',
      title: 'A class time changed',
      body: 'Physics - Mon 16:00-17:00',
      link: '/calendar',
    })
  })

  it('distinguishes added, changed and removed, since only one of them means "be there"', async () => {
    for (const change of ['added', 'changed', 'removed'] as const) {
      vi.mocked(notifyClassRoleBestEffort).mockClear()
      await notifyClassOfSlotChange(slot, change)
      expect(vi.mocked(notifyClassRoleBestEffort).mock.calls[0][2].title).toBe(
        { added: 'A class time was added', changed: 'A class time changed', removed: 'A class time was removed' }[
          change
        ],
      )
    }
  })

  it("writes the time in the slot's OWN zone - one notice has no single viewer to localise for", async () => {
    // Academy in Kolkata, slot entered in London: the body must read London's 16:00, not 20:30.
    vi.mocked(notifyClassRoleBestEffort).mockClear()
    await notifyClassOfSlotChange({ ...(slot as object), timezone: 'Europe/London' } as never, 'added')

    expect(vi.mocked(notifyClassRoleBestEffort).mock.calls[0][2].body).toBe('Physics - Mon 16:00-17:00')
  })

  it('swallows and logs a failure - the slot is already written', async () => {
    vi.mocked(getInstituteTimeZone).mockRejectedValue(new Error('no settings'))

    await expect(notifyClassOfSlotChange(slot, 'added')).resolves.toBeUndefined()

    expect(logError).toHaveBeenCalled()
    expect(notifyClassRoleBestEffort).not.toHaveBeenCalled()
  })
})
