import Link from 'next/link'
import type { ReactNode } from 'react'
import { requireClassAccess } from '../access'
import { classBanner } from '../../ui'
import { ClassTabs } from './ClassTabs'

export default async function ClassLayout({
  params,
  children,
}: {
  params: { id: string }
  children: ReactNode
}) {
  const { course } = await requireClassAccess(params.id)

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <Link
        href="/classroom"
        className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-slate-400 transition hover:-translate-x-0.5 hover:text-primary"
      >
        &larr; All classes
      </Link>

      <div className={`overflow-hidden rounded-2xl bg-gradient-to-br ${classBanner(course.id)} px-5 py-6 sm:px-7 sm:py-8`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
          {course.status === 'archived' ? 'Archived class' : 'Class'}
        </p>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-white sm:text-2xl lg:text-3xl">
          {course.name}
        </h1>
      </div>

      <div className="mt-4 border-b border-slate-200">
        <ClassTabs id={course.id} />
      </div>

      <div className="mt-6">{children}</div>
    </main>
  )
}
