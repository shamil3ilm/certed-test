import type { ReactNode } from 'react'
import { requireClassAccess } from '../access'
import { getActorContext } from '@/lib/session/actor-context'
import { BackLink, PageHeader } from '@/lib/ui'
import { ClassTabs } from './ClassTabs'

export default async function ClassLayout(props: { params: Promise<{ id: string }>; children: ReactNode }) {
  const params = await props.params

  const { children } = props

  const { course } = await requireClassAccess(params.id)
  const actor = await getActorContext()
  const canGrade = actor.capabilities.allowed.has('viewGrading')

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
