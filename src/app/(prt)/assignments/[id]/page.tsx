import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/requireRole'
import { getAssignment } from '@/lib/repos/assignments'
import { listSubmissionsForAssignment } from '@/lib/repos/submissions'
import { getProfileNamesByIds } from '@/lib/repos/users'

export default async function AssignmentDetail({ params }: { params: { id: string } }) {
  await requireRole(['admin', 'teacher'])
  const assignment = await getAssignment(params.id)
  if (!assignment) notFound()

  const submissions = await listSubmissionsForAssignment(params.id)
  const names = await getProfileNamesByIds(submissions.map((s) => s.student_id))

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">{assignment.title}</h1>
      <p className="mt-1 text-sm text-slate-500">
        Due {new Date(assignment.due_date).toLocaleString()} · {submissions.length} submission(s)
      </p>

      <table className="mt-6 w-full border-collapse text-sm">
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
                  className="text-blue-700 hover:underline"
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
    </main>
  )
}
