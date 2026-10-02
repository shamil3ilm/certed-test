import 'server-only'
import { selectForEntities, type CommentEntity } from '@/lib/data/comments'
import { selectResourceClassIdAsService } from '@/lib/data/resources'
import { selectMeetLinkClassIdAsService } from '@/lib/data/meet-links'
import { selectAnnouncementClassIdAsService } from '@/lib/data/announcements'
import { selectSubmissionOwnerAsService } from '@/lib/data/submissions'
import { selectAssignmentClassIdAsService } from '@/lib/data/assignments'
import { notifyBestEffort, notifyClassRoleBestEffort } from '@/lib/services/notifications'
import { getClassMembers } from '@/lib/services/classes'
import { logError } from '@/lib/observability/log'

/** How much of the comment the notification carries, matching the announcement notice. */
const BODY_CHARS = 140

/**
 * Tell the other side of a comment thread that something was said in it.
 *
 * A grade notifies and a message notifies, so a thread attached to the work is the one place
 * where a person is addressed directly and hears nothing: a student asking about their feedback,
 * or a tutor answering, reaches a page nobody has a reason to reopen.
 *
 * Who is told depends on what the thread hangs from, and each rule is the notification side of
 * that entity's read rule (see comment-auth.ts - the same lookups, for the same reason):
 *
 *   SUBMISSION - two parties, so it is the OTHER one. The owner writes, the class's tutors hear;
 *     a tutor writes, the owner hears. Never a classmate: they cannot read the submission.
 *   RESOURCE / MEET / ANNOUNCEMENT - a class-wide item, where notifying the whole class on every
 *     comment would make the thread a reason to mute notifications. So: the people ALREADY IN
 *     the thread, which is what a reply is answering. The first comment on an item therefore
 *     notifies nobody, and that is right - nobody is waiting on it yet.
 *
 * Best-effort in full, including the lookups: the comment is committed before this runs, and a
 * posted comment must not fail because its notification could not be addressed.
 */
export async function notifyCommentThread(
  entityType: CommentEntity,
  entityId: string,
  authorId: string,
  content: string,
): Promise<void> {
  try {
    const body = content.slice(0, BODY_CHARS)
    if (entityType === 'submission') {
      await notifySubmissionThread(entityId, authorId, body)
      return
    }
    await notifyEntityThread(entityType, entityId, authorId, body)
  } catch (error) {
    logError('comments.notify', error, { entityType, entityId }, { toSentry: false })
  }
}

/** The submission's owner and the tutors of its class are the two sides. */
async function notifySubmissionThread(submissionId: string, authorId: string, body: string): Promise<void> {
  const submission = await selectSubmissionOwnerAsService(submissionId)
  if (!submission) return
  const assignment = await selectAssignmentClassIdAsService(submission.assignment_id)
  if (!assignment) return
  const link = `/classroom/${assignment.class_id}/classwork`

  if (submission.student_id === authorId) {
    await notifyClassRoleBestEffort(assignment.class_id, 'tutors', {
      kind: 'submission',
      title: 'New comment on a submission',
      body,
      link,
    })
    return
  }
  await notifyBestEffort([submission.student_id], {
    kind: 'submission',
    title: 'New comment on your work',
    body,
    link,
  })
}

const ENTITY_KIND = {
  resource: 'resource',
  // A meeting's own notice is an announcement (meet-links.ts), so its thread reads as one too.
  meet: 'announcement',
  announcement: 'announcement',
} as const

/**
 * Everyone who has already spoken in this thread, minus whoever just did - and minus anyone no
 * longer in the class.
 *
 * Commenting proves access at the time of commenting, not now: a student who has since been
 * unenrolled, or a tutor taken off the class, would otherwise be sent an excerpt of a thread they
 * can no longer open. The notification body carries comment text, so the recipient list has to be
 * decided by CURRENT membership, exactly as notifyClassRoleBestEffort does.
 */
async function notifyEntityThread(
  entityType: 'resource' | 'meet' | 'announcement',
  entityId: string,
  authorId: string,
  body: string,
): Promise<void> {
  const parent =
    entityType === 'resource'
      ? await selectResourceClassIdAsService(entityId)
      : entityType === 'meet'
        ? await selectMeetLinkClassIdAsService(entityId)
        : await selectAnnouncementClassIdAsService(entityId)
  if (!parent) return

  const rows = await selectForEntities(entityType, [entityId])
  const others = [...new Set(rows.map((row) => row.author_id))].filter((id) => id !== authorId)
  if (others.length === 0) return

  const recipients = await stillInTheClass(others, parent.class_id)
  if (recipients.length === 0) return

  await notifyBestEffort(recipients, {
    kind: ENTITY_KIND[entityType],
    title: 'New comment in a thread you commented on',
    body,
    // A global item (null class) belongs to no classroom page, so the feed itself is the link.
    link: parent.class_id === null ? '/notifications' : `/classroom/${parent.class_id}`,
  })
}

/**
 * Narrow a list of past commenters to those who can still read the thread.
 *
 * A GLOBAL item (null class) belongs to no class, so there is no membership to check and the
 * academy-wide rule that let them comment still holds.
 */
async function stillInTheClass(profileIds: string[], classId: string | null): Promise<string[]> {
  if (classId === null) return profileIds
  const members = await getClassMembers(classId)
  const current = new Set([...members.students, ...members.tutors].map((m) => m.id))
  return profileIds.filter((id) => current.has(id))
}
