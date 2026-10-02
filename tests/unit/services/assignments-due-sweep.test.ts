import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/data/assignments-due-sweep', () => ({
  claimAssignmentsDueSoon: vi.fn(),
  selectLiveClassIds: vi.fn(),
  selectEnrolledStudentsByClass: vi.fn(),
  selectSubmittedStudentsByAssignment: vi.fn(),
}))
vi.mock('@/lib/services/notifications', () => ({ notifyBestEffort: vi.fn() }))

import {
  claimAssignmentsDueSoon,
  selectLiveClassIds,
  selectEnrolledStudentsByClass,
  selectSubmittedStudentsByAssignment,
} from '@/lib/data/assignments-due-sweep'
import { notifyBestEffort } from '@/lib/services/notifications'
import { announceAssignmentsDueSoon } from '@/lib/services/assignments-due-sweep'

const physics = { id: 'assign-1', class_id: 'class-1', title: 'Physics sheet 4', due_date: '2026-09-29T09:00:00.000Z' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(selectLiveClassIds).mockResolvedValue(new Set(['class-1']))
  vi.mocked(selectEnrolledStudentsByClass).mockResolvedValue(new Map([['class-1', ['stud-1', 'stud-2', 'stud-3']]]))
  vi.mocked(selectSubmittedStudentsByAssignment).mockResolvedValue(new Map())
})

/**
 * Posting an assignment already notifies the class. This is the other end of the same date -
 * due_date was otherwise read only to sort a widget and to close submissions.
 */
describe('announceAssignmentsDueSoon', () => {
  it('tells the class what falls due, linking to the work', async () => {
    vi.mocked(claimAssignmentsDueSoon).mockResolvedValue([physics])

    await expect(announceAssignmentsDueSoon()).resolves.toEqual({ announced: 1, notified: 3 })

    expect(notifyBestEffort).toHaveBeenCalledWith(['stud-1', 'stud-2', 'stud-3'], {
      kind: 'assignment',
      title: 'Work due tomorrow',
      body: 'Physics sheet 4',
      link: '/classroom/class-1/classwork',
    })
  })

  it('does not chase a student who has already turned it in', async () => {
    vi.mocked(claimAssignmentsDueSoon).mockResolvedValue([physics])
    vi.mocked(selectSubmittedStudentsByAssignment).mockResolvedValue(new Map([['assign-1', new Set(['stud-2'])]]))

    await expect(announceAssignmentsDueSoon()).resolves.toEqual({ announced: 1, notified: 2 })

    expect(notifyBestEffort).toHaveBeenCalledWith(['stud-1', 'stud-3'], expect.anything())
  })

  it('counts an assignment the whole class has submitted as announced, notifying nobody', async () => {
    vi.mocked(claimAssignmentsDueSoon).mockResolvedValue([physics])
    vi.mocked(selectSubmittedStudentsByAssignment).mockResolvedValue(
      new Map([['assign-1', new Set(['stud-1', 'stud-2', 'stud-3'])]]),
    )

    await expect(announceAssignmentsDueSoon()).resolves.toEqual({ announced: 1, notified: 0 })

    expect(notifyBestEffort).not.toHaveBeenCalled()
  })

  it('stays silent about an ARCHIVED class - it accepts nothing, so its deadline is not news', async () => {
    vi.mocked(claimAssignmentsDueSoon).mockResolvedValue([physics])
    vi.mocked(selectLiveClassIds).mockResolvedValue(new Set())

    await expect(announceAssignmentsDueSoon()).resolves.toEqual({ announced: 1, notified: 0 })

    expect(notifyBestEffort).not.toHaveBeenCalled()
  })

  it('reads nothing further when nothing is due', async () => {
    vi.mocked(claimAssignmentsDueSoon).mockResolvedValue([])

    await expect(announceAssignmentsDueSoon()).resolves.toEqual({ announced: 0, notified: 0 })

    expect(selectEnrolledStudentsByClass).not.toHaveBeenCalled()
    expect(notifyBestEffort).not.toHaveBeenCalled()
  })

  it('asks for a window that starts NOW and runs a day ahead - not for everything overdue', async () => {
    vi.mocked(claimAssignmentsDueSoon).mockResolvedValue([])

    await announceAssignmentsDueSoon()

    const [fromIso, untilIso] = vi.mocked(claimAssignmentsDueSoon).mock.calls[0]
    const span = Date.parse(untilIso) - Date.parse(fromIso)
    expect(span).toBe(24 * 60 * 60 * 1000)
    // Work already past its due date is outside the window: a notice then is a reproach, not a
    // reminder.
    expect(Date.parse(fromIso)).toBeLessThanOrEqual(Date.now())
  })

  it('keeps each class to its own roster when a batch spans several', async () => {
    vi.mocked(claimAssignmentsDueSoon).mockResolvedValue([
      physics,
      { id: 'assign-2', class_id: 'class-2', title: 'Essay', due_date: physics.due_date },
    ])
    vi.mocked(selectLiveClassIds).mockResolvedValue(new Set(['class-1', 'class-2']))
    vi.mocked(selectEnrolledStudentsByClass).mockResolvedValue(
      new Map([
        ['class-1', ['stud-1']],
        ['class-2', ['stud-9']],
      ]),
    )

    await expect(announceAssignmentsDueSoon()).resolves.toEqual({ announced: 2, notified: 2 })

    expect(notifyBestEffort).toHaveBeenCalledWith(['stud-1'], expect.objectContaining({ body: 'Physics sheet 4' }))
    expect(notifyBestEffort).toHaveBeenCalledWith(['stud-9'], expect.objectContaining({ body: 'Essay' }))
  })
})
