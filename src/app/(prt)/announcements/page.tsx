import { requireRole } from '@/lib/auth/requireRole'
import { listAnnouncements } from '@/lib/repos/announcements'
import { listCourses } from '@/lib/repos/courses'
import { createAnnouncementAction, archiveAnnouncementAction, editAnnouncementAction } from './actions'
import { PageHeader } from '../ui'

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string }
}) {
  const me = await requireRole(['admin', 'teacher', 'student'])
  const page = Number(searchParams.page ?? '1') || 1
  const { items } = await listAnnouncements({ search: searchParams.q, page })
  const canPost = me.role === 'admin' || me.role === 'teacher'
  const courses = canPost ? await listCourses() : []

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <PageHeader title="Announcements" />

      <form className="mt-4 flex gap-2" action="/announcements">
        <input
          name="q"
          defaultValue={searchParams.q ?? ''}
          placeholder="Search title…"
          className="rounded border px-2 py-1"
        />
        <button className="rounded border px-3 py-1">Search</button>
      </form>

      {canPost && (
        <form action={createAnnouncementAction} className="mt-6 space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="font-medium">Post an announcement</h2>
          <select name="course_id" className="block w-full rounded border px-2 py-1">
            <option value="">Global (all)</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input name="title" required placeholder="Title" className="block w-full rounded border px-2 py-1" />
          <textarea name="message" required placeholder="Message" rows={3} className="block w-full rounded border px-2 py-1" />
          <button className="btn btn-primary">Post</button>
        </form>
      )}

      <ul className="mt-6 space-y-3">
        {items.map((a) => (
          <li key={a.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-medium">{a.title}</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{a.message}</p>
                <p className="mt-2 text-xs text-slate-400">
                  {a.course_id ? 'Course' : 'Global'} · {new Date(a.created_at).toLocaleString()}
                </p>
              </div>
              {canPost && a.status === 'active' && (
                <div className="flex shrink-0 gap-3">
                  <details className="text-xs">
                    <summary className="cursor-pointer btn btn-sm btn-soft">Edit</summary>
                    <form action={editAnnouncementAction} className="mt-2 w-64 space-y-2 rounded-lg border bg-slate-50 p-2">
                      <input type="hidden" name="id" value={a.id} />
                      <input name="title" defaultValue={a.title} required className="block w-full rounded border px-2 py-1" />
                      <textarea name="message" defaultValue={a.message} required rows={3} className="block w-full rounded border px-2 py-1" />
                      <button className="btn btn-primary">Save</button>
                    </form>
                  </details>
                  <form action={archiveAnnouncementAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <button className="btn btn-sm btn-warning">Archive</button>
                  </form>
                </div>
              )}
            </div>
          </li>
        ))}
        {items.length === 0 && (
          <li className="p-4 text-center text-slate-400">No announcements.</li>
        )}
      </ul>
    </main>
  )
}
