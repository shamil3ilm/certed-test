import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/authorization', () => ({ requireActorCapability: vi.fn() }))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))
vi.mock('@/lib/data/classes', () => ({
  insertClass: vi.fn(),
  selectClassNamesByIdsAsService: vi.fn(),
  updateClassName: vi.fn(),
  updateClassStatus: vi.fn(),
}))
vi.mock('@/lib/data/class-subjects', () => ({ subjectRefusalOf: vi.fn() }))
vi.mock('@/lib/services/notifications', () => ({ notifyClassRoleBestEffort: vi.fn() }))
vi.mock('@/lib/observability/log', () => ({ logError: vi.fn() }))

import { selectClassNamesByIdsAsService, updateClassStatus } from '@/lib/data/classes'
import { auditPrivilegedAction } from '@/lib/services/service-helpers'
import { notifyClassRoleBestEffort } from '@/lib/services/notifications'
import { logError } from '@/lib/observability/log'
import { archiveClass, restoreClass } from '@/lib/services/classes/lifecycle'

const admin = { id: 'admin-1', role: 'admin', status: 'active' } as never

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(selectClassNamesByIdsAsService).mockResolvedValue([
    { id: 'class-1', name: 'Chemistry 12', subject_id: 'subj-2' },
  ])
})

/**
 * Archiving stops a class accepting anything (0114) and drops it out of the live lists, so to
 * everyone in it the class simply stops being there - the whole class at once.
 */
describe('archiveClass', () => {
  it('tells the students and the tutors, naming the class', async () => {
    await archiveClass(admin, 'class-1')

    const expected = {
      kind: 'class',
      title: 'A class was archived',
      body: 'Chemistry 12',
      link: '/dashboard',
    }
    expect(notifyClassRoleBestEffort).toHaveBeenCalledWith('class-1', ['students', 'tutors', 'mentors'], expected)
  })

  it('archives first and notifies second', async () => {
    const order: string[] = []
    vi.mocked(updateClassStatus).mockImplementation(async () => void order.push('archive'))
    vi.mocked(auditPrivilegedAction).mockImplementation(async () => void order.push('audit'))
    vi.mocked(notifyClassRoleBestEffort).mockImplementation(async () => void order.push('notify'))

    await archiveClass(admin, 'class-1')

    expect(order).toEqual(['archive', 'audit', 'notify'])
  })

  it('stays archived when the notice fails', async () => {
    vi.mocked(selectClassNamesByIdsAsService).mockRejectedValue(new Error('db down'))

    await expect(archiveClass(admin, 'class-1')).resolves.toBeUndefined()

    expect(updateClassStatus).toHaveBeenCalledWith('class-1', 'archived')
    expect(logError).toHaveBeenCalled()
  })
})

/** Restoring is the reverse event - the class comes back for everyone in it at once. */
describe('restoreClass', () => {
  it('tells the students, tutors and mentors, linking straight to the class', async () => {
    await restoreClass(admin, 'class-1')

    expect(notifyClassRoleBestEffort).toHaveBeenCalledWith('class-1', ['students', 'tutors', 'mentors'], {
      kind: 'class',
      title: 'A class was restored',
      body: 'Chemistry 12',
      link: '/classroom/class-1',
    })
  })

  it('restores first and notifies second', async () => {
    const order: string[] = []
    vi.mocked(updateClassStatus).mockImplementation(async () => void order.push('restore'))
    vi.mocked(auditPrivilegedAction).mockImplementation(async () => void order.push('audit'))
    vi.mocked(notifyClassRoleBestEffort).mockImplementation(async () => void order.push('notify'))

    await restoreClass(admin, 'class-1')

    expect(order).toEqual(['restore', 'audit', 'notify'])
  })

  it('tells no one when the restore is refused', async () => {
    vi.mocked(updateClassStatus).mockRejectedValue(new Error('refused'))

    await expect(restoreClass(admin, 'class-1')).rejects.toThrow('refused')
    expect(notifyClassRoleBestEffort).not.toHaveBeenCalled()
  })

  it('stays restored when the notice fails', async () => {
    vi.mocked(selectClassNamesByIdsAsService).mockRejectedValue(new Error('db down'))

    await expect(restoreClass(admin, 'class-1')).resolves.toBeUndefined()
    expect(logError).toHaveBeenCalledWith(
      'classes.restoreNotice',
      expect.any(Error),
      { classId: 'class-1' },
      {
        toSentry: false,
      },
    )
  })
})
