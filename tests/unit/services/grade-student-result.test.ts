import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/permission', () => ({ canManageClass: vi.fn() }))
vi.mock('@/lib/permission/class-write', () => ({ canWriteClass: vi.fn() }))
vi.mock('@/lib/services/assignments', () => ({ getAssignment: vi.fn() }))
vi.mock('@/lib/services/service-helpers', () => ({ auditPrivilegedAction: vi.fn() }))
vi.mock('@/lib/services/notifications', () => ({ notifyBestEffort: vi.fn() }))
vi.mock('@/lib/data/class-membership', () => ({ selectActiveStudentIdsByClassIds: vi.fn() }))
vi.mock('@/lib/data/submissions', () => ({
  selectActiveSubmissionIdForStudent: vi.fn(),
  insertResultGrade: vi.fn(),
  updateGrade: vi.fn(),
}))

import { canWriteClass } from '@/lib/permission/class-write'
import { getAssignment } from '@/lib/services/assignments'
import { notifyBestEffort } from '@/lib/services/notifications'
import { selectActiveStudentIdsByClassIds } from '@/lib/data/class-membership'
import { selectActiveSubmissionIdForStudent, insertResultGrade, updateGrade } from '@/lib/data/submissions'
import { gradeStudentResult } from '@/lib/services/submissions'
import { PermissionError, ValidationError } from '@/lib/errors'

const tutor = { id: 'teach-1', email: 't@x.c', role: 'tutor', status: 'active' } as any
const examAssignment = {
  id: 'a-1',
  class_id: 'class-1',
  title: 'Midterm',
  max_marks: 100,
  expects_submission: false,
} as any

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getAssignment).mockResolvedValue(examAssignment)
  vi.mocked(canWriteClass).mockResolvedValue(true)
  vi.mocked(selectActiveStudentIdsByClassIds).mockResolvedValue(['stud-1'])
})

describe('gradeStudentResult', () => {
  it('creates a graded result row when the student has no submission yet', async () => {
    vi.mocked(selectActiveSubmissionIdForStudent).mockResolvedValueOnce(null)
    await gradeStudentResult(tutor, { assignmentId: 'a-1', studentId: 'stud-1', score: 80, feedback: 'Solid' })
    expect(insertResultGrade).toHaveBeenCalledWith(
      'a-1',
      'stud-1',
      expect.objectContaining({ score: 80, feedback: 'Solid', graded_by: 'teach-1' }),
    )
    expect(updateGrade).not.toHaveBeenCalled()
    expect(notifyBestEffort).toHaveBeenCalledWith(['stud-1'], expect.objectContaining({ kind: 'grade' }))
  })

  it("updates the student's existing active submission instead of inserting", async () => {
    vi.mocked(selectActiveSubmissionIdForStudent).mockResolvedValueOnce('sub-1')
    await gradeStudentResult(tutor, { assignmentId: 'a-1', studentId: 'stud-1', score: 90, feedback: null })
    expect(updateGrade).toHaveBeenCalledWith('sub-1', expect.objectContaining({ score: 90, graded_by: 'teach-1' }))
    expect(insertResultGrade).not.toHaveBeenCalled()
  })

  it('clears an existing mark (null score) without notifying, and never inserts', async () => {
    vi.mocked(selectActiveSubmissionIdForStudent).mockResolvedValueOnce('sub-1')
    await gradeStudentResult(tutor, { assignmentId: 'a-1', studentId: 'stud-1', score: null, feedback: null })
    expect(updateGrade).toHaveBeenCalledWith(
      'sub-1',
      expect.objectContaining({ score: null, feedback: null, graded_at: null, graded_by: null }),
    )
    expect(insertResultGrade).not.toHaveBeenCalled()
    expect(notifyBestEffort).not.toHaveBeenCalled()
  })

  it('is a no-op when clearing a mark that was never recorded', async () => {
    vi.mocked(selectActiveSubmissionIdForStudent).mockResolvedValueOnce(null)
    await gradeStudentResult(tutor, { assignmentId: 'a-1', studentId: 'stud-1', score: null, feedback: null })
    expect(updateGrade).not.toHaveBeenCalled()
    expect(insertResultGrade).not.toHaveBeenCalled()
  })

  it('rejects a student who is not enrolled in the class, without writing', async () => {
    vi.mocked(selectActiveStudentIdsByClassIds).mockResolvedValueOnce(['someone-else'])
    await expect(
      gradeStudentResult(tutor, { assignmentId: 'a-1', studentId: 'stud-1', score: 80, feedback: null }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(insertResultGrade).not.toHaveBeenCalled()
    expect(updateGrade).not.toHaveBeenCalled()
  })

  it('rejects a score above the assignment max_marks', async () => {
    await expect(
      gradeStudentResult(tutor, { assignmentId: 'a-1', studentId: 'stud-1', score: 150, feedback: null }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(insertResultGrade).not.toHaveBeenCalled()
  })

  it("rejects a tutor who doesn't manage the class, without writing", async () => {
    vi.mocked(canWriteClass).mockResolvedValueOnce(false)
    await expect(
      gradeStudentResult(tutor, { assignmentId: 'a-1', studentId: 'stud-1', score: 80, feedback: null }),
    ).rejects.toBeInstanceOf(PermissionError)
    expect(selectActiveStudentIdsByClassIds).not.toHaveBeenCalled()
    expect(insertResultGrade).not.toHaveBeenCalled()
  })
})
