import { redirect } from 'next/navigation'
import { requireCapability } from '@/lib/auth/require-role'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { loadClassroomPageData } from '@/lib/services/page-data/classroom'
import { StudentGroup } from '../classroom/StudentGroup'
import { ClassCard } from '../classroom/ClassCard'
import { EmptyState, FilterBar, PageHeader, PaginationBar, SearchFilterField } from '@/lib/ui'

/** A /grading URL carrying the search, so paging never drops it. */
function gradingUrl(q: string, page: number): string {
  const sp = new URLSearchParams()
  if (q) sp.set('q', q)
  if (page > 1) sp.set('page', String(page))
  const query = sp.toString()
  return query ? `/grading?${query}` : '/grading'
}

export default async function GradingPage(props: { searchParams?: Promise<{ page?: string; q?: string }> }) {
  const searchParams = await props.searchParams
  // Gate on viewGrading (what the nav decides on), not viewClasses - otherwise a
  // viewClasses-only holder could reach the grading landing the nav never showed them.
  const me = await requireCapability('viewGrading')
  const flags = await loadPersonaFlags(me.id)

  if (flags.isStudent) {
    redirect('/grades')
  }

  // Everyone left (tutor, mentor, admin) thinks student-first, so the grading landing reads
  // as "each student, then the subjects to mark" - the same per-student grouping as the
  // Classes list. It now shares that list's LOADER too, which means it inherits the paging
  // and the name search rather than rendering every class in the academy as a card wall:
  // this called listMyClasses, and for an admin that is every class, unpaged and unfiltered.
  // extras: false - this landing renders neither tag chips nor the "no student" section, and
  // computing them here is round trips whose results are discarded.
  const data = await loadClassroomPageData(me, { page: searchParams?.page, q: searchParams?.q }, { extras: false })
  const { filters, groups, subjectByClass, total, totalPages: pages } = data

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Grading"
        description="Open a class to review submissions and record marks in its grading tab."
      />

      <FilterBar
        className="mb-4 mt-2"
        clearHref="/grading"
        showClear={Boolean(filters.q)}
        hidden={total === 0 && !filters.q}
      >
        <SearchFilterField label="Student" name="q" defaultValue={filters.q} placeholder="Student name..." />
      </FilterBar>

      {total === 0 ? (
        <EmptyState>
          {filters.q ? 'No students match that search.' : 'No classes are available for grading yet.'}
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <StudentGroup
              key={g.key}
              label={g.label}
              subjectCount={g.classes.length}
              missingSubject={g.classes.some((c) => !c.subject_id)}
              // Always open. This landing exists to pick a class to grade, so its cards are the content,
              // not detail to disclose - collapsed, a reader lands on a page with nothing to click.
              open
            >
              {g.classes.map((course) => (
                <ClassCard
                  key={course.id}
                  c={course}
                  grouped
                  subjectName={subjectByClass.get(course.id) ?? course.name}
                  href={`/classroom/${course.id}/grading`}
                  actionLabel="Open grading"
                />
              ))}
            </StudentGroup>
          ))}
        </div>
      )}

      <PaginationBar
        page={filters.page}
        totalPages={pages}
        total={total}
        label="students"
        previousHref={filters.page > 1 ? gradingUrl(filters.q, filters.page - 1) : undefined}
        nextHref={filters.page < pages ? gradingUrl(filters.q, filters.page + 1) : undefined}
        className="mt-4"
      />
    </main>
  )
}
