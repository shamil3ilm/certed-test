import type { Profile } from '@/lib/auth/profile'
import { parsePageParam, totalPages } from '@/lib/pagination'
import { canManageClass } from '@/lib/permission'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { listAnnouncementsForClassPage, type Announcement } from '@/lib/services/announcements'
import { listCommentsForEntities, type Comment } from '@/lib/services/comments'
import { listMeetLinks, type MeetLink } from '@/lib/services/meet-links'

const STREAM_PAGE_SIZE = 10
const ARCHIVED_PAGE_SIZE = 20

type ClassStreamSearchParams = { streamPage?: string; streamQ?: string }

type ClassStreamViewData = {
  canManage: boolean
  canManageContent: boolean
  isAdmin: boolean
  isArchived: boolean
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
  me: Profile,
  course: { id: string; name: string; status: 'active' | 'archived' },
  searchParams?: ClassStreamSearchParams,
): Promise<ClassStreamViewData> {
  const [{ isAdmin }, canManage] = await Promise.all([loadPersonaFlags(me.id), canManageClass(me, course.id)])
  const isArchived = course.status === 'archived'
  const canManageContent = canManage && !isArchived
  const streamPage = parsePageParam(searchParams?.streamPage)
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

  // An out-of-range ?streamPage= (stale/shared/hand-edited URL) would otherwise show
  // a blank posts list with no empty-state and no pager. Clamp to the last real page
  // and refetch so the user lands on content with a working pager instead.
  const streamTotalPages = totalPages(activePage.total, STREAM_PAGE_SIZE)
  const effStreamPage = Math.min(streamPage, streamTotalPages)
  const active =
    effStreamPage === streamPage
      ? activePage
      : await listAnnouncementsForClassPage(course.id, {
          page: effStreamPage,
          pageSize: STREAM_PAGE_SIZE,
          status: 'active',
          search: streamQ,
        })

  const activeAnnouncements = active.items
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
    canManageContent,
    isAdmin,
    isArchived,
    streamPage: effStreamPage,
    streamQ,
    streamTotal: active.total,
    streamTotalPages,
    activeAnnouncements,
    archivedAnnouncements,
    meetLinks,
    archivedMeetLinks,
    commentsByMeet,
    classList: [{ id: course.id, name: course.name }],
  }
}
