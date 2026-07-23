import { STATUS_OPTIONS, usersUrl, type UsersTab } from '@/lib/services/page-data/admin-users'
import { FilterBar, FilterField, FILTER_CONTROL, cx } from '@/lib/ui'

/** Search + status filter. The tab travels as a hidden field so filtering keeps
 *  you on the tab you were looking at. */
export function UsersFilterBar({ tab, q, status }: { tab: UsersTab; q?: string; status?: string }) {
  return (
    <FilterBar className="mt-4" clearHref={usersUrl({ tab })} showClear={Boolean(q || status)}>
      <input type="hidden" name="tab" value={tab} />
      <FilterField label="Search" className="min-w-0 flex-1 sm:max-w-xs">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Name or email..."
          className={cx(FILTER_CONTROL, 'w-full')}
        />
      </FilterField>
      <FilterField label="Status">
        <select name="status" defaultValue={status ?? ''} className={FILTER_CONTROL}>
          <option value="">All</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </FilterField>
    </FilterBar>
  )
}
