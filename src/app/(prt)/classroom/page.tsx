import Link from 'next/link'
import { requireCapability } from '@/lib/auth/require-role'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { listMyClasses, sortClassesByStudent, groupClassesByStudent, type ClassSummary } from '@/lib/services/classes'
import { listTags, tagsForEntities, entityIdsForTag, type Tag } from '@/lib/services/tags'
import { pageSlice, parsePageParam, totalPages } from '@/lib/pagination'
import {
  AlertBanner,
  PageHeader,
  EmptyState,
  PaginationBar,
  RowChevron,
  CARD,
  FilterBar,
  SelectFilterField,
  classBanner,
  cx,
} from '@/lib/ui'

const CLASSES_PAGE_SIZE = 12
import { Field, Input, SubmitButton } from '../form'
import { TagChips } from '../tags/TagChips'
import { createClassAction } from './class-actions'

function NewClass() {
  return (
    <details className="relative">
      <summary className="btn btn-primary btn-sm cursor-pointer list-none">+ New class</summary>
      <form
        action={createClassAction}
        className={cx(CARD, 'absolute right-0 z-10 mt-2 w-64 max-w-[calc(100vw-2rem)] space-y-2 p-3 shadow-md')}
      >
        <Field label="Class name">
          <Input name="name" required placeholder="e.g. Grade 10 Mathematics" />
        </Field>
        <SubmitButton className="btn-sm btn-primary" pendingLabel="Creating...">
          Create class
        </SubmitButton>
      </form>
    </details>
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
  return (
    <Link
      href={`/classroom/${c.id}`}
      className={cx(CARD, 'group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md')}
    >
      <div className={`relative bg-gradient-to-br ${classBanner(c.id)} p-4 sm:p-5`}>
        <Title className="pr-10 text-base font-bold leading-snug text-white sm:text-lg">{c.name}</Title>
        <p className="mt-0.5 text-xs font-medium text-white/80">
          {c.status === 'archived' ? 'Archived' : 'Active class'}
        </p>
        <span className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/20 text-sm font-bold text-white ring-1 ring-white/30">
          {c.name.slice(0, 1).toUpperCase()}
        </span>
      </div>
      <div className="px-4 py-3 sm:px-5">
        <div className="flex items-center gap-4 text-xs text-slate-500">
          {!grouped && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <svg
                className="h-4 w-4 shrink-0 text-slate-400"
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
                className="h-4 w-4 text-slate-400"
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

export default async function ClassroomPage(props: {
  searchParams?: Promise<{ error?: string; tag?: string; page?: string }>
}) {
  const searchParams = await props.searchParams
  const me = await requireCapability('viewClasses')
  const [allClasses, flags, allTags] = await Promise.all([listMyClasses(me), loadPersonaFlags(me.id), listTags()])
  // Academy-wide class authority (admin or sub_admin) drives the "+ New class" control,
  // the all-classes subtitle, and the create hint - not the admin tier specifically.
  const isAdmin = flags.isClassAdmin
  const isStudent = flags.isStudent
  const isTeacher = flags.isTutor

  // Everyone who isn't the student themselves thinks student-first (tutors,
  // mentors and admins all lead with the student), so they see classes grouped
  // under each student. The student's own view stays a flat per-subject list.
  const groupByStudentView = !isStudent

  // Optional tag filter: narrow to the classes carrying the selected tag.
  const tagFilter = searchParams?.tag ?? ''
  const taggedIds = tagFilter ? new Set(await entityIdsForTag('class', tagFilter)) : null
  const classes = taggedIds ? allClasses.filter((c) => taggedIds.has(c.id)) : allClasses
  // For the per-student views, order by student (then subject) so each student's
  // classes sit together for grouping; other viewers keep the service's name sort.
  const orderedClasses = groupByStudentView ? sortClassesByStudent(classes) : classes
  // Page AFTER the tag filter; fetch per-card tags only for the visible page.
  const currentPage = parsePageParam(searchParams?.page)
  const pagedClasses = pageSlice(orderedClasses, currentPage, CLASSES_PAGE_SIZE)
  const tagsByClass = await tagsForEntities(
    'class',
    pagedClasses.map((c) => c.id),
  )
  const classPageHref = (p: number) => {
    const sp = new URLSearchParams()
    if (tagFilter) sp.set('tag', tagFilter)
    if (p > 1) sp.set('page', String(p))
    const qs = sp.toString()
    return qs ? `/classroom?${qs}` : '/classroom'
  }

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
      <PageHeader title="Classes" description={subtitle} action={isAdmin ? <NewClass /> : undefined} />

      {searchParams?.error === '1' && (
        <AlertBanner className="mb-4">
          That class couldn&apos;t be created. Please pick a different name and try again.
        </AlertBanner>
      )}

      {allTags.length > 0 && (
        <FilterBar className="mb-4" clearHref="/classroom" showClear={Boolean(tagFilter)}>
          <SelectFilterField label="Tag" name="tag" defaultValue={tagFilter}>
            <option value="">All tags</option>
            {allTags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </SelectFilterField>
        </FilterBar>
      )}

      {classes.length === 0 ? (
        <EmptyState>
          {tagFilter
            ? 'No classes carry this tag.'
            : isAdmin
              ? 'No classes yet - create one with + New class above.'
              : isStudent
                ? 'You are not enrolled in any classes yet. An admin will add you.'
                : isTeacher
                  ? 'No classes assigned to you yet. An admin will assign you to a class.'
                  : 'No classes are available to this account yet.'}
        </EmptyState>
      ) : groupByStudentView ? (
        <div className="space-y-6">
          {groupClassesByStudent(pagedClasses).map((g) => (
            <section key={g.key} aria-label={g.label}>
              <h2 className="mb-2 text-sm font-semibold text-slate-600">{g.label}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {g.classes.map((c) => (
                  <ClassCard
                    key={c.id}
                    c={c}
                    viewerIsStudent={false}
                    viewerIsTutor={isTeacher}
                    grouped
                    tags={tagsByClass.get(c.id) ?? []}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pagedClasses.map((c) => (
            <ClassCard key={c.id} c={c} viewerIsStudent={isStudent} tags={tagsByClass.get(c.id) ?? []} />
          ))}
        </div>
      )}

      <PaginationBar
        page={currentPage}
        totalPages={totalPages(classes.length, CLASSES_PAGE_SIZE)}
        total={classes.length}
        previousHref={currentPage > 1 ? classPageHref(currentPage - 1) : undefined}
        nextHref={
          currentPage < totalPages(classes.length, CLASSES_PAGE_SIZE) ? classPageHref(currentPage + 1) : undefined
        }
        className="mt-4"
      />
    </main>
  )
}
