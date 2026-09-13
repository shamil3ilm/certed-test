import type { ReactNode } from 'react'
import { requireClassAccess } from '../access'
import { getActorContext } from '@/lib/session/actor-context'
import { canManageClass } from '@/lib/permission'
import { BackLink, PageHeader } from '@/lib/ui'
import { subjectSwitcherFor } from '@/lib/services/classes/subject-switcher'
import { ClassTabs } from './ClassTabs'
import { SubjectSwitcher } from './SubjectSwitcher'

export default async function ClassLayout(props: { params: Promise<{ id: string }>; children: ReactNode }) {
  const params = await props.params

  const { children } = props

  const { course, me } = await requireClassAccess(params.id)
  const actor = await getActorContext()
  // Grading is a manager-only surface: gate the tab on the SAME per-class authority
  // the grade actions enforce (canManageClass), not the global viewGrading capability -
  // otherwise a user who grades class Y but only attends class X as a student would be
  // shown a Grading tab on X.
  const canGrade = actor.capabilities.allowed.has('viewGrading') && (await canManageClass(me, course.id))

  // The student's OTHER subjects, scoped to what this viewer teaches. Null when there is
  // nothing to switch to - one subject, or a class that is not a single student.
  const switcher = await subjectSwitcherFor(me, course.id)

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <BackLink href="/classroom">Back to classes</BackLink>

      {/* The PERSON leads, the subject qualifies - a class is one student and one subject, and
          the reader arrived looking for someone. It also stops the heading going stale:
          `course.name` is a "Student - Subject" string built once when the class was created,
          so a student who is renamed keeps the old name in every heading, and nothing in the
          app rewrites it. The switcher resolves both from their own tables, live.

          Falls back to the stored name when there is no single student to lead with - a group
          class, or one whose student has been unenrolled. */}
      <PageHeader
        title={switcher ? switcher.studentName : course.name}
        description={
          course.status === 'archived' ? 'Archived class' : (switcher?.options.find((o) => o.current)?.label ?? 'Class')
        }
      />

      {switcher && (
        <div className="mt-3">
          <SubjectSwitcher studentName={switcher.studentName} options={switcher.options} classId={course.id} />
        </div>
      )}

      <div className="mt-4 border-b border-slate-200">
        <ClassTabs id={course.id} canGrade={canGrade} />
      </div>

      <div className="mt-6">{children}</div>
    </main>
  )
}
