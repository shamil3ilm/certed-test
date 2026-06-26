import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/requireRole'
import { getAssignment } from '@/lib/repos/assignments'
import { listSubmissionsForAssignment } from '@/lib/repos/submissions'
import { getProfileNamesByIds } from '@/lib/repos/users'
import { PageHeader } from '../../ui'

export default async function AssignmentDetail({ params }: { params: { id: string } }) {
  await requireRole(['admin', 'teacher'])
  const assignment = await getAssignment(params.id)
  if (!assignment) notFound()

  const submissions = await listSubmissionsForAssignment(params.id)
  const names = await getProfileNamesByIds(submissions.map((s) => s.student_id))

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={assignment.title}
        description={`Due ${new Date(assignment.due_date).toLocaleString()} · ${submissions.length} submission(s)`}
      />

      <div className="mt-6 overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="p-2">Student</th>
            <th>Status</th>
            <th>Submitted</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {submissions.map((s) => (
            <tr key={s.id} className="border-t">
              <td className="p-2">{names.get(s.student_id) ?? s.student_id}</td>
              <td className={s.status === 'late' ? 'text-red-600' : 'text-emerald-700'}>
                {s.status}
              </td>
              <td>{new Date(s.submitted_at).toLocaleString()}</td>
              <td className="py-1 text-right">
                <a
                  href={`/api/submissions/${s.id}/download`}
                  className="btn btn-sm btn-soft"
                >
                  Download
                </a>
              </td>
            </tr>
          ))}
          {submissions.length === 0 && (
            <tr>
              <td colSpan={4} className="p-4 text-center text-slate-400">No submissions yet.</td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </main>
  )
}
