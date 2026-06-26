import { requireRole } from '@/lib/auth/requireRole'
import { listResources } from '@/lib/repos/resources'
import { listCourses } from '@/lib/repos/courses'
import { UploadForm } from './UploadForm'

export default async function ResourcesPage() {
  const me = await requireRole(['admin', 'teacher', 'student'])
  const [resources, courses] = await Promise.all([listResources(), listCourses()])
  const courseName = new Map(courses.map((c) => [c.id, c.name]))
  const canUpload = me.role === 'admin' || me.role === 'teacher'

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Resources</h1>

      {canUpload && <UploadForm courses={courses.filter((c) => c.status === 'active')} />}

      <ul className="mt-6 space-y-3">
        {resources.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between rounded-xl border bg-white p-4"
          >
            <div>
              <p className="font-medium">{r.title}</p>
              <p className="text-xs text-slate-400">
                {courseName.get(r.course_id) ?? 'Course'} ·{' '}
                {new Date(r.created_at).toLocaleDateString()}
              </p>
            </div>
            <a
              href={`/api/resources/${r.id}/download`}
              className="text-sm text-blue-700 hover:underline"
            >
              Download
            </a>
          </li>
        ))}
        {resources.length === 0 && (
          <li className="p-4 text-center text-slate-400">No resources yet.</li>
        )}
      </ul>
    </main>
  )
}
