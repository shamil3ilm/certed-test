import { requireRole } from '@/lib/auth/requireRole'
import { listCourses } from '@/lib/repos/courses'
import { listProfiles } from '@/lib/repos/users'
import { listEnrollments } from '@/lib/repos/enrollments'
import { listCourseTeachers } from '@/lib/repos/courseTeachers'
import {
  createCourseAction,
  archiveCourseAction,
  restoreCourseAction,
  renameCourseAction,
  enrollAction,
  assignTeacherAction,
  unassignTeacherAction,
  unenrollAction,
} from './actions'
import { PageHeader } from '../../ui'
import { ConfirmSubmit } from '../../ConfirmSubmit'

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
  const nameOf = (id: string) => {
    const p = profiles.find((x) => x.id === id)
    return p?.full_name ?? p?.email ?? '—'
  }

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-4 sm:p-6 lg:p-8">
      <section>
        <PageHeader title="Courses" />
        <form action={createCourseAction} className="mt-4 flex items-end gap-3">
          <label className="text-sm">
            Course name
            <input name="name" required className="mt-1 block rounded border px-2 py-1" />
          </label>
          <button className="btn btn-primary">Create course</button>
        </form>

        <div className="mt-4 space-y-4">
          {courses.map((c) => {
            const courseTeachers = teachers.filter((t) => t.course_id === c.id)
            const courseStudents = enrollments.filter((e) => e.course_id === c.id)
            return (
              <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <form action={renameCourseAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={c.id} />
                    <input
                      name="name"
                      defaultValue={c.name}
                      className="rounded border px-2 py-1 text-sm font-medium"
                    />
                    <button className="btn btn-sm btn-soft">Rename</button>
                    <span className={`text-xs ${c.status === 'active' ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {c.status}
                    </span>
                  </form>
                  {c.status === 'active' ? (
                    <form action={archiveCourseAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <ConfirmSubmit className="btn btn-sm btn-warning" variant="warning" title="Archive this course?" message="It is hidden from active lists; records are kept." confirmLabel="Archive">Archive</ConfirmSubmit>
                    </form>
                  ) : (
                    <form action={restoreCourseAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className="btn btn-sm btn-success">Restore</button>
                    </form>
                  )}
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium text-slate-500">Teachers ({courseTeachers.length})</p>
                    <ul className="mt-1 space-y-1">
                      {courseTeachers.map((t) => (
                        <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                          <span>{nameOf(t.teacher_id)}</span>
                          <form action={unassignTeacherAction}>
                            <input type="hidden" name="id" value={t.id} />
                            <ConfirmSubmit className="btn btn-sm btn-danger" title="Remove from course?" message="This unlinks them from the course." confirmLabel="Remove">Remove</ConfirmSubmit>
                          </form>
                        </li>
                      ))}
                      {courseTeachers.length === 0 && <li className="text-xs text-slate-400">None</li>}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Students ({courseStudents.length})</p>
                    <ul className="mt-1 space-y-1">
                      {courseStudents.map((e) => (
                        <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                          <span>{nameOf(e.student_id)}</span>
                          <form action={unenrollAction}>
                            <input type="hidden" name="id" value={e.id} />
                            <ConfirmSubmit className="btn btn-sm btn-danger" title="Remove from course?" message="This unlinks them from the course." confirmLabel="Remove">Remove</ConfirmSubmit>
                          </form>
                        </li>
                      ))}
                      {courseStudents.length === 0 && <li className="text-xs text-slate-400">None</li>}
                    </ul>
                  </div>
                </div>
              </div>
            )
          })}
          {courses.length === 0 && <p className="text-sm text-slate-400">No courses yet.</p>}
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <form action={enrollAction} className="rounded-2xl border border-slate-200 bg-white p-4">
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
          <button className="mt-3 btn btn-primary">Enroll</button>
        </form>

        <form action={assignTeacherAction} className="rounded-2xl border border-slate-200 bg-white p-4">
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
          <button className="mt-3 btn btn-primary">Assign</button>
        </form>
      </section>
    </main>
  )
}
