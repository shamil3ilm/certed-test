import type { Profile } from '@/lib/auth/profile'
import { canManageClass } from '@/lib/permission'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { listCommentsForEntities, type Comment } from '@/lib/services/comments'
import { listMeetLinks, type MeetLink } from '@/lib/services/meet-links'

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
  course: { id: string; name: string; status: 'active' | 'archived' },
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
    classList: [{ id: course.id, name: course.name }],
  }
}
