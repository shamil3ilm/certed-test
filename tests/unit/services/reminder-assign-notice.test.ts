import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/permission', () => ({ canManageClass: vi.fn() }))
vi.mock('@/lib/data/class-membership', () => ({ selectActiveClassIdsForStudent: vi.fn() }))
vi.mock('@/lib/data/reminders', () => ({
  deleteReminderRow: vi.fn(),
  insertAssignedReminder: vi.fn(),
  insertReminder: vi.fn(),
  markSent: vi.fn(),
  selectReminderParties: vi.fn(),
  selectPendingForUser: vi.fn(),
  selectSentForUser: vi.fn(),
  updateReminderRow: vi.fn(),
}))
vi.mock('@/lib/security/throttle', () => ({ throttleWrite: vi.fn() }))
vi.mock('@/lib/services/notifications', () => ({ notifyBestEffort: vi.fn() }))

import { canManageClass } from '@/lib/permission'
import { selectActiveClassIdsForStudent } from '@/lib/data/class-membership'
import { insertAssignedReminder } from '@/lib/data/reminders'
import { notifyBestEffort } from '@/lib/services/notifications'
import { assignReminderFromActionInput } from '@/lib/services/reminders'
import { PermissionError, ValidationError } from '@/lib/errors'

const tutor = { id: 'tutor-1' } as never
const CLASS = '3f1c2b7e-8a4d-4c1e-9b52-6d0a7e4f1a10'
const STUDENT = '9d2e5a41-7c3b-4f08-8a16-2b4c6e8f0a12'
const input = {
  title: 'Read chapter 4',
  remind_at: '2030-01-01T10:00:00.000Z',
  assigneeId: STUDENT,
  classId: CLASS,
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(canManageClass).mockResolvedValue(true)
  vi.mocked(selectActiveClassIdsForStudent).mockResolvedValue([CLASS])
})

describe('assignReminderFromActionInput tells the student', () => {
  it('notifies the assignee when the reminder is assigned, not only when it falls due', async () => {
    await assignReminderFromActionInput(tutor, input)
    expect(insertAssignedReminder).toHaveBeenCalled()
    expect(notifyBestEffort).toHaveBeenCalledWith(
      [STUDENT],
      expect.objectContaining({ kind: 'schedule', title: 'Reminder assigned: Read chapter 4', link: '/dashboard' }),
    )
  })

  it('writes first and notifies second', async () => {
    const order: string[] = []
    vi.mocked(insertAssignedReminder).mockImplementation(async () => {
      order.push('write')
      return {} as never
    })
    vi.mocked(notifyBestEffort).mockImplementation(async () => void order.push('notify'))
    await assignReminderFromActionInput(tutor, input)
    expect(order).toEqual(['write', 'notify'])
  })

  it('tells nobody when the actor cannot manage the class', async () => {
    vi.mocked(canManageClass).mockResolvedValue(false)
    await expect(assignReminderFromActionInput(tutor, input)).rejects.toBeInstanceOf(PermissionError)
    expect(insertAssignedReminder).not.toHaveBeenCalled()
    expect(notifyBestEffort).not.toHaveBeenCalled()
  })

  it('tells nobody when the student is not enrolled in that class', async () => {
    vi.mocked(selectActiveClassIdsForStudent).mockResolvedValue([])
    await expect(assignReminderFromActionInput(tutor, input)).rejects.toBeInstanceOf(ValidationError)
    expect(notifyBestEffort).not.toHaveBeenCalled()
  })
})
