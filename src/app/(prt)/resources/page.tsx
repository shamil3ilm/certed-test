import { requireRole } from '@/lib/auth/requireRole'
import { listResources } from '@/lib/repos/resources'
import { listCourses } from '@/lib/repos/courses'
import { listCommentsForResource } from '@/lib/repos/resourceComments'
import { UploadForm } from './UploadForm'
import { PageHeader } from '../ui'
import { ResourceCommentsSection } from './ResourceCommentsSection'

export default async function ResourcesPage() {
  const me = await requireRole(['admin', 'teacher', 'student'])
  const [resources, courses] = await Promise.all([listResources(), listCourses()])
  const courseName = new Map(courses.map((c) => [c.id, c.name]))
  const canUpload = me.role === 'admin' || me.role === 'teacher'

  // Fetch comments for all resources in parallel
  const commentsMap: Record<string, any[]> = {}
  await Promise.all(
    resources.map(async (r) => {
      commentsMap[r.id] = await listCommentsForResource(r.id)
    }),
  )

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <PageHeader title="Resources" description="Course materials shared by your teachers." />

      {canUpload && <UploadForm courses={courses.filter((c) => c.status === 'active')} />}

      <ul className="mt-6 space-y-4">
        {resources.map((r) => {
          const isLink = !r.drive_file_id
          return (
            <li
              key={r.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                  isLink ? 'bg-indigo-50 text-indigo-600' : 'bg-primary/10 text-primary'
                }`}>
                  {isLink ? (
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" strokeLinejoin="round" />
                      <path d="M13 2v7h7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{r.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500">
                      {courseName.get(r.course_id) ?? 'Course'}
                    </span>
                    {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
                <a
                  href={`/api/resources/${r.id}/download`}
                  target={isLink ? '_blank' : undefined}
                  rel={isLink ? 'noopener noreferrer' : undefined}
                  className={`btn btn-sm ${isLink ? 'btn-indigo-soft' : 'btn-soft'}`}
                >
                  {isLink ? 'Open Link' : 'Download'}
                </a>
              </div>

              {/* Comments thread for each resource */}
              <ResourceCommentsSection
                resourceId={r.id}
                initialComments={commentsMap[r.id] ?? []}
                me={me}
              />
            </li>
          )
        })}
        {resources.length === 0 && (
          <li className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
            No resources yet.
          </li>
        )}
      </ul>
    </main>
  )
}
