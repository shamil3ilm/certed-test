import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/reminders-sweep', () => ({ deliverDueReminders: vi.fn() }))
vi.mock('@/lib/services/assignments-due-sweep', () => ({ announceAssignmentsDueSoon: vi.fn() }))
vi.mock('@/lib/observability/log', () => ({ logError: vi.fn() }))

import { deliverDueReminders } from '@/lib/services/reminders-sweep'
import { announceAssignmentsDueSoon } from '@/lib/services/assignments-due-sweep'
import { logError } from '@/lib/observability/log'
import { GET } from '@/app/api/cron/send-reminders/route'

const SECRET = 'a-cron-secret-long-enough-to-be-real'
const call = (auth?: string) =>
  GET(new Request('https://app.example.com/api/cron/send-reminders', auth ? { headers: { authorization: auth } } : {}))

beforeEach(() => {
  vi.resetAllMocks()
  process.env.CRON_SECRET = SECRET
  vi.mocked(deliverDueReminders).mockResolvedValue({ delivered: 2 })
  vi.mocked(announceAssignmentsDueSoon).mockResolvedValue({ announced: 1, notified: 5 })
})
afterEach(() => {
  delete process.env.CRON_SECRET
})

describe('GET /api/cron/send-reminders - the guard', () => {
  it('refuses a caller with no secret, running neither sweep', async () => {
    expect((await call()).status).toBe(401)
    expect(deliverDueReminders).not.toHaveBeenCalled()
    expect(announceAssignmentsDueSoon).not.toHaveBeenCalled()
  })

  it('refuses a wrong secret', async () => {
    expect((await call('Bearer not-the-secret')).status).toBe(401)
    expect(deliverDueReminders).not.toHaveBeenCalled()
  })

  it('fails CLOSED when CRON_SECRET is unset - an unconfigured deployment is not an open endpoint', async () => {
    delete process.env.CRON_SECRET
    expect((await call(`Bearer ${SECRET}`)).status).toBe(401)
  })
})

/**
 * Two sweeps on one schedule, because every extra cron is another thing that must be wired per
 * environment. The cost of sharing is that one must not be able to take the other down.
 */
describe('GET /api/cron/send-reminders - two sweeps, independently', () => {
  it('runs both and reports each', async () => {
    const res = await call(`Bearer ${SECRET}`)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      data: { reminders: { delivered: 2 }, assignmentsDueSoon: { announced: 1, notified: 5 } },
    })
  })

  it('still delivers reminders when the assignment sweep throws - an unapplied 0122 must not stop them', async () => {
    vi.mocked(announceAssignmentsDueSoon).mockRejectedValue(new Error('column due_notified_at does not exist'))

    const res = await call(`Bearer ${SECRET}`)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      data: { reminders: { delivered: 2 }, assignmentsDueSoon: null },
    })
    expect(logError).toHaveBeenCalledWith('cron.sendReminders.assignmentsDueSoon', expect.any(Error))
  })

  it('still announces due work when the reminder sweep throws', async () => {
    vi.mocked(deliverDueReminders).mockRejectedValue(new Error('boom'))

    const res = await call(`Bearer ${SECRET}`)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      data: { reminders: null, assignmentsDueSoon: { announced: 1, notified: 5 } },
    })
  })

  it('reports a pass where NOTHING ran as a failure, not as a 200 with two nulls', async () => {
    vi.mocked(deliverDueReminders).mockRejectedValue(new Error('boom'))
    vi.mocked(announceAssignmentsDueSoon).mockRejectedValue(new Error('boom'))

    expect((await call(`Bearer ${SECRET}`)).status).toBe(500)
  })
})
