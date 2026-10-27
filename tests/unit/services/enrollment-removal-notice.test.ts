import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/permission/class-write', () => ({ canWriteClass: vi.fn() }))
vi.mock('@/lib/data/class-membership', () => ({
  deactivateEnrollment: vi.fn(),
  upsertEnrollment: vi.fn(),
  selectActiveEnrollmentRefsByClassIds: vi.fn(),
  countActiveEnrollmentsPerClass: vi.fn(),
}))
vi.mock('@/lib/data/classes', () => ({ selectClassNamesByIdsAsService: vi.fn(), selectClassStatus: vi.fn() }))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))
vi.mock('@/lib/services/notifications', () => ({
  notifyBestEffort: vi.fn(),
  notifyClassRoleBestEffort: vi.fn(),
  notifyMentorsOfStudentBestEffort: vi.fn(),
}))
vi.mock('@/lib/observability/log', () => ({ logError: vi.fn() }))

import { canWriteClass } from '@/lib/permission/class-write'
import { deactivateEnrollment } from '@/lib/data/class-membership'
import { selectClassNamesByIdsAsService } from '@/lib/data/classes'
import {
  notifyBestEffort,
  notifyClassRoleBestEffort,
  notifyMentorsOfStudentBestEffort,
} from '@/lib/services/notifications'
import { logError } from '@/lib/observability/log'
import { removeStudent } from '@/lib/services/enrollments'

const staff = { id: 'admin-1', role: 'admin', status: 'active' } as never
const params = { classId: 'class-1', studentId: 'stud-1' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(canWriteClass).mockResolvedValue(true)
  vi.mocked(selectClassNamesByIdsAsService).mockResolvedValue([
    { id: 'class-1', name: 'Physics 11', subject_id: 'subj-1' },
  ])
})

/**
 * Joining a class notifies the student. Leaving it has to as well, or the class simply stops
 * appearing in their dashboard and they are left to work out why.
 */
describe('removeStudent', () => {
  it('tells the student they were removed, naming the class', async () => {
    await removeStudent(staff, params)

    expect(notifyBestEffort).toHaveBeenCalledWith(['stud-1'], {
      kind: 'class',
      title: 'You were removed from a class',
      body: 'Physics 11',
      // NOT /classroom/class-1: the enrolment is deactivated, so RLS closes that page to them.
      link: '/dashboard',
    })
  })

  it("also tells the class's tutors (not the one who acted) and the student's mentors", async () => {
    await removeStudent(staff, params)

    expect(notifyClassRoleBestEffort).toHaveBeenCalledWith(
      'class-1',
      'tutors',
      expect.objectContaining({ title: 'A student was removed from a class you teach', body: 'Physics 11' }),
      'admin-1',
    )
    expect(notifyMentorsOfStudentBestEffort).toHaveBeenCalledWith('stud-1', expect.any(Function))
    const build = vi.mocked(notifyMentorsOfStudentBestEffort).mock.calls[0][1]
    expect(build('Sara').title).toBe('Sara was removed from a class')
  })

  it('notifies AFTER the removal is written, never instead of it', async () => {
    const order: string[] = []
    vi.mocked(deactivateEnrollment).mockImplementation(async () => void order.push('write'))
    vi.mocked(notifyBestEffort).mockImplementation(async () => void order.push('notify'))

    await removeStudent(staff, params)

    expect(order).toEqual(['write', 'notify'])
  })

  it('still notifies when the class name cannot be read - the name is a nicety, the notice is not', async () => {
    vi.mocked(selectClassNamesByIdsAsService).mockRejectedValue(new Error('db down'))

    await expect(removeStudent(staff, params)).resolves.toBeUndefined()

    expect(notifyBestEffort).toHaveBeenCalledWith(['stud-1'], expect.objectContaining({ body: null }))
    expect(logError).toHaveBeenCalled()
  })

  it('does not notify when the caller was refused - nothing happened to tell them about', async () => {
    vi.mocked(canWriteClass).mockResolvedValue(false)

    await expect(removeStudent(staff, params)).rejects.toThrow()

    expect(deactivateEnrollment).not.toHaveBeenCalled()
    expect(notifyBestEffort).not.toHaveBeenCalled()
  })
})
