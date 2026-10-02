import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/data/reminders-sweep', () => ({ claimDueReminders: vi.fn() }))
vi.mock('@/lib/services/notifications', () => ({ notifyBestEffort: vi.fn() }))

import { claimDueReminders } from '@/lib/data/reminders-sweep'
import { notifyBestEffort } from '@/lib/services/notifications'
import { deliverDueReminders } from '@/lib/services/reminders-sweep'

const due = {
  id: 'r1',
  user_id: 'p1',
  title: 'Submit the physics sheet',
  description: 'Chapter 4',
  remind_at: '2026-09-28T09:00:00.000Z',
}

beforeEach(() => vi.resetAllMocks())

/**
 * The sweep is the only reader of remind_at, so these tests stand behind the time a person
 * sets: the dashboard panel shows a reminder only to someone already looking at the one place
 * the reminder is trying to send them.
 */
describe('deliverDueReminders', () => {
  it("notifies the reminder's OWNER, in their own words", async () => {
    vi.mocked(claimDueReminders).mockResolvedValue([due] as never)

    await expect(deliverDueReminders()).resolves.toEqual({ delivered: 1 })

    // user_id, not created_by: an assigned reminder (0086) is delivered to its assignee, not
    // to the tutor who set it.
    expect(notifyBestEffort).toHaveBeenCalledWith(['p1'], {
      kind: 'schedule',
      title: 'Reminder: Submit the physics sheet',
      body: 'Chapter 4',
      link: '/dashboard',
    })
  })

  it('does nothing when nothing is due - no notification, no noise', async () => {
    vi.mocked(claimDueReminders).mockResolvedValue([] as never)
    await expect(deliverDueReminders()).resolves.toEqual({ delivered: 0 })
    expect(notifyBestEffort).not.toHaveBeenCalled()
  })

  it('delivers every reminder in the batch', async () => {
    vi.mocked(claimDueReminders).mockResolvedValue([due, { ...due, id: 'r2', user_id: 'p2' }] as never)
    await expect(deliverDueReminders()).resolves.toEqual({ delivered: 2 })
    expect(notifyBestEffort).toHaveBeenCalledTimes(2)
  })

  it('reports only what it CLAIMED, so a second pass cannot re-deliver the same reminder', async () => {
    // The claim is the exclusivity: whatever this call stamped is what it returns, and that is
    // what gets counted. A concurrent pass claims a disjoint set.
    vi.mocked(claimDueReminders).mockResolvedValue([due] as never)
    const result = await deliverDueReminders()
    expect(result.delivered).toBe(1)
    expect(vi.mocked(claimDueReminders).mock.calls[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
