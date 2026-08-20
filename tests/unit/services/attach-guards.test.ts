import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotFoundError, PermissionError, ValidationError } from '@/lib/errors'

vi.mock('@/lib/data/submissions-service-reads', () => ({ selectSubmissionStateAsService: vi.fn() }))
vi.mock('@/lib/data/assignments', () => ({ selectAssignmentStateAsService: vi.fn() }))
vi.mock('@/lib/data/resources', () => ({ selectResourceForAttachAsService: vi.fn() }))
vi.mock('@/lib/data/attachments', () => ({ selectActiveAttachmentsForOwner: vi.fn() }))
vi.mock('@/lib/permission/documents', () => ({ assertCanDocument: vi.fn() }))
vi.mock('@/lib/permission/class', () => ({ assertClassActive: vi.fn() }))

import { assertSubmissionAcceptsWork, assertMayAttachToResource } from '@/lib/services/attachments/attach-guards'
import { selectSubmissionStateAsService } from '@/lib/data/submissions-service-reads'
import { selectAssignmentStateAsService } from '@/lib/data/assignments'
import { selectResourceForAttachAsService } from '@/lib/data/resources'
import { selectActiveAttachmentsForOwner } from '@/lib/data/attachments'
import { assertCanDocument } from '@/lib/permission/documents'
import { assertClassActive } from '@/lib/permission/class'

const me = { id: 'stu-1' } as never
const activeSub = { student_id: 'stu-1', assignment_id: 'a-1', is_active: true, score: null, graded_at: null }
const openAssignment = {
  class_id: 'c-1',
  status: 'active' as const,
  enforce_deadline: false,
  due_date: '2020-01-01T00:00:00Z',
}

beforeEach(() => vi.resetAllMocks())

describe('assertSubmissionAcceptsWork (Vuln 1 - attach only to a submission still accepting work)', () => {
  it('404s a missing submission', async () => {
    vi.mocked(selectSubmissionStateAsService).mockResolvedValueOnce(null)
    await expect(assertSubmissionAcceptsWork(me, 's-1')).rejects.toBeInstanceOf(NotFoundError)
  })
  it("rejects someone else's submission", async () => {
    vi.mocked(selectSubmissionStateAsService).mockResolvedValueOnce({ ...activeSub, student_id: 'other' })
    await expect(assertSubmissionAcceptsWork(me, 's-1')).rejects.toBeInstanceOf(PermissionError)
  })
  it('rejects a replaced/withdrawn (inactive) submission', async () => {
    vi.mocked(selectSubmissionStateAsService).mockResolvedValueOnce({ ...activeSub, is_active: false })
    await expect(assertSubmissionAcceptsWork(me, 's-1')).rejects.toBeInstanceOf(ValidationError)
  })
  it('rejects a graded submission (score set) - the post-grading variant', async () => {
    vi.mocked(selectSubmissionStateAsService).mockResolvedValueOnce({ ...activeSub, score: 8 })
    await expect(assertSubmissionAcceptsWork(me, 's-1')).rejects.toBeInstanceOf(ValidationError)
  })
  it('rejects a graded submission (graded_at set)', async () => {
    vi.mocked(selectSubmissionStateAsService).mockResolvedValueOnce({ ...activeSub, graded_at: '2024-01-01T00:00:00Z' })
    await expect(assertSubmissionAcceptsWork(me, 's-1')).rejects.toBeInstanceOf(ValidationError)
  })
  it('404s when the assignment is archived/missing', async () => {
    vi.mocked(selectSubmissionStateAsService).mockResolvedValueOnce(activeSub)
    vi.mocked(selectAssignmentStateAsService).mockResolvedValueOnce(null)
    await expect(assertSubmissionAcceptsWork(me, 's-1')).rejects.toBeInstanceOf(NotFoundError)
  })
  it('rejects once a HARD deadline has passed (the core exploit)', async () => {
    vi.mocked(selectSubmissionStateAsService).mockResolvedValueOnce(activeSub)
    vi.mocked(selectAssignmentStateAsService).mockResolvedValueOnce({
      ...openAssignment,
      enforce_deadline: true,
      due_date: '2000-01-01T00:00:00Z',
    })
    await expect(assertSubmissionAcceptsWork(me, 's-1')).rejects.toBeInstanceOf(ValidationError)
  })
  it('allows own + active + ungraded + open assignment', async () => {
    vi.mocked(selectSubmissionStateAsService).mockResolvedValueOnce(activeSub)
    vi.mocked(selectAssignmentStateAsService).mockResolvedValueOnce(openAssignment)
    await expect(assertSubmissionAcceptsWork(me, 's-1')).resolves.toBeUndefined()
  })
  it('allows past-due work when enforce_deadline is false (late work still accepted)', async () => {
    vi.mocked(selectSubmissionStateAsService).mockResolvedValueOnce(activeSub)
    vi.mocked(selectAssignmentStateAsService).mockResolvedValueOnce({
      ...openAssignment,
      enforce_deadline: false,
      due_date: '2000-01-01T00:00:00Z',
    })
    await expect(assertSubmissionAcceptsWork(me, 's-1')).resolves.toBeUndefined()
  })
})

describe('assertMayAttachToResource (Vuln 3 - a replacement is an edit, not a bare upload)', () => {
  const resource = { class_id: 'c-1', uploaded_by: 'tutor-1', visibility: 'class' as const, status: 'active' as const }
  beforeEach(() => {
    vi.mocked(assertClassActive).mockResolvedValue(undefined)
    vi.mocked(assertCanDocument).mockResolvedValue(undefined)
    vi.mocked(selectActiveAttachmentsForOwner).mockResolvedValue([])
  })

  it('404s a missing resource', async () => {
    vi.mocked(selectResourceForAttachAsService).mockResolvedValueOnce(null)
    await expect(assertMayAttachToResource(me, 'r-1')).rejects.toBeInstanceOf(NotFoundError)
  })
  it('rejects a resource with no class', async () => {
    vi.mocked(selectResourceForAttachAsService).mockResolvedValueOnce({ ...resource, class_id: null })
    await expect(assertMayAttachToResource(me, 'r-1')).rejects.toBeInstanceOf(PermissionError)
  })
  it('rejects an archived document', async () => {
    vi.mocked(selectResourceForAttachAsService).mockResolvedValueOnce({ ...resource, status: 'archived' })
    await expect(assertMayAttachToResource(me, 'r-1')).rejects.toBeInstanceOf(ValidationError)
  })
  it('refuses a document on an archived class', async () => {
    vi.mocked(selectResourceForAttachAsService).mockResolvedValueOnce(resource)
    vi.mocked(assertClassActive).mockRejectedValueOnce(new ValidationError('That class is archived.'))
    await expect(assertMayAttachToResource(me, 'r-1')).rejects.toBeInstanceOf(ValidationError)
  })
  it('authorizes the FIRST attach as upload and reports NOT a replacement', async () => {
    vi.mocked(selectResourceForAttachAsService).mockResolvedValueOnce(resource)
    vi.mocked(selectActiveAttachmentsForOwner).mockResolvedValueOnce([])
    expect(await assertMayAttachToResource(me, 'r-1')).toBe(false)
    expect(assertCanDocument).toHaveBeenCalledWith(
      me,
      'upload',
      expect.objectContaining({ class_id: 'c-1', uploaded_by: 'tutor-1' }),
    )
  })
  it('authorizes a REPLACEMENT as edit (own rule) and reports a replacement', async () => {
    vi.mocked(selectResourceForAttachAsService).mockResolvedValueOnce(resource)
    vi.mocked(selectActiveAttachmentsForOwner).mockResolvedValueOnce([{ id: 'att-1' } as never])
    expect(await assertMayAttachToResource(me, 'r-1')).toBe(true)
    expect(assertCanDocument).toHaveBeenCalledWith(
      me,
      'edit',
      expect.objectContaining({ uploaded_by: 'tutor-1', visibility: 'class' }),
    )
  })
})
