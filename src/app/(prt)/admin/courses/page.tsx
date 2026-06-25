import { requireRole } from '@/lib/auth/requireRole'
import { listCourses } from '@/lib/repos/courses'
import { listProfiles } from '@/lib/repos/users'
import { listEnrollments } from '@/lib/repos/enrollments'
import { listCourseTeachers } from '@/lib/repos/courseTeachers'
import {
  createCourseAction,
  archiveCourseAction,
  enrollAction,
  assignTeacherAction,
} from './actions'

export default async function AdminCoursesPage() {
  await requireRole(['admin'])
  const [courses, profiles, enrollments, teachers] = await Promise.all([
    listCourses(),
    listProfiles(),
    listEnrollments(),
    listCourseTeachers(),
  ])
  const students = profiles.filter((p) => p.role === 'student')
  const teacherProfiles = profiles.filter((p) => p.role === 'teacher')
  const countBy = (rows: { course_id: string }[], courseId: string) =>
    rows.filter((r) => r.course_id === courseId).length

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-8">
      <section>
        <h1 className="text-2xl font-semibold">Courses</h1>
        <form action={createCourseAction} className="mt-4 flex items-end gap-3">
          <label className="text-sm">
            Course name
            <input name="name" required className="mt-1 block rounded border px-2 py-1" />
          </label>
          <button className="rounded bg-slate-900 px-4 py-2 text-white">Create course</button>
        </form>
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="p-2">Course</th>
              <th>Status</th>
              <th>Students</th>
              <th>Teachers</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-2">{c.name}</td>
                <td>{c.status}</td>
                <td>{countBy(enrollments, c.id)}</td>
                <td>{countBy(teachers, c.id)}</td>
                <td className="py-1 text-right">
                  {c.status === 'active' && (
                    <form action={archiveCourseAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className="text-slate-600 hover:underline">Archive</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {courses.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-slate-400">No courses yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <form action={enrollAction} className="rounded-xl border bg-white p-4">
          <h2 className="font-medium">Enroll student</h2>
          <select name="student_id" required className="mt-2 block w-full rounded border px-2 py-1">
            <option value="">Select student</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name ?? s.email}</option>
            ))}
          </select>
          <select name="course_id" required className="mt-2 block w-full rounded border px-2 py-1">
            <option value="">Select course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button className="mt-3 rounded bg-slate-900 px-4 py-2 text-white">Enroll</button>
        </form>

        <form action={assignTeacherAction} className="rounded-xl border bg-white p-4">
          <h2 className="font-medium">Assign teacher</h2>
          <select name="teacher_id" required className="mt-2 block w-full rounded border px-2 py-1">
            <option value="">Select teacher</option>
            {teacherProfiles.map((t) => (
              <option key={t.id} value={t.id}>{t.full_name ?? t.email}</option>
            ))}
          </select>
          <select name="course_id" required className="mt-2 block w-full rounded border px-2 py-1">
            <option value="">Select course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button className="mt-3 rounded bg-slate-900 px-4 py-2 text-white">Assign</button>
        </form>
      </section>
    </main>
  )
}
