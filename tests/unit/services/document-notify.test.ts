import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/notifications', () => ({ notifyBestEffort: vi.fn() }))
vi.mock('@/lib/services/classes', () => ({ getClassMembers: vi.fn() }))
vi.mock('@/lib/data/mentorships', () => ({ selectActiveMentorshipsForStudents: vi.fn() }))
vi.mock('@/lib/observability/log', () => ({ logError: vi.fn() }))

import { selectActiveMentorshipsForStudents } from '@/lib/data/mentorships'
import { logError } from '@/lib/observability/log'
import { getClassMembers } from '@/lib/services/classes'
import { notifyBestEffort } from '@/lib/services/notifications'
import { notifyClassOfDocument } from '@/lib/services/resources/notify'
import type { Document } from '@/lib/services/resources/queries'

const member = (id: string) => ({ id, rowId: `row-${id}`, name: id, email: `${id}@x`, role: 'student' as const })

const doc = (visibility: 'class' | 'staff'): Document =>
  ({
    id: 'doc-1',
    class_id: 'class-1',
    title: 'Term 1 paper',
    subject: 'Maths',
    category: 'general_documents',
    visibility,
  }) as Document

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getClassMembers).mockResolvedValue({
    tutors: [member('tutor-1'), member('tutor-2')],
    students: [member('stud-1')],
  } as never)
  vi.mocked(selectActiveMentorshipsForStudents).mockResolvedValue([
    { student_id: 'stud-1', mentor_id: 'mentor-1' },
  ] as never)
})

/**
 * A document reaches everyone who can read it: the students (class-visible only), the tutor beside
 * the uploader, and the mentor of the student it is for.
 */
describe('notifyClassOfDocument', () => {
  it('tells the students, the other tutors and the mentors of a class-visible document', async () => {
    await notifyClassOfDocument(doc('class'), 'New document', 'tutor-1')

    const link = '/classroom/class-1/classwork#materials'
    expect(notifyBestEffort).toHaveBeenCalledWith(['stud-1'], {
      kind: 'resource',
      title: 'New document: Term 1 paper',
      body: 'Maths',
      link,
    })
    // The uploader is not told about their own upload.
    expect(notifyBestEffort).toHaveBeenCalledWith(['tutor-2', 'mentor-1'], {
      kind: 'resource',
      title: 'New document: Term 1 paper',
      body: 'Maths',
      link,
    })
  })

  it('tells only staff about a staff-only document, and says so', async () => {
    await notifyClassOfDocument(doc('staff'), 'New document', 'tutor-1')

    expect(notifyBestEffort).toHaveBeenCalledTimes(1)
    expect(notifyBestEffort).toHaveBeenCalledWith(['tutor-2', 'mentor-1'], {
      kind: 'resource',
      title: 'New document: Term 1 paper',
      body: 'Staff only - Maths',
      link: '/classroom/class-1/classwork#materials',
    })
  })

  it('tells the uploading tutor when an admin edits their document', async () => {
    await notifyClassOfDocument(doc('class'), 'Updated document', 'admin-1')

    expect(notifyBestEffort).toHaveBeenCalledWith(
      ['tutor-1', 'tutor-2', 'mentor-1'],
      expect.objectContaining({ title: 'Updated document: Term 1 paper' }),
    )
  })

  it('never lets a student read the staff copy', async () => {
    vi.mocked(selectActiveMentorshipsForStudents).mockResolvedValue([
      { student_id: 'stud-1', mentor_id: 'stud-1' },
    ] as never)

    await notifyClassOfDocument(doc('staff'), 'New document', null)

    expect(notifyBestEffort).toHaveBeenCalledWith(['tutor-1', 'tutor-2'], expect.anything())
  })

  it('never throws into the write that triggered it', async () => {
    vi.mocked(getClassMembers).mockRejectedValue(new Error('db down'))

    await expect(notifyClassOfDocument(doc('class'), 'New document', 'tutor-1')).resolves.toBeUndefined()
    expect(logError).toHaveBeenCalled()
    expect(notifyBestEffort).not.toHaveBeenCalled()
  })
})
