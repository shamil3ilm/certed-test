import { requireClassAccess } from '../access'
import { listAnnouncementsForClass } from '@/lib/services/announcements'
import { listMeetLinks } from '@/lib/services/meetLinks'
import { listCommentsForEntities } from '@/lib/services/comments'
import { LocalTime } from '../../LocalTime'
import {
  createAnnouncementAction,
  archiveAnnouncementAction,
  restoreAnnouncementAction,
  editAnnouncementAction,
} from '../../announcements/actions'
import { MeetForm } from '../../meetings/MeetForm'
import { MeetList } from '../../meetings/MeetList'
import { Card, EmptyState, Badge } from '../../ui'
import { Field, Input, Select, Textarea, SubmitButton } from '../../form'
import { ConfirmSubmit } from '../../ConfirmSubmit'

export default async function ClassStreamPage({ params }: { params: { id: string } }) {
  const { me, course } = await requireClassAccess(params.id)
  const canManage = me.role === 'admin' || me.role === 'teacher'
  const isAdmin = me.role === 'admin'
  // Global (academy-wide) posts show here too, but only an admin may manage them;
  // a class post is managed by a teacher of THIS class.
  const canManageAnn = (classId: string | null) => canManage && (isAdmin || classId === course.id)

  const [announcements, meetLinks] = await Promise.all([
    listAnnouncementsForClass(course.id, canManage),
    listMeetLinks(course.id),
  ])
  const activeAnnouncements = announcements.filter((a) => a.status === 'active')
  const archivedAnnouncements = announcements.filter(
    (a) => a.status === 'archived' && canManageAnn(a.class_id),
  )

  const commentsByMeet = await listCommentsForEntities('meet', meetLinks.map((m) => m.id))
  const classList = [{ id: course.id, name: course.name }]

  return (
    <div className="space-y-8">
      {/* Stream / announcements — the primary class activity */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Stream</h2>

        {canManage && (
          <form
            action={createAnnouncementAction}
            className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <h3 className="font-medium text-slate-900">Post an announcement</h3>
            {isAdmin ? (
              <Field label="Post to">
                <Select name="class_id" defaultValue={course.id}>
                  <option value={course.id}>This class</option>
                  <option value="">Academy-wide (all classes)</option>
                </Select>
              </Field>
            ) : (
              <input type="hidden" name="class_id" value={course.id} />
            )}
            <Input name="title" required placeholder="Title" />
            <Textarea name="message" required placeholder="Share something with your class…" rows={3} />
            <SubmitButton pendingLabel="Posting…">Post</SubmitButton>
          </form>
        )}

        <ul className="space-y-3">
          {activeAnnouncements.map((a) => (
            <Card as="li" key={a.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                    {a.title}
                    {a.class_id === null && <Badge tone="slate">Academy-wide</Badge>}
                  </h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{a.message}</p>
                  <p className="mt-2 text-xs text-slate-400"><LocalTime iso={a.created_at} /></p>
                </div>
                {canManageAnn(a.class_id) && (
                  <div className="flex shrink-0 gap-2">
                    <details className="relative text-xs">
                      <summary className="cursor-pointer btn btn-sm btn-soft">Edit</summary>
                      <form
                        action={editAnnouncementAction}
                        className="absolute right-0 z-10 mt-2 w-64 max-w-[calc(100vw-2rem)] space-y-2 rounded-lg border bg-slate-50 p-2 shadow-md"
                      >
                        <input type="hidden" name="id" value={a.id} />
                        <Input name="title" defaultValue={a.title} required />
                        <Textarea name="message" defaultValue={a.message} required rows={3} />
                        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
                      </form>
                    </details>
                    <form action={archiveAnnouncementAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <ConfirmSubmit
                        className="btn btn-sm btn-warning"
                        title="Archive this post?"
                        message="It's hidden from the class but kept on record — you can restore it."
                        confirmLabel="Archive"
                      >
                        Archive
                      </ConfirmSubmit>
                    </form>
                  </div>
                )}
              </div>
            </Card>
          ))}
          {activeAnnouncements.length === 0 && (
            <EmptyState as="li">Nothing posted to the class stream yet.</EmptyState>
          )}
        </ul>

        {canManage && archivedAnnouncements.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-xs font-medium text-slate-400 transition hover:text-primary">
              {archivedAnnouncements.length} archived post{archivedAnnouncements.length !== 1 ? 's' : ''}
            </summary>
            <ul className="mt-2 space-y-2">
              {archivedAnnouncements.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                  <span className="truncate text-slate-500">{a.title}</span>
                  <form action={restoreAnnouncementAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <SubmitButton className="btn-sm btn-success" pendingLabel="…">Restore</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* Class meet — folded in from the old standalone Meetings section */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Class meet</h2>
        {canManage && <MeetForm classes={classList} canGlobal={isAdmin} />}
        {/* Pass only the fields MeetList needs — never the whole `me` Profile, or
            auth_user_id / status would serialize into the client RSC payload. */}
        <MeetList
          meetLinks={meetLinks}
          initialComments={commentsByMeet}
          me={{ id: me.id, email: me.email, full_name: me.full_name, role: me.role }}
          classes={classList}
          isAdmin={isAdmin}
        />
      </section>
    </div>
  )
}
