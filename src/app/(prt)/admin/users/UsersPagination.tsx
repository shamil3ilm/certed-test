import { totalPages as pageCount } from '@/lib/pagination'
import { USERS_PAGE_SIZE, usersUrl, type RoleFilter, type UsersTab } from '@/lib/services/page-data/admin-users'
import { PaginationBar } from '@/lib/ui'

/** Page-through for the users list. Renders nothing when everything fits on one
 *  page, so the caller doesn't have to check. */
export function UsersPagination({
  tab,
  role,
  page,
  total,
  q,
  status,
  sortBy,
  sortOrder,
}: {
  tab: UsersTab
  role: RoleFilter
  page: number
  total: number
  q?: string
  status?: string
  sortBy?: string
  sortOrder?: string
}) {
  const totalPages = pageCount(total, USERS_PAGE_SIZE)
  return (
    <PaginationBar
      page={page}
      totalPages={totalPages}
      total={total}
      previousHref={page > 1 ? usersUrl({ tab, role, page: page - 1, q, status, sortBy, sortOrder }) : undefined}
      nextHref={page < totalPages ? usersUrl({ tab, role, page: page + 1, q, status, sortBy, sortOrder }) : undefined}
      className="mt-4"
    />
  )
}
