import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeClient } from '../../stubs/supabase-query-builder'

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
import {
  recordSubmission,
  recordSubmissionFromActionInput,
  gradeSubmission,
  gradeSubmissionFromActionInput,
  getLatestGrade,
  validateRecordSubmissionInput,
  validateGradeSubmissionInput,
} from '@/lib/services/submissions'
import { PermissionError, NotFoundError, ValidationError } from '@/lib/errors'

const student = { id: 'stud-1', email: 's@x.c', role: 'student', status: 'active' } as any
const tutor = { id: 'teach-1', email: 't@x.c', role: 'tutor', status: 'active' } as any

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
    vi.mocked(createClient).mockResolvedValueOnce(
      makeClient(
        { data: null, error: null },
        { data: null, error: { message: 'submission_already_graded' } },
      ) as any,
    )
    await expect(
      recordSubmission(student, { assignment_id: 'a-1', drive_link: 'https://x' }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('replaces the active submission through the atomic RPC and returns the new row', async () => {
    vi.mocked(getAssignment).mockResolvedValueOnce(activeAssignment as any)
    vi.mocked(createClient)
      .mockResolvedValueOnce(
        makeClient(
          { data: null, error: null },
          { data: submissionRow, error: null },
        ) as any,
      )
    const created = await recordSubmission(student, { assignment_id: 'a-1', drive_link: 'https://x' })
    expect(created.id).toBe('sub-1')
    expect(vi.mocked(createClient).mock.results).toHaveLength(1)
  })

  it('maps RPC enrollment failures to PermissionError', async () => {
    vi.mocked(getAssignment).mockResolvedValueOnce(activeAssignment as any)
    vi.mocked(createClient).mockResolvedValueOnce(
      makeClient(
        { data: null, error: null },
        { data: null, error: { message: 'not_enrolled' } },
      ) as any,
    )
    await expect(
      recordSubmission(student, { assignment_id: 'a-1', drive_link: 'https://x' }),
    ).rejects.toBeInstanceOf(PermissionError)
  })
})

describe('recordSubmission action-input helpers', () => {
  it('validates the student submission payload from the action layer', () => {
    expect(
      validateRecordSubmissionInput({
        assignment_id: '550e8400-e29b-41d4-a716-446655440000',
        url: 'https://example.com/work',
        file_name: ' essay.pdf ',
      }),
    ).toEqual({
      assignment_id: '550e8400-e29b-41d4-a716-446655440000',
      drive_link: 'https://example.com/work',
      file_name: 'essay.pdf',
    })
  })

  it('rejects invalid student submission payloads with a typed validation error', () => {
    expect(() =>
      validateRecordSubmissionInput({
        assignment_id: 'bad',
        url: 'not-a-url',
      }),
    ).toThrow(ValidationError)
  })

  it('delegates validated action input into the submission record flow', async () => {
    vi.mocked(getAssignment).mockResolvedValueOnce(activeAssignment as any)
    vi.mocked(createClient)
      .mockResolvedValueOnce(
        makeClient(
          { data: null, error: null },
          { data: submissionRow, error: null },
        ) as any,
      )
    const created = await recordSubmissionFromActionInput(student, {
      assignment_id: '550e8400-e29b-41d4-a716-446655440000',
      url: 'https://example.com/work',
      file_name: 'essay.pdf',
    })
    expect(created.id).toBe('sub-1')
  })
})

describe('gradeSubmission', () => {
  it('throws NotFoundError for a missing submission', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: null, error: null }) as any)
    await expect(
      gradeSubmission(tutor, { submissionId: 'missing', score: 10, feedback: null }),
    ).rejects.toBeInstanceOf(NotFoundError)
    expect(getAssignment).not.toHaveBeenCalled()
  })

  it('throws ValidationError if the submission was superseded (not active)', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      makeClient({ data: { ...submissionRow, is_active: false }, error: null }) as any,
    )
    await expect(
      gradeSubmission(tutor, { submissionId: 'sub-1', score: 10, feedback: null }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects a tutor who does not manage the assignment\'s class, without writing/auditing', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: submissionRow, error: null }) as any)
    vi.mocked(getAssignment).mockResolvedValueOnce(activeAssignment as any)
    vi.mocked(canManageClass).mockResolvedValueOnce(false)
    await expect(
      gradeSubmission(tutor, { submissionId: 'sub-1', score: 10, feedback: null }),
    ).rejects.toBeInstanceOf(PermissionError)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('rejects a score above the assignment max_marks', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: submissionRow, error: null }) as any)
    vi.mocked(getAssignment).mockResolvedValueOnce(activeAssignment as any) // max_marks: 100
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    await expect(
      gradeSubmission(tutor, { submissionId: 'sub-1', score: 150, feedback: null }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('grades, audits submission.grade, and returns the assignmentId', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: submissionRow, error: null }) as any)
    vi.mocked(getAssignment).mockResolvedValueOnce(activeAssignment as any)
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    const result = await gradeSubmission(tutor, { submissionId: 'sub-1', score: 90, feedback: 'Good' })
    expect(result).toEqual({ assignmentId: 'a-1' })
    expect(writeAudit).toHaveBeenCalledWith({
      actor_id: 'teach-1', action: 'submission.grade', entity_type: 'submission', entity_id: 'sub-1',
    })
  })
})

describe('getLatestGrade', () => {
  it('returns the most recently graded active submission, ignoring ungraded ones', async () => {
    const ungraded = { ...submissionRow, id: 'sub-2', score: null, graded_at: null }
    const olderGrade = { ...submissionRow, id: 'sub-3', score: 70, graded_at: '2026-01-01T00:00:00.000Z' }
    const newerGrade = { ...submissionRow, id: 'sub-4', score: 90, graded_at: '2026-02-01T00:00:00.000Z' }
    vi.mocked(createClient).mockResolvedValueOnce(
      makeClient({ data: [ungraded, olderGrade, newerGrade], error: null }) as any,
    )
    const result = await getLatestGrade('stud-1')
    expect(result?.id).toBe('sub-4')
  })

  it('returns null when nothing is graded yet', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(makeClient({ data: [submissionRow], error: null }) as any)
    await expect(getLatestGrade('stud-1')).resolves.toBeNull()
  })
})

describe('gradeSubmission action-input helpers', () => {
  it('validates the grading payload from the action layer', () => {
    expect(
      validateGradeSubmissionInput({
        submission_id: '550e8400-e29b-41d4-a716-446655440000',
        score: '90',
        feedback: ' Good ',
      }),
    ).toEqual({
      submissionId: '550e8400-e29b-41d4-a716-446655440000',
      score: 90,
      feedback: 'Good',
    })
  })

  it('rejects invalid grading payloads with a typed validation error', () => {
    expect(() =>
      validateGradeSubmissionInput({
        submission_id: '',
        score: 'oops',
        feedback: '',
      }),
    ).toThrow(ValidationError)
  })

  it('delegates validated grading input into the service flow', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      makeClient({ data: { ...submissionRow, id: '550e8400-e29b-41d4-a716-446655440000' }, error: null }) as any,
    )
    vi.mocked(getAssignment).mockResolvedValueOnce(activeAssignment as any)
    vi.mocked(canManageClass).mockResolvedValueOnce(true)
    vi.mocked(createAdminClient).mockReturnValueOnce(makeClient({ data: null, error: null }) as any)
    const result = await gradeSubmissionFromActionInput(tutor, {
      submission_id: '550e8400-e29b-41d4-a716-446655440000',
      score: '90',
      feedback: ' Good ',
    })
    expect(result).toEqual({ assignmentId: 'a-1' })
  })
})
