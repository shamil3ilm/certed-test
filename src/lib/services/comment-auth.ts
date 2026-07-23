import { selectResourceClassIdAsService } from '@/lib/data/resources'
import { selectMeetLinkClassIdAsService } from '@/lib/data/meet-links'
import { selectSubmissionOwnerAsService } from '@/lib/data/submissions'
import { selectAssignmentClassIdAsService } from '@/lib/data/assignments'
import { canAccessClass, canManageClass } from '@/lib/permission'
import { NotFoundError, PermissionError } from '@/lib/errors'
import type { Profile } from '@/lib/auth/profile'
import type { CommentEntity } from '@/lib/validation/comment'

const GONE = 'That item no longer exists.'
const NO_ACCESS = 'You do not have access to comment here.'

/**
 * Authorize a comment against its PARENT entity, app-side - not RLS-only. Every
 * other write path double-checks authorization inside the service; comments were
 * the lone "trust RLS" path, so a crafted POST (any entity_id, any entity_type)
 * could otherwise attach a comment to a foreign submission. The author must be
 * able to access the thing they're commenting on, mirroring each entity's read
 * rule:
 *   - resource / meet -> a member of its class (canAccessClass: admin, the
 *     class's tutor, or an enrolled student). A global meet (null class) is
 *     academy-wide, so any active class participant who reached here may comment.
 *   - submission -> the owning student, or a tutor/admin of its class - never a
 *     classmate (matches the submissions_read RLS rule).
 *
 * The parent is looked up with the service-role client so the decision is the
 * app's own, not a side effect of the caller's RLS visibility; a missing parent
 * (including an entity_id that doesn't match entity_type) is a NotFoundError.
 */
export async function assertCanComment(actor: Profile, entityType: CommentEntity, entityId: string): Promise<void> {
  // Every lookup below is service-role on purpose: this function has to tell a
  // row that does not exist (NotFoundError) from one the caller merely cannot
  // see (PermissionError), and an RLS read returns the same empty result for
  // both - which would report every permission failure as a missing item.
  if (entityType === 'resource' || entityType === 'meet') {
    const parent =
      entityType === 'resource'
        ? await selectResourceClassIdAsService(entityId)
        : await selectMeetLinkClassIdAsService(entityId)
    if (!parent) throw new NotFoundError(GONE)
    if (parent.class_id === null) return // global item: academy-wide, comment allowed
    if (!(await canAccessClass(actor, parent.class_id))) throw new PermissionError(NO_ACCESS)
    return
  }

  // submission: only the owner student, or a tutor/admin of its class.
  const submission = await selectSubmissionOwnerAsService(entityId)
  if (!submission) throw new NotFoundError(GONE)
  if (submission.student_id === actor.id) return // own submission

  const assignment = await selectAssignmentClassIdAsService(submission.assignment_id)
  if (!assignment) throw new NotFoundError(GONE)
  if (!(await canManageClass(actor, assignment.class_id))) {
    throw new PermissionError('You do not have access to comment on this submission.')
  }
}
