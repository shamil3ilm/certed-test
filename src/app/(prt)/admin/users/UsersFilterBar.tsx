import { STATUS_OPTIONS, usersUrl, type RoleFilter, type UsersTab } from '@/lib/services/page-data/admin-users'
import { FilterBar, SearchFilterField, SelectFilterField, SortFilterField } from '@/lib/ui'

/** Search + status + sort for the People list, all in one Apply. Role is the tab strip above,
 *  and rides along as a hidden field; tab does too, so filtering keeps you on the People list
 *  and within the role you are reading. */
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
    // Clearing empties the bar but keeps the role tab: the tab is where the reader is, not a
    // filter they set here.
    <FilterBar
      className="mt-4"
      clearHref={usersUrl({ tab, role })}
      showClear={Boolean(q || status || sortBy || sortOrder)}
    >
      <input type="hidden" name="tab" value={tab} />
      {/* Role is chosen by the tab strip above the bar, not here. It travels as a hidden field so
          searching or sorting stays within the role the reader is looking at. */}
      <input type="hidden" name="role" value={role} />
      <SearchFilterField name="q" defaultValue={q ?? ''} placeholder="Name or email..." />
      <SelectFilterField label="Status" name="status" defaultValue={status ?? ''}>
        <option value="">All</option>
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </SelectFilterField>
      <SortFilterField
        label="Sort by"
        name="sortBy"
        defaultValue={sortBy ?? 'created_at'}
        options={[
          { value: 'created_at', label: 'Date added' },
          { value: 'name', label: 'Name' },
          { value: 'email', label: 'Email' },
        ]}
      />
      <SortFilterField
        label="Order"
        name="sortOrder"
        defaultValue={sortOrder ?? 'desc'}
        options={[
          { value: 'desc', label: 'Newest first' },
          { value: 'asc', label: 'Oldest first' },
        ]}
      />
    </FilterBar>
  )
}
