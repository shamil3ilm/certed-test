import type { Profile } from '@/lib/auth/profile'
import { parsePageParam } from '@/lib/pagination'
import { isAdminTier } from '@/lib/capabilities'
import { activeTeachingProfileIds, activeMentorProfileIds } from '@/lib/services/class-tutors'
import { listMentorshipsForUsersHub } from '@/lib/services/mentorships'
import {
  countUsersHubStats,
  displayName,
  getProfilesByIds,
  listActiveMentorCandidates,
  listProfilesByRole,
  type ProfileLite,
} from '@/lib/services/users'

export const USERS_PAGE_SIZE = 20
export const STATUS_OPTIONS = ['active', 'pending', 'disabled'] as const
type UsersStatus = (typeof STATUS_OPTIONS)[number]
type UsersSortBy = 'name' | 'email' | 'created_at'
type UsersSortOrder = 'asc' | 'desc'
export type UsersTab = 'people' | 'mentors'
export type RoleFilter = 'all' | 'staff' | 'student' | 'tutor' | 'mentor' | 'admin'

export const USER_TABS: { key: UsersTab; label: string }[] = [
  // One account list for everyone - the Role filter narrows it, so you never have
  // to know a person's role to find them. The 'mentors' tab is the separate
  // student<->mentor ASSIGNMENT view, not an account list.
  { key: 'people', label: 'People' },
  { key: 'mentors', label: 'Mentor assignments' },
]

/** Role narrowing for the People list. 'admin' spans the admin tier (admin +
 *  sub_admin); the rest map to a single account role. */
export const ROLE_FILTERS: { key: RoleFilter; label: string }[] = [
  { key: 'all', label: 'All roles' },
  { key: 'staff', label: 'Tutors & mentors' },
  { key: 'student', label: 'Students' },
  { key: 'tutor', label: 'Tutors' },
  { key: 'mentor', label: 'Mentors' },
  { key: 'admin', label: 'Admins' },
]

const ROLE_FILTER_KEYS = ROLE_FILTERS.map((r) => r.key)
// Convenience aliases: a ?tab=students|tutors|admins link opens the People list
// pre-filtered to that role, so those hrefs and bookmarks resolve directly.
const TAB_ROLE_ALIASES: Record<string, RoleFilter> = { students: 'student', tutors: 'staff', admins: 'admin' }

type UsersPageFilters = {
  tab: UsersTab
  role: RoleFilter
  page: number
  q?: string
  status?: UsersStatus
  sortBy?: UsersSortBy
  sortOrder?: UsersSortOrder
}

type UsersHubMentorLink = {
  id: string
  mentor_id: string
  student_id: string
}

export type AdminUsersPageData = {
  isSuper: boolean
  roleOptions: string[]
  filters: UsersPageFilters
  stats: Awaited<ReturnType<typeof countUsersHubStats>>
  mentorCandidates: { id: string; name: string }[]
  tabProfiles: Profile[]
  tabTotal: number
  assignedStudents: number
  mentorNames: Map<string, string>
  mentorsByStudent: Map<string, UsersHubMentorLink[]>
  teachingStaffIds: Set<string>
  mentoringStaffIds: Set<string>
}

export function usersUrl(params: {
  tab: UsersTab
  role?: RoleFilter
  page?: number
  q?: string
  status?: string
  sortBy?: string
  sortOrder?: string
}): string {
  const sp = new URLSearchParams()
  sp.set('tab', params.tab)
  // 'all' is the default; omit it so the canonical URL stays clean.
  if (params.role && params.role !== 'all') sp.set('role', params.role)
  if (params.page && params.page > 1) sp.set('page', String(params.page))
  if (params.q) sp.set('q', params.q)
  if (params.status) sp.set('status', params.status)
  if (params.sortBy) sp.set('sortBy', params.sortBy)
  if (params.sortOrder) sp.set('sortOrder', params.sortOrder)
  return `/admin/users?${sp.toString()}`
}

function parseFilters(searchParams: {
  tab?: string
  role?: string
  page?: string
  q?: string
  status?: string
  sortBy?: string
  sortOrder?: string
}): UsersPageFilters {
  const rawTab = searchParams.tab
  let tab: UsersTab
  let role: RoleFilter
  if (rawTab === 'mentors') {
    tab = 'mentors'
    role = 'all'
  } else if (rawTab && rawTab in TAB_ROLE_ALIASES) {
    // A ?tab=students|tutors|admins link opens People pre-filtered to that role.
    tab = 'people'
    role = TAB_ROLE_ALIASES[rawTab]
  } else {
    tab = 'people'
    role = ROLE_FILTER_KEYS.includes(searchParams.role as RoleFilter) ? (searchParams.role as RoleFilter) : 'all'
  }
  return {
    tab,
    role,
    page: parsePageParam(searchParams.page),
    q: searchParams.q?.trim() || undefined,
    status: STATUS_OPTIONS.includes(searchParams.status as UsersStatus)
      ? (searchParams.status as UsersStatus)
      : undefined,
    sortBy: ['name', 'email', 'created_at'].includes(searchParams.sortBy ?? '')
      ? (searchParams.sortBy as UsersSortBy)
      : undefined,
    sortOrder: ['asc', 'desc'].includes(searchParams.sortOrder ?? '')
      ? (searchParams.sortOrder as UsersSortOrder)
      : undefined,
  }
}

// The roles a sub_admin (non-super) may ever see in the People list - the same
// tier they may manage (SUB_ADMIN_MANAGEABLE: tutor/mentor/student). Any requested
// filter is intersected with this, so a sub_admin cannot list the ADMIN tier by
// picking (or hand-editing) a role filter. A full admin (isSuper) sees the
// unclamped set. Kept in lockstep with SUB_ADMIN_MANAGEABLE so the list shows
// exactly the accounts a sub_admin may open and manage.
const SUB_ADMIN_VISIBLE_ROLES: ReadonlyArray<Profile['role']> = ['student', 'tutor', 'mentor']

function rolesForFilter(role: RoleFilter, isSuper: boolean): Profile['role'] | ReadonlyArray<Profile['role']> {
  const requested: Profile['role'] | ReadonlyArray<Profile['role']> = (() => {
    switch (role) {
      case 'staff':
        return ['tutor', 'mentor']
      case 'student':
        return 'student'
      case 'tutor':
        return 'tutor'
      case 'mentor':
        return 'mentor'
      case 'admin':
        return ['admin', 'sub_admin']
      default:
        return ['student', 'tutor', 'mentor', 'admin', 'sub_admin']
    }
  })()
  if (isSuper) return requested
  const requestedList = Array.isArray(requested) ? requested : [requested as Profile['role']]
  return requestedList.filter((r) => SUB_ADMIN_VISIBLE_ROLES.includes(r))
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
    role?: string
    page?: string
    q?: string
    status?: string
    sortBy?: string
    sortOrder?: string
  },
): Promise<AdminUsersPageData> {
  const filters = parseFilters(searchParams)
  // Hard-rule identity (manageAdminTier is never override-granted), so the Profile
  // overload already equals the resolved answer - no resolved-set threading needed.
  const isSuper = isAdminTier(me)
  // Only a full admin creates the admin tier (sub_admin / admin); a sub_admin creates
  // every other non-admin account - students, tutors, and mentors (matches
  // canManageTarget / SUB_ADMIN_MANAGEABLE).
  const roleOptions = isSuper ? ['student', 'tutor', 'mentor', 'sub_admin', 'admin'] : ['student', 'tutor', 'mentor']

  // The Mentor-assignments tab is student-centric (each row is a student + their
  // mentor links), so it always loads students regardless of the People role filter.
  const rolesToLoad = filters.tab === 'mentors' ? 'student' : rolesForFilter(filters.role, isSuper)
  const [stats, mentorCandidates, links, { items: tabProfiles, total: tabTotal }] = await Promise.all([
    countUsersHubStats(),
    listActiveMentorCandidates(),
    listMentorshipsForUsersHub(),
    listProfilesByRole(rolesToLoad, {
      page: filters.page,
      pageSize: USERS_PAGE_SIZE,
      search: filters.q,
      status: filters.status,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    }),
  ])

  const mentorProfiles = await getProfilesByIds([...new Set(links.map((l) => l.mentor_id))])
  const mentorNames = new Map([...mentorProfiles].map(([id, p]: [string, ProfileLite]) => [id, displayName(p)]))
  const mentorsByStudent = groupMentorsByStudent(links as UsersHubMentorLink[])
  const staffIds = tabProfiles.map((profile) => profile.id)
  const [teachingStaffIds, mentoringStaffIds] = await Promise.all([
    activeTeachingProfileIds(staffIds).then((r) => new Set(r)),
    activeMentorProfileIds(staffIds).then((r) => new Set(r)),
  ])

  return {
    isSuper,
    roleOptions,
    filters,
    stats,
    mentorCandidates,
    tabProfiles,
    tabTotal,
    assignedStudents: new Set(links.map((l) => l.student_id)).size,
    mentorNames,
    mentorsByStudent,
    teachingStaffIds,
    mentoringStaffIds,
  }
}
