import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabaseQueryBuilder'

vi.mock('@/lib/permission', () => ({ canManageClass: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/repos/audit', () => ({ writeAudit: vi.fn() }))
vi.mock('@/lib/services/assignments', () => ({ getAssignment: vi.fn() }))

import { canManageClass } from '@/lib/permission'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAudit } from '@/lib/repos/audit'
import { getAssignment } from '@/lib/services/assignments'
import { recordSubmission, gradeSubmission } from '@/lib/services/submissions'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'

const student = { id: 'stud-1', email: 's@x.c', role: 'student', status: 'active' } as any
const teacher = { id: 'teach-1', email: 't@x.c', role: 'teacher', status: 'active' } as any

const activeAssignment = {
  id: 'a-1', class_id: 'class-1', title: 'HW', description: null, due_date: '2099-01-01T00:00:00.000Z',
  attachment_drive_link: null, topic: null, max_marks: 100, created_by: 'teach-1', status: 'active', created_at: 't',
}

const submissionRow = {
  id: 'sub-1', assignment_id: 'a-1', student_id: 'stud-1', drive_link: 'https://x', file_name: null,
  status: 'submitted', score: null, feedback: null, graded_at: null, graded_by: null,
  submitted_at: 't', is_active: true, created_at: 't',
}

beforeEach(() => vi.resetAllMocks())

describe('recordSubmission', () => {
  it('throws NotFoundError for a missing/inactive assignment', async () => {
    vi.mocked(getAssignment).mockResolvedValueOnce(null)
    await expect(
      recordSubmission(student, { assignment_id: 'missing', drive_link: 'https://x' }),
    ).rejects.toBeInstanceOf(NotFoundError)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('blocks resubmission over an already-graded active submission', async () => {
    vi.mocked(getAssignment).mockResolvedValueOnce(activeAssignment as any)
    // getActiveSubmission's read: an active, already-graded submission
    vi.mocked(createClient).mockResolvedValueOnce(
      makeClient({ data: { ...submissionRow, score: 95 }, error: null }) as any,
    )
    await expect(
      recordSubmission(student, { assignment_id: 'a-1', drive_link: 'https://x' }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('supersedes the prior submission and records the new one', async () => {
    vi.mocked(getAssignment).mockResolvedValueOnce(activeAssignment as any)
    // recordSubmission makes exactly 2 createClient() calls: one inside
    // getActiveSubmission, and one shared client reused for BOTH the
    // "supersede" update (result ignored — not error-checked, matching the
    // original repo function) and the insert (`.from()` is called twice on
    // the same client instance, each returning a fresh queryBuilder over
    // this same `result`).
    vi.mocked(createClient)
      .mockResolvedValueOnce(makeClient({ data: null, error: null }) as any) // getActiveSubmission: none active
      .mockResolvedValueOnce(makeClient({ data: submissionRow, error: null }) as any) // shared: update + insert
    const created = await recordSubmission(student, { assignment_id: 'a-1', drive_link: 'https://x' })
    expect(created.id).toBe('sub-1')
  })
})

describe('gradeSubmission', () => {
  it('throws NotFoundError for a missing submission', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await expect(
      gradeSubmission(teacher, { submissionId: 'missing', score: 10, feedback: null }),
    ).rejects.toBeInstanceOf(NotFoundError)
    expect(getAssignment).not.toHaveBeenCalled()
  })

  it('throws ValidationError if the submission was superseded (not active)', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      makeClient({ data: { ...submissionRow, is_active: false }, error: null }) as any,
    )
    await expect(
      gradeSubmission(teacher, { submissionId: 'sub-1', score: 10, feedback: null }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects a teacher who does not manage the assignment\'s class, without writing/auditing', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: submissionRow, error: null }) as any)
    vi.mocked(getAssignment).mockResolvedValueOnce(activeAssignment as any)
    vi.mocked(canManageClass).mockResolvedValueOnce(false)
    await expect(
      gradeSubmission(teacher, { submissionId: 'sub-1', score: 10, feedback: null }),
    ).rejects.toBeInstanceOf(PermissionError)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('rejects a score above the assignment max_marks', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: submissionRow, error: null }) as any)
    vi.mocked(getAssignment).mockResolvedValueOnce(activeAssignment as any) // max_marks: 100
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    await expect(
      gradeSubmission(teacher, { submissionId: 'sub-1', score: 150, feedback: null }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('grades, audits submission.grade, and returns the assignmentId', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: submissionRow, error: null }) as any)
    vi.mocked(getAssignment).mockResolvedValueOnce(activeAssignment as any)
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    const result = await gradeSubmission(teacher, { submissionId: 'sub-1', score: 90, feedback: 'Good' })
    expect(result).toEqual({ assignmentId: 'a-1' })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'teach-1', action: 'submission.grade', entity_type: 'submission', entity_id: 'sub-1',
    })
  })
})
