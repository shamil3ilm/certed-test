import { requireRole } from '@/lib/auth/requireRole'
import { listProfiles } from '@/lib/repos/users'
import { listMentorships } from '@/lib/repos/mentorships'
import { PageHeader } from '../../ui'
import { ConfirmSubmit } from '../../ConfirmSubmit'
import { assignMentorAction, removeMentorAction } from './actions'

export default async function MentorshipsPage() {
  await requireRole(['admin'])
  const [profiles, links] = await Promise.all([listProfiles(), listMentorships()])
  const students = profiles.filter((p) => p.role === 'student')
  const teachers = profiles.filter((p) => p.role === 'teacher')
  const nameOf = (id: string) => {
    const p = profiles.find((x) => x.id === id)
    return p?.full_name ?? p?.email ?? '—'
  }

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Mentorships"
        description="Assign students to teachers. A teacher only has access to their assigned students — editable any time."
      />

      <div className="space-y-3">
        {students.map((s) => {
          const myLinks = links.filter((l) => l.student_id === s.id)
          return (
            <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{s.full_name ?? s.email}</p>
                  <p className="text-xs text-slate-400">
                    {s.email}{s.class_level ? ` · ${s.class_level}` : ''}
                  </p>
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
              <div className="mt-3 flex flex-wrap gap-2">
                {myLinks.map((l) => (
                  <span key={l.id} className="inline-flex items-center gap-2 rounded-full bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                    {nameOf(l.teacher_id)}
                    <form action={removeMentorAction} className="inline-flex">
                      <input type="hidden" name="id" value={l.id} />
                      <ConfirmSubmit className="text-red-600 hover:text-red-700" title="Remove mentor?" message="The teacher will lose access to this student." confirmLabel="Remove">
                        ✕
                      </ConfirmSubmit>
                    </form>
                  </span>
                ))}
                {myLinks.length === 0 && <span className="text-xs text-slate-400">No mentor assigned</span>}
              </div>
            </div>
          )
        })}
        {students.length === 0 && <p className="text-sm text-slate-400">No students yet.</p>}
      </div>
    </main>
  )
}
