import { requireRole } from '@/lib/auth/requireRole'
import { listResources } from '@/lib/repos/resources'
import { listCourses } from '@/lib/repos/courses'
import { UploadForm } from './UploadForm'
import { PageHeader } from '../ui'

export default async function ResourcesPage() {
  const me = await requireRole(['admin', 'teacher', 'student'])
  const [resources, courses] = await Promise.all([listResources(), listCourses()])
  const courseName = new Map(courses.map((c) => [c.id, c.name]))
  const canUpload = me.role === 'admin' || me.role === 'teacher'

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <PageHeader title="Resources" description="Course materials shared by your teachers." />

      {canUpload && <UploadForm courses={courses.filter((c) => c.status === 'active')} />}

      <ul className="mt-6 space-y-3">
        {resources.map((r) => (
          <li
            key={r.id}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" strokeLinejoin="round" />
                <path d="M13 2v7h7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-900">{r.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500">
                  {courseName.get(r.course_id) ?? 'Course'}
                </span>
                {new Date(r.created_at).toLocaleDateString()}
              </p>
            </div>
            <a href={`/api/resources/${r.id}/download`} className="btn btn-sm btn-soft">Download</a>
          </li>
        ))}
        {resources.length === 0 && (
          <li className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
            No resources yet.
          </li>
        )}
      </ul>
    </main>
  )
}
