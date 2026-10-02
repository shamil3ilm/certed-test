import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/data/pending-emails', () => ({ selectEmailQueueStats: vi.fn() }))
vi.mock('@/lib/data/reminders-sweep', () => ({ selectDueReminderBacklog: vi.fn() }))
vi.mock('@/lib/data/attachments', () => ({ countFailedAttachments: vi.fn() }))
vi.mock('@/lib/data/schema-health', () => ({ selectRlsDisabledTables: vi.fn() }))
vi.mock('@/lib/observability/log', () => ({ logError: vi.fn() }))

import { selectEmailQueueStats } from '@/lib/data/pending-emails'
import { selectDueReminderBacklog } from '@/lib/data/reminders-sweep'
import { countFailedAttachments } from '@/lib/data/attachments'
import { selectRlsDisabledTables } from '@/lib/data/schema-health'
import { logError } from '@/lib/observability/log'
import { assessQueueHealth } from '@/lib/services/queue-health'

const NOW = Date.parse('2026-09-28T12:00:00.000Z')
const minutesAgo = (n: number) => new Date(NOW - n * 60_000).toISOString()

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(selectEmailQueueStats).mockResolvedValue({ pending: 0, failed: 0, oldestPendingAt: null })
  vi.mocked(countFailedAttachments).mockResolvedValue(0)
  vi.mocked(selectRlsDisabledTables).mockResolvedValue([])
  vi.mocked(selectDueReminderBacklog).mockResolvedValue({ due: 0, oldestDueAt: null })
})

/**
 * The reminder sweep had no gauge of its own. `reminders` rows are written by people, not by a
 * queue writer, so a sweep that has stopped running looks exactly like a quiet day - which is how
 * a silent scheduled job stays silent.
 */
describe('assessQueueHealth - the reminder sweep', () => {
  it('alarms when a due reminder has gone undelivered for an hour', async () => {
    vi.mocked(selectDueReminderBacklog).mockResolvedValue({ due: 4, oldestDueAt: minutesAgo(90) })

    const health = await assessQueueHealth(NOW)

    expect(health.reminders).toEqual({ due: 4, oldestDueMinutes: 90 })
    expect(health.alarms).toContain('oldest undelivered reminder 90m past its time (4 due)')
    expect(logError).toHaveBeenCalled()
  })

  it("stays quiet within the sweep's own cadence - 15 minutes late is just the next pass", async () => {
    vi.mocked(selectDueReminderBacklog).mockResolvedValue({ due: 2, oldestDueAt: minutesAgo(16) })

    const health = await assessQueueHealth(NOW)

    expect(health.reminders).toEqual({ due: 2, oldestDueMinutes: 16 })
    expect(health.alarms).toEqual([])
    expect(logError).not.toHaveBeenCalled()
  })

  it('reports nothing waiting as null age, not as zero', async () => {
    const health = await assessQueueHealth(NOW)

    expect(health.reminders).toEqual({ due: 0, oldestDueMinutes: null })
    expect(health.alarms).toEqual([])
  })

  it('alarms on AGE, not depth: one hour-late reminder breaches, a hundred fresh ones do not', async () => {
    vi.mocked(selectDueReminderBacklog).mockResolvedValue({ due: 100, oldestDueAt: minutesAgo(5) })
    expect((await assessQueueHealth(NOW)).alarms).toEqual([])

    vi.mocked(selectDueReminderBacklog).mockResolvedValue({ due: 1, oldestDueAt: minutesAgo(61) })
    expect((await assessQueueHealth(NOW)).alarms).toHaveLength(1)
  })

  it('reads the backlog as of the SAME instant it is judging against', async () => {
    await assessQueueHealth(NOW)

    expect(selectDueReminderBacklog).toHaveBeenCalledWith(new Date(NOW).toISOString())
  })

  it('does not drown out the other alarms', async () => {
    vi.mocked(selectDueReminderBacklog).mockResolvedValue({ due: 1, oldestDueAt: minutesAgo(120) })
    vi.mocked(selectRlsDisabledTables).mockResolvedValue(['mentee_notes'])

    const health = await assessQueueHealth(NOW)

    expect(health.alarms).toHaveLength(2)
    expect(health.alarms.some((a) => a.includes('RLS disabled'))).toBe(true)
  })
})
