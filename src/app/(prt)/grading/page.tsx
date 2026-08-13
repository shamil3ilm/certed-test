import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireCapability } from '@/lib/auth/require-role'
import { loadPersonaFlags } from '@/lib/permission/personas'
import { listMyClasses, sortClassesByStudent, groupClassesByStudent } from '@/lib/services/classes'
import { classBanner, CARD, EmptyState, PageHeader, RowChevron, cx } from '@/lib/ui'

function GradingClassCard({ id, name, status }: { id: string; name: string; status: string }) {
  return (
    <Link
      href={`/classroom/${id}/grading`}
      className={cx(CARD, 'group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md')}
    >
      <div className={`relative bg-gradient-to-br ${classBanner(id)} p-4 sm:p-5`}>
        <h3 className="pr-10 text-base font-bold leading-snug text-white sm:text-lg">{name}</h3>
        <p className="mt-0.5 text-xs font-medium text-white/80">
          {status === 'archived' ? 'Archived' : 'Active class'}
        </p>
        <span className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/20 text-sm font-bold text-white ring-1 ring-white/30">
          {name.slice(0, 1).toUpperCase()}
        </span>
      </div>
      <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-600 sm:px-5">
        <span className="font-medium text-slate-700">Open grading</span>
        <RowChevron className="ml-auto shrink-0" />
      </div>
    </Link>
  )
}

export default async function GradingPage() {
  const me = await requireCapability('viewClasses')
  const flags = await loadPersonaFlags(me.id)

  if (flags.isStudent) {
    redirect('/grades')
  }

  // Everyone left (tutor, mentor, admin) thinks student-first, so the grading
  // landing reads as "each student, then the subjects to mark" - the same
  // per-student grouping as the Classes list.
  const groups = groupClassesByStudent(sortClassesByStudent(await listMyClasses(me)))

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Grading"
        description="Open a class to review submissions and record marks in its grading tab."
      />

      {groups.length === 0 ? (
        <EmptyState>No classes are available for grading yet.</EmptyState>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.label}>
              <h2 className="mb-2 text-sm font-semibold text-slate-600">{g.label}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {g.classes.map((course) => (
                  <GradingClassCard key={course.id} id={course.id} name={course.name} status={course.status} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  )
}
