import type { Profile } from '@/lib/auth/profile'
import { parsePageParam, totalPages } from '@/lib/pagination'
import { canManageClass } from '@/lib/permission'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { listAnnouncementsForClassPage, type Announcement } from '@/lib/services/announcements'
import { listCommentsForEntities, type Comment } from '@/lib/services/comments'

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
  commentsByAnnouncement: Map<string, Comment[]>
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

  const [activePage, archivedPage] = await Promise.all([
    listAnnouncementsForClassPage(course.id, {
      page: streamPage,
      pageSize: STREAM_PAGE_SIZE,
      status: 'active',
      search: streamQ,
    }),
    canManage
      ? listAnnouncementsForClassPage(course.id, { page: 1, pageSize: ARCHIVED_PAGE_SIZE, status: 'archived' })
      : Promise.resolve({ items: [], total: 0 }),
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
  // Every visible post is threadable (announcements are the 4th comment entity):
  // load the threads for the posts on this page. Archived posts stay thread-less.
  const commentsByAnnouncement = await listCommentsForEntities(
    'announcement',
    activeAnnouncements.map((a) => a.id),
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
    commentsByAnnouncement,
  }
}
