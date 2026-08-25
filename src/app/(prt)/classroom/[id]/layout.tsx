import type { ReactNode } from 'react'
import { requireClassAccess } from '../access'
import { getActorContext } from '@/lib/session/actor-context'
import { canManageClass } from '@/lib/permission'
import { BackLink, PageHeader } from '@/lib/ui'
import { ClassTabs } from './ClassTabs'

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

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <BackLink href="/classroom">Back to classes</BackLink>

      <PageHeader title={course.name} description={course.status === 'archived' ? 'Archived class' : 'Class'} />

      <div className="mt-4 border-b border-slate-200">
        <ClassTabs id={course.id} canGrade={canGrade} />
      </div>

      <div className="mt-6">{children}</div>
    </main>
  )
}
