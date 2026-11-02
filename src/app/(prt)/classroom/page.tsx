import { requireCapability } from '@/lib/auth/require-role'
import { listTags } from '@/lib/services/tags'
import { listSubjects } from '@/lib/services/subjects'
import { classroomUrl, loadClassroomPageData, type ClassroomSearchParams } from '@/lib/services/page-data/classroom'
import { listActiveProfilesByRoles, listAssignableStudents } from '@/lib/services/users/directory'
import {
  AlertBanner,
  PageHeader,
  EmptyState,
  PaginationBar,
  SearchFilterField,
  SectionLabel,
  FilterBar,
  SelectFilterField,
} from '@/lib/ui'

import { StudentGroup } from './StudentGroup'
import { AddSubjectModal } from './AddSubjectModal'
import { ClassCard } from './ClassCard'

export default async function ClassroomPage(props: { searchParams?: Promise<ClassroomSearchParams> }) {
  const searchParams = await props.searchParams
  const me = await requireCapability('viewClasses')
  // The Classes list pages by STUDENT, not by class: staff views group classes under the
  // student they are for, ordered by the student's name, and that ordering lives in
  // profiles/enrollments rather than on `classes`. Paging the roster puts the sort and the
  // search in SQL, and stops a student's subjects splitting across a page boundary.
  const [data, allTags, allSubjects] = await Promise.all([
    loadClassroomPageData(me, searchParams),
    listTags(),
    listSubjects(),
  ])
  const {
    filters,
    groups,
    ownClasses,
    unassigned,
    unassignedTotal,
    unassignedTruncated,
    groupByStudentView,
    hasActiveFilters,
    tagsByClass,
    subjectByClass,
    total,
    totalPages: pages,
    flags,
  } = data
  // A studentless class still counts as something to show, so the empty state must consider
  // both - otherwise an academy whose classes have all lost their student is told it has
  // no classes at all.
  const nothingToShow = total === 0 && unassigned.length === 0
  // Academy-wide class authority (admin or sub_admin) drives the "Add a subject" CTA,
  // the all-classes subtitle, and the create hint - not the admin tier specifically.
  const isAdmin = flags.isClassAdmin
  const isStudent = flags.isStudent
  const isTeacher = flags.isTutor

  // The pickers inside the Add-a-subject dialog, and nothing else on this page, need these two
  // lists - so they are fetched only for the reader who gets the button. This page is also
  // served to every student and tutor, and reading the whole student directory for someone who
  // will never see the dialog is a wasted round trip on every page view.
  //
  // A second, guarded step rather than another leg of the Promise.all above: the condition
  // (flags.isClassAdmin) is itself one of that call's results, so it cannot be known earlier.
  const [studentOptions, staffOptions] = isAdmin
    ? // Students: PENDING ones too. Setting a new student's subjects up before they have ever
      // signed in is the ordinary onboarding order, and addSubjectToStudent accepts them -
      // an active-only picker would hide exactly the students this dialog is most used for.
      // Tutors: active only, because a pending tutor cannot yet be given work.
      await Promise.all([listAssignableStudents(), listActiveProfilesByRoles(['tutor', 'mentor'])])
    : [[], []]

  // Student and tutor are mutually exclusive (role is fixed and single; a student
  // is never granted a tutor persona and vice-versa), so there is no learner+teacher
  // hybrid to caption for.
  const subtitle = isAdmin
    ? 'All classes across the academy.'
    : isStudent
      ? 'The classes you are enrolled in.'
      : isTeacher
        ? 'Your students and the classes you teach them.'
        : 'The classes available to you.'

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Classes"
        description={subtitle}
        action={
          isAdmin ? (
            <AddSubjectModal
              students={studentOptions.map((s) => ({ id: s.id, name: s.full_name ?? s.email }))}
              // The picker offers tutors AND mentors, so it carries the role: assigning someone
              // to teach attributes their sessions and their hours, which reach payslips, and a
              // name on its own does not say which kind of account is being chosen.
              tutors={staffOptions.map((t) => ({ id: t.id, name: t.full_name ?? t.email, role: t.role }))}
              subjectNames={allSubjects.map((s) => s.name)}
            />
          ) : undefined
        }
      />

      {searchParams?.error === '1' && (
        <AlertBanner className="mb-4">That change couldn&apos;t be applied. Please try again.</AlertBanner>
      )}

      {(allSubjects.length > 0 || allTags.length > 0 || groupByStudentView) && (
        <FilterBar
          className="mb-4"
          clearHref="/classroom"
          showClear={data.hasActiveFilters}
          hidden={nothingToShow && !data.hasActiveFilters}
        >
          {/* Searching the ROSTER, which is what this list is paged by - so the field says
              so rather than implying it searches class names. */}
          {groupByStudentView && (
            <SearchFilterField label="Student" name="q" defaultValue={filters.q} placeholder="Student name..." />
          )}
          {allSubjects.length > 0 && (
            <SelectFilterField label="Subject" name="subject" defaultValue={filters.subject}>
              <option value="">All subjects</option>
              {allSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectFilterField>
          )}
          {allTags.length > 0 && (
            <SelectFilterField label="Tag" name="tag" defaultValue={filters.tag}>
              <option value="">All tags</option>
              {allTags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </SelectFilterField>
          )}
        </FilterBar>
      )}

      {nothingToShow ? (
        <EmptyState>
          {data.hasActiveFilters
            ? 'No classes match these filters.'
            : isAdmin
              ? // The create is on this page now, so the hint names the button above rather
                // than sending an admin to the student directory to find it.
                'No classes yet - use "Add a subject" above to create one.'
              : isStudent
                ? 'You are not enrolled in any classes yet. An admin will add you.'
                : isTeacher
                  ? 'No classes assigned to you yet. An admin will assign you to a class.'
                  : 'No classes are available to this account yet.'}
        </EmptyState>
      ) : groupByStudentView ? (
        <div className="space-y-6">
          {/* Classes with no active student sit outside the roster the pager walks, so they
              are shown once, on page 1. Surfaced FIRST rather than last (where the old
              class-paged list buried them): a class whose student has been unenrolled is an
              anomaly someone needs to act on, and on the last page of nine nobody would. */}
          {unassigned.length > 0 && (
            <section aria-label="Classes with no student">
              {/* The COUNT, not the rendered length: the section caps what it fetches (one
                  uuid per class travels in the query URL), so an academy with more of these
                  than the cap would otherwise report exactly the cap - a wrong number rather
                  than a short list. */}
              <SectionLabel count={unassignedTotal} className="mb-2">
                Not assigned to a student
              </SectionLabel>
              {unassignedTruncated && (
                <p className="mb-2 text-sm text-slate-600">
                  Showing {unassigned.length} of {unassignedTotal}. Assign or archive these to see the rest.
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {unassigned.map((c) => (
                  <ClassCard
                    key={c.id}
                    c={c}
                    viewerIsStudent={false}
                    viewerIsTutor={isTeacher}
                    tags={tagsByClass.get(c.id) ?? []}
                  />
                ))}
              </div>
            </section>
          )}
          {groups.map((g) => (
            <StudentGroup
              key={g.key}
              label={g.label}
              subjectCount={g.classes.length}
              missingSubject={g.classes.some((c) => !c.subject_id)}
              open={hasActiveFilters}
            >
              {g.classes.map((c) => (
                <ClassCard
                  key={c.id}
                  c={c}
                  viewerIsStudent={false}
                  viewerIsTutor={isTeacher}
                  grouped
                  subjectName={subjectByClass.get(c.id)}
                  tags={tagsByClass.get(c.id) ?? []}
                />
              ))}
            </StudentGroup>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ownClasses.map((c) => (
            <ClassCard
              key={c.id}
              c={c}
              viewerIsStudent={isStudent}
              subjectName={subjectByClass.get(c.id)}
              tags={tagsByClass.get(c.id) ?? []}
            />
          ))}
        </div>
      )}

      {/* A student's own list is bounded by the subjects they take, so it is shown whole -
          the pager belongs to the staff roster view. */}
      {groupByStudentView && (
        <PaginationBar
          page={filters.page}
          totalPages={pages}
          total={total}
          label="students"
          previousHref={filters.page > 1 ? classroomUrl(filters, { page: filters.page - 1 }) : undefined}
          nextHref={filters.page < pages ? classroomUrl(filters, { page: filters.page + 1 }) : undefined}
          className="mt-4"
        />
      )}
    </main>
  )
}
