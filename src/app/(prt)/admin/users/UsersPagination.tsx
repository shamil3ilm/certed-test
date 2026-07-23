import Link from 'next/link'
import { USERS_PAGE_SIZE, usersUrl, type UsersTab } from '@/lib/services/page-data/admin-users'

/** Page-through for the users list. Renders nothing when everything fits on one
 *  page, so the caller doesn't have to check. */
export function UsersPagination({
  tab,
  page,
  total,
  q,
  status,
  sortBy,
  sortOrder,
}: {
  tab: UsersTab
  page: number
  total: number
  q?: string
  status?: string
  sortBy?: string
  sortOrder?: string
}) {
  const totalPages = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE))
  if (totalPages <= 1) return null
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
      <span>
        Page {page} of {totalPages} - {total} total
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link href={usersUrl({ tab, page: page - 1, q, status, sortBy, sortOrder })} className="btn btn-sm btn-soft">
            Previous
          </Link>
        )}
        {page < totalPages && (
          <Link href={usersUrl({ tab, page: page + 1, q, status, sortBy, sortOrder })} className="btn btn-sm btn-soft">
            Next
          </Link>
        )}
      </div>
    </div>
  )
}
