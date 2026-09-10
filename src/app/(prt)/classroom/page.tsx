import Link from 'next/link'
import { requireCapability } from '@/lib/auth/require-role'

import { type ClassSummary } from '@/lib/services/classes'
import { listTags, type Tag } from '@/lib/services/tags'
import { listSubjects } from '@/lib/services/subjects'
import { classroomUrl, loadClassroomPageData, type ClassroomSearchParams } from '@/lib/services/page-data/classroom'
import {
  AlertBanner,
  PageHeader,
  EmptyState,
  PaginationBar,
  SearchFilterField,
  SectionLabel,
  RowChevron,
  CARD,
  FilterBar,
  SelectFilterField,
  CLASS_BANNER,
  cx,
} from '@/lib/ui'

import { TagChips } from '../tags/TagChips'

/** A class is always a student's SUBJECT (created from the student's page - "Add
 *  subject"), so there is no standalone "new class" here; admins are pointed to the
 *  student directory where subjects (= classes) are set up. */
function AddSubjectCta() {
  return (
    <Link href="/admin/users" className="btn btn-primary btn-sm">
      Add a subject
    </Link>
  )
}

/** A 1-on-1 class names its single member; a group class (or an empty one) keeps
 *  the count. A student sees who teaches them; everyone else sees who is taught. */
function memberSummary(members: ClassSummary['students'], count: number, noun: string): string {
  if (members.length === 1) return members[0].name
  return `${count} ${noun}${count !== 1 ? 's' : ''}`
}

function ClassCard({
  c,
  viewerIsStudent,
  viewerIsTutor = false,
  grouped = false,
  subjectName,
  tags,
}: {
  c: ClassSummary
  viewerIsStudent: boolean
  // The viewer teaches this class themselves, so their own name on the tutor line
  // is noise - it is dropped unless there is a co-tutor worth naming.
  viewerIsTutor?: boolean
  // Rendered under a per-student heading (tutor/mentor/admin views): the student is
  // already named by the heading, so the card drops its leading person line.
  grouped?: boolean
  // The class's SUBJECT, where it names one. Used as the title wherever the student is
  // already named by context, so the card does not repeat them.
  subjectName?: string
  tags: Tag[]
}) {
  // The person a card leads with depends on who's looking: a student wants to see
  // their tutor; staff/mentors want to see the student the class is for.
  const primary = viewerIsStudent
    ? memberSummary(c.tutors, c.tutorCount, 'tutor')
    : memberSummary(c.students, c.studentCount, 'student')
  // Under a per-student heading (h2) the card title is one level down; the flat
  // view has no such heading, so it stays h2 to avoid skipping a level.
  const Title = grouped ? 'h3' : 'h2'
  // A class is named `student - subject`, so under a student heading - or in a student's own
  // list, where the student is the reader - the whole name says the student twice and pushes
  // the subject, the only part that differs between the cards, onto a second line. The
  // unassigned section has no such context, so its cards keep the full name.
  const studentIsImplied = grouped || viewerIsStudent
  const title = studentIsImplied ? (subjectName ?? c.name) : c.name
  return (
    <Link
      href={`/classroom/${c.id}`}
      className={cx(CARD, 'group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md')}
    >
      {/* Under a student heading the card is the MINOR unit, so the banner narrows to a rule:
          the same brand gradient, at a width that marks the card as one of a set without
          competing with the person it belongs to. Everywhere else - a student's own list, the
          unassigned section - the subject IS the unit and keeps the full banner. */}
      {grouped ? (
        <div className="relative px-4 py-3 sm:px-5">
          <span aria-hidden="true" className={cx('absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b', CLASS_BANNER)} />
          <Title className="text-base font-semibold leading-snug text-slate-900">{title}</Title>
          <p className="mt-0.5 text-meta font-medium text-slate-600">
            {c.status === 'archived' ? 'Archived' : 'Active class'}
          </p>
          {!c.subject_id && (
            <p className="mt-1 inline-flex rounded-full bg-warning-tint px-2 py-0.5 text-meta font-semibold text-warning-ink">
              No subject set
            </p>
          )}
        </div>
      ) : (
        <div className={`relative bg-gradient-to-br ${CLASS_BANNER} p-4 sm:p-5`}>
          <Title className="pr-10 text-base font-bold leading-snug text-white sm:text-lg">{title}</Title>
          <p className="mt-0.5 text-xs font-medium text-white/80">
            {c.status === 'archived' ? 'Archived' : 'Active class'}
          </p>
          {!c.subject_id && (
            // Findable from the list, because the repair is on the STUDENT's page and nothing
            // else says which classes need it. Sessions copy the subject when they are recorded,
            // so until this is set every session this class records is missing from the subject
            // filter and the by-subject hours breakdown.
            <p className="mt-1 inline-flex rounded-full bg-warning-tint/95 px-2 py-0.5 text-meta font-semibold text-warning-ink">
              No subject set
            </p>
          )}
          <span className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/20 text-sm font-bold text-white ring-1 ring-white/30">
            {title.slice(0, 1).toUpperCase()}
          </span>
        </div>
      )}
      <div className="px-4 py-3 sm:px-5">
        <div className="flex items-center gap-4 text-xs text-slate-600">
          {!grouped && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <svg
                className="h-4 w-4 shrink-0 text-slate-600"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.5a3 3 0 100 6 3 3 0 000-6zM4 19a8 8 0 0116 0"
                />
              </svg>
              <span className="truncate">{primary}</span>
            </span>
          )}
          {!viewerIsStudent && (!viewerIsTutor || c.tutorCount > 1) && (
            <span className="inline-flex shrink-0 items-center gap-1.5">
              <svg
                className="h-4 w-4 text-slate-600"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M22 10L12 5 2 10l10 5 10-5zM6 12v5c0 1 2.7 2 6 2s6-1 6-2v-5"
                />
              </svg>
              {memberSummary(c.tutors, c.tutorCount, 'tutor')}
            </span>
          )}
          <RowChevron className="ml-auto shrink-0" />
        </div>
        {tags.length > 0 && <TagChips tags={tags} className="mt-2.5" />}
      </div>
    </Link>
  )
}

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
      <PageHeader title="Classes" description={subtitle} action={isAdmin ? <AddSubjectCta /> : undefined} />

      {searchParams?.error === '1' && (
        <AlertBanner className="mb-4">That change couldn&apos;t be applied. Please try again.</AlertBanner>
      )}

      {(allSubjects.length > 0 || allTags.length > 0 || groupByStudentView) && (
        <FilterBar className="mb-4" clearHref="/classroom" showClear={data.hasActiveFilters}>
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
              ? 'No classes yet - open a student and use "Add subject" to create one.'
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
            <section key={g.key} aria-label={g.label}>
              {/* A page of STUDENTS, each opening onto the subjects they take.
                  <details> rather than a client component: this is disclosure, not state
                  worth hydrating for, and the native element brings its own keyboard and
                  screen-reader behaviour.

                  Open when a filter is ACTIVE. A reader who narrowed to a subject or typed a
                  name asked a question whose answer is inside these groups, and making them
                  open each one to read it is the page ignoring what they just said. */}
              <details open={hasActiveFilters} className={cx(CARD, 'group/disclosure overflow-hidden')}>
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition hover:bg-slate-50">
                  <span
                    aria-hidden="true"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary ring-1 ring-primary/20"
                  >
                    {g.label.slice(0, 1).toUpperCase()}
                  </span>
                  <h2 className="min-w-0 flex-1 truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                    {g.label}
                  </h2>
                  <span className="shrink-0 text-meta font-medium text-slate-500">
                    {g.classes.length} {g.classes.length === 1 ? 'subject' : 'subjects'}
                  </span>
                  {/* Anything ACTIONABLE inside has to show on the closed row, or collapsing
                      the group hides it: a subject-less class records sessions no filter can
                      reach, and it is found by scanning this list. A count nobody can act on
                      from here would be noise; this one is the reason to open the group. */}
                  {g.classes.some((c) => !c.subject_id) && (
                    <span className="shrink-0 rounded-full bg-warning-tint px-2 py-0.5 text-meta font-semibold text-warning-ink">
                      No subject set
                    </span>
                  )}
                  {/* Rotates with the disclosure, so the control says which way it goes. */}
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open/disclosure:rotate-90"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </summary>
                <div className="grid gap-4 border-t border-slate-200 bg-slate-50/50 p-4 sm:grid-cols-2 lg:grid-cols-3">
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
                </div>
              </details>
            </section>
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
