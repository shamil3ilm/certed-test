import type { Profile } from '@/lib/auth/profile'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { listAnnouncementsForClassPage, type Announcement } from '@/lib/services/announcements'
import { listCommentsForEntities, type Comment } from '@/lib/services/comments'
import { listMeetLinks, type MeetLink } from '@/lib/services/meet-links'

const STREAM_PAGE_SIZE = 10
const ARCHIVED_PAGE_SIZE = 20

export type ClassStreamSearchParams = { streamPage?: string; streamQ?: string }

export type ClassStreamViewData = {
  canManage: boolean
  isAdmin: boolean
  streamPage: number
  streamQ?: string
  streamTotal: number
  streamTotalPages: number
  activeAnnouncements: Announcement[]
  archivedAnnouncements: Announcement[]
  meetLinks: MeetLink[]
  archivedMeetLinks: MeetLink[]
  commentsByMeet: Map<string, Comment[]>
  classList: { id: string; name: string }[]
}

export function classStreamPageUrl(page: number, search?: string): string {
  const sp = new URLSearchParams()
  if (page > 1) sp.set('streamPage', String(page))
  if (search) sp.set('streamQ', search)
  const query = sp.toString()
  return query ? `?${query}` : '?'
}

function canManageAnnouncement(
  canManage: boolean,
  isAdmin: boolean,
  courseId: string,
  classId: string | null,
): boolean {
  return canManage && (isAdmin || classId === courseId)
}

export async function loadClassStreamViewData(
  me: Pick<Profile, 'id' | 'role' | 'email' | 'full_name'>,
  course: { id: string; name: string },
  searchParams?: ClassStreamSearchParams,
): Promise<ClassStreamViewData> {
  const { isAdmin, isManager } = await loadPersonaFlags(me.id)
  const canManage = isManager
  const streamPage = Math.max(1, Number(searchParams?.streamPage ?? '1') || 1)
  const streamQ = searchParams?.streamQ?.trim() || undefined

  const [activePage, archivedPage, allMeetLinks] = await Promise.all([
    listAnnouncementsForClassPage(course.id, {
      page: streamPage,
      pageSize: STREAM_PAGE_SIZE,
      status: 'active',
      search: streamQ,
    }),
    canManage
      ? listAnnouncementsForClassPage(course.id, { page: 1, pageSize: ARCHIVED_PAGE_SIZE, status: 'archived' })
      : Promise.resolve({ items: [], total: 0 }),
    listMeetLinks(course.id, canManage),
  ])

  const activeAnnouncements = activePage.items
  const archivedAnnouncements = archivedPage.items.filter((a) =>
    canManageAnnouncement(canManage, isAdmin, course.id, a.class_id),
  )
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
    isAdmin,
    streamPage,
    streamQ,
    streamTotal: activePage.total,
    streamTotalPages: Math.max(1, Math.ceil(activePage.total / STREAM_PAGE_SIZE)),
    activeAnnouncements,
    archivedAnnouncements,
    meetLinks,
    archivedMeetLinks,
    commentsByMeet,
    classList: [{ id: course.id, name: course.name }],
  }
}
