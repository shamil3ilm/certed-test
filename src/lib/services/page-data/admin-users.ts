import type { Profile } from '@/lib/auth/profile'
import { isAdminTier } from '@/lib/capabilities'
import { listMentorshipsForUsersHub } from '@/lib/services/mentorships'
import {
  countUsersHubStats,
  displayName,
  getProfilesByIds,
  listActiveByRole,
  listProfilesByRole,
  type ProfileLite,
} from '@/lib/services/users'

export const USERS_PAGE_SIZE = 20
export const STATUS_OPTIONS = ['active', 'pending', 'disabled'] as const
export type UsersStatus = (typeof STATUS_OPTIONS)[number]
export type UsersSortBy = 'name' | 'email' | 'created_at'
export type UsersSortOrder = 'asc' | 'desc'
export type UsersTab = 'students' | 'tutors' | 'mentors' | 'admins'

export const USER_TABS: { key: UsersTab; label: string }[] = [
  { key: 'students', label: 'Students' },
  { key: 'tutors', label: 'Tutors' },
  { key: 'mentors', label: 'Mentors' },
  { key: 'admins', label: 'Admins' },
]

export type UsersPageFilters = {
  tab: UsersTab
  page: number
  q?: string
  status?: UsersStatus
  sortBy?: UsersSortBy
  sortOrder?: UsersSortOrder
}

export type UsersHubMentorLink = {
  id: string
  tutor_id: string
  student_id: string
}

export type AdminUsersPageData = {
  isSuper: boolean
  roleOptions: string[]
  filters: UsersPageFilters
  stats: Awaited<ReturnType<typeof countUsersHubStats>>
  activeTutors: { id: string; name: string }[]
  tabProfiles: Profile[]
  tabTotal: number
  assignedStudents: number
  mentorNames: Map<string, string>
  mentorsByStudent: Map<string, UsersHubMentorLink[]>
}

export function usersUrl(params: {
  tab: UsersTab
  page?: number
  q?: string
  status?: string
  sortBy?: string
  sortOrder?: string
}): string {
  const sp = new URLSearchParams()
  sp.set('tab', params.tab)
  if (params.page && params.page > 1) sp.set('page', String(params.page))
  if (params.q) sp.set('q', params.q)
  if (params.status) sp.set('status', params.status)
  if (params.sortBy) sp.set('sortBy', params.sortBy)
  if (params.sortOrder) sp.set('sortOrder', params.sortOrder)
  return `/admin/users?${sp.toString()}`
}

function parseFilters(searchParams: {
  tab?: string
  page?: string
  q?: string
  status?: string
  sortBy?: string
  sortOrder?: string
}): UsersPageFilters {
  return {
    tab: (USER_TABS.find((t) => t.key === searchParams.tab)?.key ?? 'students') as UsersTab,
    page: Math.max(1, Number(searchParams.page) || 1),
    q: searchParams.q?.trim() || undefined,
    status: STATUS_OPTIONS.includes(searchParams.status as UsersStatus) ? (searchParams.status as UsersStatus) : undefined,
    sortBy: ['name', 'email', 'created_at'].includes(searchParams.sortBy ?? '')
      ? (searchParams.sortBy as UsersSortBy)
      : undefined,
    sortOrder: ['asc', 'desc'].includes(searchParams.sortOrder ?? '')
      ? (searchParams.sortOrder as UsersSortOrder)
      : undefined,
  }
}

function roleForTab(tab: UsersTab): 'student' | 'tutor' | ReadonlyArray<'admin' | 'sub_admin'> {
  return tab === 'tutors' ? 'tutor' : tab === 'admins' ? ['admin', 'sub_admin'] : 'student'
}

function groupMentorsByStudent(links: UsersHubMentorLink[]): Map<string, UsersHubMentorLink[]> {
  const out = new Map<string, UsersHubMentorLink[]>()
  for (const link of links) {
    const list = out.get(link.student_id) ?? []
    list.push(link)
    out.set(link.student_id, list)
  }
  return out
}

export async function loadAdminUsersPageData(
  me: Profile,
  searchParams: {
    tab?: string
    page?: string
    q?: string
    status?: string
    sortBy?: string
    sortOrder?: string
  },
): Promise<AdminUsersPageData> {
  const filters = parseFilters(searchParams)
  const isSuper = isAdminTier(me)
  const roleOptions = isSuper ? ['student', 'tutor', 'sub_admin', 'admin'] : ['student', 'tutor']

  const [stats, activeTutors, links, { items: tabProfiles, total: tabTotal }] = await Promise.all([
    countUsersHubStats(),
    listActiveByRole('tutor'),
    listMentorshipsForUsersHub(),
    listProfilesByRole(roleForTab(filters.tab), {
      page: filters.page,
      pageSize: USERS_PAGE_SIZE,
      search: filters.q,
      status: filters.status,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    }),
  ])

  const mentorProfiles = await getProfilesByIds([...new Set(links.map((l) => l.tutor_id))])
  const mentorNames = new Map([...mentorProfiles].map(([id, p]: [string, ProfileLite]) => [id, displayName(p)]))
  const mentorsByStudent = groupMentorsByStudent(links as UsersHubMentorLink[])

  return {
    isSuper,
    roleOptions,
    filters,
    stats,
    activeTutors,
    tabProfiles,
    tabTotal,
    assignedStudents: new Set(links.map((l) => l.student_id)).size,
    mentorNames,
    mentorsByStudent,
  }
}
