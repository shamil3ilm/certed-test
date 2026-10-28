import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A store may update the row it handed back IN PLACE (the mock one does). A service that decides
 * "did anything change, so tell people" by comparing that row with the patch after writing then
 * sees the new value on both sides and says nothing changed. These tests give each service such a
 * store, so the decision has to come from what was read before the write.
 */

vi.mock('@/lib/permission', () => ({ canWriteClass: vi.fn(), assertClassActive: vi.fn() }))
vi.mock('@/lib/permission/class-write', () => ({ canWriteClass: vi.fn() }))
vi.mock('@/lib/permission/documents', () => ({ assertCanDocument: vi.fn() }))
vi.mock('@/lib/security/throttle', () => ({ throttleWrite: vi.fn() }))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))
vi.mock('@/lib/services/notifications', () => ({
  notifyClassRoleBestEffort: vi.fn(),
  notifyBestEffort: vi.fn(),
  notifyMentorsOfStudentBestEffort: vi.fn(),
}))

vi.mock('@/lib/services/announcements/queries', () => ({ getAnnouncement: vi.fn() }))
vi.mock('@/lib/data/announcements', () => ({ insertAnnouncement: vi.fn(), updateAnnouncement: vi.fn() }))

vi.mock('@/lib/services/assignments/queries', () => ({ getAssignment: vi.fn() }))
vi.mock('@/lib/data/assignments', () => ({
  insertAssignment: vi.fn(),
  updateAssignment: vi.fn(),
  updateAssignmentStatus: vi.fn(),
  callEditAssignmentAndReclassify: vi.fn(),
}))

vi.mock('@/lib/services/assignments', () => ({ getAssignment: vi.fn() }))
vi.mock('@/lib/services/submissions/queries', () => ({ getSubmission: vi.fn() }))
vi.mock('@/lib/data/submissions', () => ({
  updateGrade: vi.fn(),
  selectActiveSubmissionIdForStudent: vi.fn(),
  insertResultGrade: vi.fn(),
}))
vi.mock('@/lib/data/class-membership', () => ({ selectActiveStudentIdsByClassIds: vi.fn() }))
vi.mock('@/lib/services/resources/queries', () => ({ getResource: vi.fn() }))
vi.mock('@/lib/services/resources/notify', () => ({ notifyClassOfDocument: vi.fn() }))
vi.mock('@/lib/services/resources/versions', () => ({ snapshotDocument: vi.fn() }))
vi.mock('@/lib/data/resources', () => ({
  incrementResourceDownloadCount: vi.fn(),
  insertResource: vi.fn(),
  updateResource: vi.fn(),
  updateResourceStatus: vi.fn(),
}))

import { canWriteClass } from '@/lib/permission/class-write'
import { canWriteClass as canWriteClassAssign } from '@/lib/permission'
import { notifyBestEffort, notifyClassRoleBestEffort } from '@/lib/services/notifications'
import { getAnnouncement } from '@/lib/services/announcements/queries'
import { updateAnnouncement } from '@/lib/data/announcements'
import { editAnnouncement, archiveAnnouncement } from '@/lib/services/announcements/commands'
import { getAssignment } from '@/lib/services/assignments/queries'
import { callEditAssignmentAndReclassify, updateAssignment, updateAssignmentStatus } from '@/lib/data/assignments'
import { editAssignment, archiveAssignment } from '@/lib/services/assignments/commands'
import { getAssignment as getAssignmentForGrading } from '@/lib/services/assignments'
import { getSubmission } from '@/lib/services/submissions/queries'
import { updateGrade } from '@/lib/data/submissions'
import { gradeSubmission } from '@/lib/services/submissions/grading'
import { getResource } from '@/lib/services/resources/queries'
import { notifyClassOfDocument } from '@/lib/services/resources/notify'
import { updateResourceStatus } from '@/lib/data/resources'
import { archiveDocument } from '@/lib/services/resources/commands'

const actor = { id: 'tutor-1' } as never

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(canWriteClass).mockResolvedValue(true)
  vi.mocked(canWriteClassAssign).mockResolvedValue(true)
})

describe('announcements, against a store that updates rows in place', () => {
  const live = () => ({
    id: 'ann-1',
    class_id: 'class-1',
    title: 'Hi',
    message: 'Original',
    status: 'active',
    publish_at: null,
  })

  it('tells the class when the words change', async () => {
    const row = live()
    vi.mocked(getAnnouncement).mockResolvedValue(row as never)
    vi.mocked(updateAnnouncement).mockImplementation(async (_id, patch) => void Object.assign(row, patch))
    await editAnnouncement(actor, 'ann-1', { title: 'Hi', message: 'Edited' } as never)
    expect(notifyClassRoleBestEffort).toHaveBeenCalledWith(
      'class-1',
      ['students', 'tutors', 'mentors'],
      expect.objectContaining({ title: 'Announcement updated: Hi' }),
      'tutor-1',
    )
  })

  it('stays quiet when an edit leaves the words alone', async () => {
    const row = live()
    vi.mocked(getAnnouncement).mockResolvedValue(row as never)
    vi.mocked(updateAnnouncement).mockImplementation(async (_id, patch) => void Object.assign(row, patch))
    await editAnnouncement(actor, 'ann-1', { title: 'Hi', message: 'Original' } as never)
    expect(notifyClassRoleBestEffort).not.toHaveBeenCalled()
  })

  it('tells the class when a live post is withdrawn', async () => {
    const row = live()
    vi.mocked(getAnnouncement).mockResolvedValue(row as never)
    vi.mocked(updateAnnouncement).mockImplementation(async (_id, patch) => void Object.assign(row, patch))
    await archiveAnnouncement(actor, 'ann-1')
    expect(notifyClassRoleBestEffort).toHaveBeenCalledWith(
      'class-1',
      ['students', 'tutors', 'mentors'],
      expect.objectContaining({ title: 'Announcement withdrawn: Hi' }),
      'tutor-1',
    )
  })

  it('tells no one when the post was not live to begin with', async () => {
    const row = { ...live(), status: 'archived' }
    vi.mocked(getAnnouncement).mockResolvedValue(row as never)
    vi.mocked(updateAnnouncement).mockImplementation(async (_id, patch) => void Object.assign(row, patch))
    await archiveAnnouncement(actor, 'ann-1')
    expect(notifyClassRoleBestEffort).not.toHaveBeenCalled()
  })
})

describe('assignments, against a store that updates rows in place', () => {
  const live = () => ({
    id: 'a-1',
    class_id: 'class-1',
    title: 'HW',
    due_date: '2026-07-01T00:00:00.000Z',
    max_marks: 10,
    status: 'active',
  })

  it('tells the class when the deadline moves', async () => {
    const row = live()
    vi.mocked(getAssignment).mockResolvedValue(row as never)
    vi.mocked(updateAssignment).mockImplementation(async (_id, patch) => void Object.assign(row, patch))
    vi.mocked(callEditAssignmentAndReclassify).mockImplementation(
      async (_id, fields) => void Object.assign(row, fields),
    )
    await editAssignment(actor, 'a-1', { due_date: '2026-08-01T00:00:00.000Z' } as never)
    expect(notifyClassRoleBestEffort).toHaveBeenCalledWith(
      'class-1',
      ['students', 'tutors', 'mentors'],
      expect.objectContaining({ title: 'Due date changed: HW', body: 'now due 2026-08-01' }),
      'tutor-1',
    )
  })

  it('tells the class when a live assignment is withdrawn, and when it comes back', async () => {
    const row = live()
    vi.mocked(getAssignment).mockResolvedValue(row as never)
    vi.mocked(updateAssignmentStatus).mockImplementation(async (_id, status) => void Object.assign(row, { status }))
    await archiveAssignment(actor, 'a-1', 'archived')
    expect(notifyClassRoleBestEffort).toHaveBeenLastCalledWith(
      'class-1',
      ['students', 'tutors', 'mentors'],
      expect.objectContaining({ title: 'Assignment withdrawn: HW' }),
      'tutor-1',
    )
    await archiveAssignment(actor, 'a-1', 'active')
    expect(notifyClassRoleBestEffort).toHaveBeenLastCalledWith(
      'class-1',
      ['students', 'tutors', 'mentors'],
      expect.objectContaining({ title: 'Assignment restored: HW' }),
      'tutor-1',
    )
  })

  it('tells no one when the status was already what was asked for', async () => {
    const row = { ...live(), status: 'archived' }
    vi.mocked(getAssignment).mockResolvedValue(row as never)
    vi.mocked(updateAssignmentStatus).mockImplementation(async (_id, status) => void Object.assign(row, { status }))
    await archiveAssignment(actor, 'a-1', 'archived')
    expect(notifyClassRoleBestEffort).not.toHaveBeenCalled()
  })
})

describe('documents, against a store that updates rows in place', () => {
  it('tells the class when a live document is removed', async () => {
    const row = { id: 'res-1', class_id: 'class-1', title: 'Notes', status: 'active' }
    vi.mocked(getResource).mockResolvedValue(row as never)
    vi.mocked(updateResourceStatus).mockImplementation(async (_id, status) => void Object.assign(row, { status }))
    await archiveDocument(actor, 'res-1')
    expect(notifyClassOfDocument).toHaveBeenCalledWith(expect.anything(), 'Document removed', 'tutor-1')
  })

  it('tells no one when the document was already archived', async () => {
    const row = { id: 'res-1', class_id: 'class-1', title: 'Notes', status: 'archived' }
    vi.mocked(getResource).mockResolvedValue(row as never)
    vi.mocked(updateResourceStatus).mockImplementation(async (_id, status) => void Object.assign(row, { status }))
    await archiveDocument(actor, 'res-1')
    expect(notifyClassOfDocument).not.toHaveBeenCalled()
  })
})

describe('grading, against a store that updates rows in place', () => {
  const live = (over: Record<string, unknown> = {}) => ({
    id: 'sub-1',
    assignment_id: 'a-1',
    student_id: 'stu-1',
    is_active: true,
    score: 17,
    feedback: 'Good',
    graded_at: '2026-07-01T00:00:00.000Z',
    ...over,
  })

  beforeEach(() => {
    vi.mocked(getAssignmentForGrading).mockResolvedValue({
      id: 'a-1',
      class_id: 'class-1',
      title: 'HW',
      max_marks: 20,
    } as never)
  })

  it('tells the student their work was reopened when a mark that had been given is cleared', async () => {
    const row = live()
    vi.mocked(getSubmission).mockResolvedValue(row as never)
    vi.mocked(updateGrade).mockImplementation(async (_id, patch) => Object.assign(row, patch) as never)
    await gradeSubmission(actor, { submissionId: 'sub-1', score: null, feedback: null } as never)
    expect(notifyBestEffort).toHaveBeenCalledWith(
      ['stu-1'],
      expect.objectContaining({ title: 'Your work was reopened for resubmission' }),
    )
  })

  it('tells nobody that clearing a mark that was never given reopened anything', async () => {
    const row = live({ score: null, feedback: null, graded_at: null })
    vi.mocked(getSubmission).mockResolvedValue(row as never)
    vi.mocked(updateGrade).mockImplementation(async (_id, patch) => Object.assign(row, patch) as never)
    await gradeSubmission(actor, { submissionId: 'sub-1', score: null, feedback: null } as never)
    expect(notifyBestEffort).not.toHaveBeenCalled()
  })
})
