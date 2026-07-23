import Link from 'next/link'
import { requireCapability } from '@/lib/auth/require-role'
import { listMyClasses, type ClassSummary } from '@/lib/services/classes'
import { PageHeader, EmptyState, RowChevron, CARD, classBanner, cx } from '@/lib/ui'
import { Field, Input, SubmitButton } from '../form'
import { createClassAction } from './class-actions'

function NewClass() {
  return (
    <details className="relative">
      <summary className="btn btn-primary btn-sm cursor-pointer list-none">+ New class</summary>
      <form action={createClassAction} className={cx(CARD, 'absolute right-0 z-10 mt-2 w-64 space-y-2 p-3 shadow-md')}>
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

function ClassCard({ c }: { c: ClassSummary }) {
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
      <div className="flex items-center gap-4 px-4 py-3 text-xs text-slate-500 sm:px-5">
        <span className="inline-flex items-center gap-1.5">
          <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5a3 3 0 100 6 3 3 0 000-6zM4 19a8 8 0 0116 0" />
          </svg>
          {c.studentCount} student{c.studentCount !== 1 ? 's' : ''}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M22 10L12 5 2 10l10 5 10-5zM6 12v5c0 1 2.7 2 6 2s6-1 6-2v-5"
            />
          </svg>
          {c.tutorCount} tutor{c.tutorCount !== 1 ? 's' : ''}
        </span>
        <RowChevron className="ml-auto" />
      </div>
    </Link>
  )
}

export default async function ClassroomPage() {
  const me = await requireCapability('viewClasses')
  const classes = await listMyClasses(me)
  // The list itself is membership-driven (listMyClasses). These flags only pick
  // the heading copy + the admin-only "New class" control, which are tied to the
  // actor's fixed identity, not a resolved capability, so read profiles.role.
  const isAdmin = me.role === 'admin'
  const isStudent = me.role === 'student'
  const isTutor = me.role === 'tutor'

  const subtitle = isStudent
    ? 'The classes you are enrolled in.'
    : isTutor
      ? 'The classes you teach.'
      : 'All classes across the academy.'

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <PageHeader title="Classes" description={subtitle} action={isAdmin ? <NewClass /> : undefined} />

      {classes.length === 0 ? (
        <EmptyState>
          {isStudent
            ? 'You are not enrolled in any classes yet. An admin will add you.'
            : isTutor
              ? 'No classes assigned to you yet. An admin will assign you to a class.'
              : 'No classes yet - create one with + New class above.'}
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <ClassCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </main>
  )
}
