import { requireRole } from '@/lib/auth/requireRole'
import { listAuditLog } from '@/lib/repos/audit'
import { listProfiles } from '@/lib/repos/users'
import { PageHeader } from '../../ui'

const DEPTS: { key: string; label: string }[] = [
  { key: '', label: 'All departments' },
  { key: 'profile', label: 'Users' },
  { key: 'course', label: 'Courses' },
  { key: 'mentorship', label: 'Mentorships' },
  { key: 'receipt', label: 'Receipts' },
  { key: 'payslip', label: 'Pay slips' },
  { key: 'announcement', label: 'Announcements' },
  { key: 'assignment', label: 'Assignments' },
  { key: 'timetable_slot', label: 'Timetable' },
  { key: 'calendar_event', label: 'Events' },
]

const DEPT_LABEL: Record<string, string> = {
  profile: 'Users', course: 'Courses', enrollment: 'Courses', course_teacher: 'Courses',
  mentorship: 'Mentorships', receipt: 'Finance', payslip: 'Finance', announcement: 'Announcements',
  resource: 'Resources', assignment: 'Assignments', submission: 'Assignments',
  timetable_slot: 'Calendar', calendar_event: 'Calendar',
}

function badgeClass(action: string): string {
  if (/(archive|deactivate)/.test(action)) return 'bg-amber-50 text-amber-700'
  if (/(revoke|void|delete|unassign|unenroll|remove)/.test(action)) return 'bg-red-50 text-red-700'
  if (/(create|add|issue|restore|enroll|assign|activate|upload)/.test(action)) return 'bg-emerald-50 text-emerald-700'
  if (/(edit|rename|update|password)/.test(action)) return 'bg-primary/10 text-primary'
  return 'bg-slate-100 text-slate-600'
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: { dept?: string; actor?: string }
}) {
  await requireRole(['admin'])
  const dept = searchParams.dept ?? ''
  const actor = searchParams.actor ?? ''
  const [profiles, all] = await Promise.all([
    listProfiles(),
    listAuditLog({ entityType: dept || undefined, limit: 300 }),
  ])
  const entries = actor ? all.filter((e) => e.actor_id === actor) : all
  const who = (id: string | null) => {
    if (!id) return { name: 'system', role: '' }
    const p = profiles.find((x) => x.id === id)
    return { name: p?.full_name ?? p?.email ?? '—', role: p?.role ?? '' }
  }

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <PageHeader title="History" description="Activity across all departments and users — who did what, and when." />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="text-slate-500">Department</span>
          <select name="dept" defaultValue={dept} className="mt-1 block">
            {DEPTS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-slate-500">User</span>
          <select name="actor" defaultValue={actor} className="mt-1 block">
            <option value="">Everyone</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{(p.full_name ?? p.email)} · {p.role}</option>
            ))}
          </select>
        </label>
        <button className="btn btn-sm btn-soft">Apply</button>
        {(dept || actor) && <a href="/admin/history" className="btn btn-sm btn-ghost">Clear</a>}
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Department</th>
              <th>Action</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const w = who(e.actor_id)
              return (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-slate-500">{new Date(e.created_at).toLocaleString()}</td>
                  <td>{DEPT_LABEL[e.entity_type] ?? e.entity_type}</td>
                  <td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass(e.action)}`}>{e.action}</span>
                  </td>
                  <td>
                    {w.name}
                    {w.role && <span className="ml-1 text-xs text-slate-400">({w.role})</span>}
                  </td>
                </tr>
              )
            })}
            {entries.length === 0 && (
              <tr><td colSpan={4} className="p-6 text-center text-slate-400">No activity for this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}
