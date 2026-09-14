import type { Profile } from '@/lib/auth/profile'
import { canManageClass } from '@/lib/permission'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { listCommentsForEntities, type Comment } from '@/lib/services/comments'
import { listMeetLinks, type MeetLink } from '@/lib/services/meet-links'
import { withClassLabels } from '@/lib/services/classes/class-labels'

type ClassMeetViewData = {
  canManage: boolean
  canManageContent: boolean
  isAdmin: boolean
  isArchived: boolean
  meetLinks: MeetLink[]
  archivedMeetLinks: MeetLink[]
  commentsByMeet: Map<string, Comment[]>
  classList: { id: string; name: string }[]
}

/** Meeting links for a single class - its own tab now, so it loads independently
 *  of the announcement stream instead of riding along on the stream loader. */
export async function loadClassMeetViewData(
  me: Profile,
  course: { id: string; name: string; status: 'active' | 'archived'; subject_id: string | null },
): Promise<ClassMeetViewData> {
  const [{ isAdmin }, canManage] = await Promise.all([loadPersonaFlags(me.id), canManageClass(me, course.id)])
  const isArchived = course.status === 'archived'
  const canManageContent = canManage && !isArchived

  const allMeetLinks = await listMeetLinks(course.id, canManage)
  const meetLinks = allMeetLinks.filter((m) => m.active)
  const archivedMeetLinks = canManage
    ? allMeetLinks.filter((m) => !m.active && (isAdmin || m.class_id === course.id))
    : []
  const commentsByMeet = await listCommentsForEntities(
    'meet',
    meetLinks.map((m) => m.id),
  )

  return {
    canManage,
    canManageContent,
    isAdmin,
    isArchived,
    meetLinks,
    archivedMeetLinks,
    commentsByMeet,
    // The meet form's class option reads the live "Student - Subject", as the calendar's does, not
    // the name stored when the class was created.
    classList: (await withClassLabels([course], 'student-subject')).map((c) => ({ id: c.id, name: c.name })),
  }
}
