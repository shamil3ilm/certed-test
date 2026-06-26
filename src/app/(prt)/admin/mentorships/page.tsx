import { requireRole } from '@/lib/auth/requireRole'
import { listProfiles } from '@/lib/repos/users'
import { listMentorships } from '@/lib/repos/mentorships'
import { PageHeader, StatCard } from '../../ui'
import { ConfirmSubmit } from '../../ConfirmSubmit'
import { assignMentorAction, removeMentorAction } from './actions'

function initials(s: string): string {
  return s.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
}

export default async function MentorshipsPage() {
  await requireRole(['admin'])
  const [profiles, links] = await Promise.all([listProfiles(), listMentorships()])
  const students = profiles.filter((p) => p.role === 'student')
  const teachers = profiles.filter((p) => p.role === 'teacher')
  const nameOf = (id: string) => {
    const p = profiles.find((x) => x.id === id)
    return p?.full_name ?? p?.email ?? '—'
  }
  const linksOf = (sid: string) => links.filter((l) => l.student_id === sid)
  const assigned = students.filter((s) => linksOf(s.id).length > 0).length

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Mentorships"
        description="Assign students to teachers. A teacher only has access to their assigned students — editable any time."
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Students" value={students.length} />
        <StatCard label="Assigned" value={assigned} tone="primary" />
        <StatCard label="Unassigned" value={students.length - assigned} sub={`${teachers.length} teachers available`} />
      </section>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-700">Students</h2>
      <div className="space-y-3">
        {students.map((s) => {
          const myLinks = linksOf(s.id)
          return (
            <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-secondary text-sm font-semibold text-white">
                    {initials(s.full_name ?? s.email)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{s.full_name ?? s.email}</p>
                    <p className="truncate text-xs text-slate-400">
                      {s.email}{s.class_level ? ` · ${s.class_level}` : ''}
                    </p>
                  </div>
                </div>
                <form action={assignMentorAction} className="flex items-center gap-2">
                  <input type="hidden" name="student_id" value={s.id} />
                  <select name="teacher_id" required defaultValue="" className="text-sm">
                    <option value="" disabled>Add mentor…</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>{t.full_name ?? t.email}</option>
                    ))}
                  </select>
                  <button className="btn btn-sm btn-soft">Add</button>
                </form>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Mentors</span>
                {myLinks.map((l) => (
                  <span key={l.id} className="inline-flex items-center gap-1.5 rounded-full bg-primary/5 py-1 pl-3 pr-1.5 text-xs font-medium text-primary ring-1 ring-primary/15">
                    {nameOf(l.teacher_id)}
                    <form action={removeMentorAction} className="inline-flex">
                      <input type="hidden" name="id" value={l.id} />
                      <ConfirmSubmit
                        className="grid h-4 w-4 place-items-center rounded-full text-red-500 hover:bg-red-50 hover:text-red-700"
                        title="Remove mentor?"
                        message="The teacher will lose access to this student."
                        confirmLabel="Remove"
                      >
                        ✕
                      </ConfirmSubmit>
                    </form>
                  </span>
                ))}
                {myLinks.length === 0 && <span className="text-xs italic text-slate-400">No mentor assigned yet</span>}
              </div>
            </div>
          )
        })}
        {students.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
            No students yet. Add students in Users, then assign mentors here.
          </div>
        )}
      </div>
    </main>
  )
}
