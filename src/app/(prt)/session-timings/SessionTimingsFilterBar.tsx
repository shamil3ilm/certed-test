import { DateFilterField, FilterBar, SelectFilterField } from '@/lib/ui'
import { sessionTimingsUrl, type SessionTimingsPageData } from '@/lib/services/page-data/session-timings'

/** Student, subject, tutor and a date range, all in one Apply.
 *
 *  Every control narrows on a column of class_sessions itself, so applying a filter
 *  re-queries rather than re-filtering rows already on screen - which is what lets the list
 *  page correctly no matter how many sessions the academy has recorded.
 *
 *  `classId` is deliberately NOT a control: it can arrive in the URL from a class page, and
 *  it survives an Apply through the hidden field so drilling in then narrowing by date keeps
 *  both. */
export function SessionTimingsFilterBar({
  filters,
  options,
  hasActiveFilters,
}: Pick<SessionTimingsPageData, 'filters' | 'options' | 'hasActiveFilters'>) {
  return (
    <FilterBar className="mt-2" clearHref="/session-timings" showClear={hasActiveFilters}>
      {filters.classId && <input type="hidden" name="classId" value={filters.classId} />}
      <SelectFilterField label="Student" name="student" defaultValue={filters.student}>
        <option value="">All students</option>
        {options.students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </SelectFilterField>
      <SelectFilterField label="Subject" name="subject" defaultValue={filters.subject}>
        <option value="">All subjects</option>
        {options.subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </SelectFilterField>
      <SelectFilterField label="Tutor" name="tutor" defaultValue={filters.tutor}>
        <option value="">All tutors</option>
        {options.tutors.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </SelectFilterField>
      <DateFilterField label="From" name="from" defaultValue={filters.from} />
      <DateFilterField label="To" name="to" defaultValue={filters.to} />
    </FilterBar>
  )
}

/** The pager's hrefs, carrying every active filter so paging never silently drops one. */
export function sessionTimingsPageHref(filters: SessionTimingsPageData['filters'], page: number): string {
  return sessionTimingsUrl(filters, { page })
}
