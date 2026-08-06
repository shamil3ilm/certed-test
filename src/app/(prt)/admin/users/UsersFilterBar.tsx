import {
  ROLE_FILTERS,
  STATUS_OPTIONS,
  usersUrl,
  type RoleFilter,
  type UsersTab,
} from '@/lib/services/page-data/admin-users'
import { FilterBar, SearchFilterField, SelectFilterField } from '@/lib/ui'

/** Role + search + status + sort for the People list, all in one Apply. The tab
 *  travels as a hidden field so filtering keeps you on the People list; Role is
 *  what narrows it (default "All roles"), so you never need to know someone's
 *  role to find them. */
export function UsersFilterBar({
  tab,
  role,
  q,
  status,
  sortBy,
  sortOrder,
}: {
  tab: UsersTab
  role: RoleFilter
  q?: string
  status?: string
  sortBy?: string
  sortOrder?: string
}) {
  return (
    <FilterBar
      className="mt-4"
      clearHref={usersUrl({ tab })}
      showClear={Boolean(role !== 'all' || q || status || sortBy || sortOrder)}
    >
      <input type="hidden" name="tab" value={tab} />
      <SelectFilterField label="Role" name="role" defaultValue={role}>
        {ROLE_FILTERS.map((r) => (
          <option key={r.key} value={r.key}>
            {r.label}
          </option>
        ))}
      </SelectFilterField>
      <SearchFilterField name="q" defaultValue={q ?? ''} placeholder="Name or email..." />
      <SelectFilterField label="Status" name="status" defaultValue={status ?? ''}>
        <option value="">All</option>
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </SelectFilterField>
      <SelectFilterField label="Sort by" name="sortBy" defaultValue={sortBy ?? 'created_at'}>
        <option value="created_at">Date added</option>
        <option value="name">Name</option>
        <option value="email">Email</option>
      </SelectFilterField>
      <SelectFilterField label="Order" name="sortOrder" defaultValue={sortOrder ?? 'desc'}>
        <option value="desc">Newest first</option>
        <option value="asc">Oldest first</option>
      </SelectFilterField>
    </FilterBar>
  )
}
