import Link from 'next/link'
import { requireCapability } from '@/lib/auth/require-role'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { listMyClasses, type ClassSummary } from '@/lib/services/classes'
import { listTags, tagsForEntities, entityIdsForTag, type Tag } from '@/lib/services/tags'
import {
  AlertBanner,
  PageHeader,
  EmptyState,
  RowChevron,
  CARD,
  FilterBar,
  FilterField,
  FILTER_CONTROL,
  classBanner,
  cx,
} from '@/lib/ui'
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

function ClassCard({ c, viewerIsStudent, tags }: { c: ClassSummary; viewerIsStudent: boolean; tags: Tag[] }) {
  // The person a card leads with depends on who's looking: a student wants to see
  // their tutor; staff/mentors want to see the student the class is for.
  const primary = viewerIsStudent
    ? memberSummary(c.tutors, c.tutorCount, 'tutor')
    : memberSummary(c.students, c.studentCount, 'student')
  return (
    <Link
      href={`/classroom/${c.id}`}
      className={cx(CARD, 'group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md')}
    >
      <div className={`relative bg-gradient-to-br ${classBanner(c.id)} p-4 sm:p-5`}>
        <h2 className="pr-10 text-base font-bold leading-snug text-white sm:text-lg">{c.name}</h2>
        <p className="mt-0.5 text-xs font-medium text-white/80">
          {c.status === 'archived' ? 'Archived' : 'Active class'}
        </p>
        <span className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/20 text-sm font-bold text-white ring-1 ring-white/30">
          {c.name.slice(0, 1).toUpperCase()}
        </span>
      </div>
      <div className="px-4 py-3 sm:px-5">
        <div className="flex items-center gap-4 text-xs text-slate-500">
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
          {!viewerIsStudent && (
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

export default async function ClassroomPage(props: { searchParams?: Promise<{ error?: string; tag?: string }> }) {
  const searchParams = await props.searchParams
  const me = await requireCapability('viewClasses')
  const [allClasses, flags, allTags] = await Promise.all([listMyClasses(me), loadPersonaFlags(me.id), listTags()])
  const isAdmin = flags.isAdmin
  const isStudent = flags.isStudent
  const isTeacher = flags.isTutor

  // Optional tag filter: narrow to the classes carrying the selected tag.
  const tagFilter = searchParams?.tag ?? ''
  const taggedIds = tagFilter ? new Set(await entityIdsForTag('class', tagFilter)) : null
  const classes = taggedIds ? allClasses.filter((c) => taggedIds.has(c.id)) : allClasses
  const tagsByClass = await tagsForEntities(
    'class',
    classes.map((c) => c.id),
  )

  // Student and tutor are mutually exclusive (role is fixed and single; a student
  // is never granted a tutor persona and vice-versa), so there is no learner+teacher
  // hybrid to caption for.
  const subtitle = isAdmin
    ? 'All classes across the academy.'
    : isStudent
      ? 'The classes you are enrolled in.'
      : isTeacher
        ? 'The classes you teach.'
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
          <FilterField label="Tag">
            <select name="tag" defaultValue={tagFilter} className={FILTER_CONTROL}>
              <option value="">All tags</option>
              {allTags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </FilterField>
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
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <ClassCard key={c.id} c={c} viewerIsStudent={isStudent} tags={tagsByClass.get(c.id) ?? []} />
          ))}
        </div>
      )}
    </main>
  )
}
