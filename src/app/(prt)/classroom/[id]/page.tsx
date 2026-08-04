import Link from 'next/link'
import { requireClassAccess } from '../access'
import { classStreamPageUrl, loadClassStreamViewData } from '@/lib/services/page-data/class-stream'
import { loadClassMeetViewData } from '@/lib/services/page-data/class-meet'
import { LocalTime } from '../../LocalTime'
import {
  archiveAnnouncementAction,
  restoreAnnouncementAction,
  editAnnouncementAction,
} from '../../announcements/actions'
import { restoreMeetLinkAction } from '../../meetings/actions'
import { MeetList } from '../../meetings/MeetList'
import { createStreamPostAction } from './stream-actions'
import { AttachmentList } from './AttachmentList'
import {
  AlertBanner,
  ARCHIVED_ROW,
  CARD,
  Card,
  EmptyState,
  Badge,
  SectionLabel,
  FilterBar,
  FilterField,
  FILTER_CONTROL,
  cx,
} from '@/lib/ui'
import { Field, Input, Select, Textarea, SubmitButton } from '../../form'
import { ConfirmSubmit } from '../../ConfirmSubmit'
import { EscapableDetails } from '../../EscapableDetails'
import { CommentThread } from '../../CommentThread'

export default async function ClassStreamPage(props: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ streamPage?: string; streamQ?: string; error?: string }>
}) {
  const searchParams = await props.searchParams
  const params = await props.params
  const { me, course } = await requireClassAccess(params.id)
  // One feed, two sources: announcements + meetings live under a single Stream
  // tab. They stay separate rows in the database - we just merge them here.
  const [data, meet] = await Promise.all([
    loadClassStreamViewData(me, course, searchParams),
    loadClassMeetViewData(me, course),
  ])
  // The scheduled/expired badges read the loader's server render clock rather
  // than calling the impure Date.now() during render (react-hooks/purity); this
  // also keeps every badge on the same instant as the loader's isLive filter.
  const now = data.nowMs

  return (
    <div className="space-y-6">
      <SectionLabel>Stream</SectionLabel>

      {searchParams?.error && (
        <AlertBanner>That change couldn&apos;t be saved. Please check the details and try again.</AlertBanner>
      )}

      {data.isArchived && data.canManage && (
        <AlertBanner>
          This class is archived. Existing posts and links remain visible, but new class content is disabled until the
          class is restored.
        </AlertBanner>
      )}

      {data.canManageContent && (
        <form action={createStreamPostAction} className={cx(CARD, 'space-y-2 p-4')}>
          <h3 className="font-medium text-slate-900">Post to the class</h3>
          <input type="hidden" name="stream_class_id" value={course.id} />
          {data.isAdmin ? (
            <Field label="Post to">
              <Select name="class_id" defaultValue={course.id}>
                <option value={course.id}>This class</option>
                <option value="">Academy-wide (all classes)</option>
              </Select>
            </Field>
          ) : (
            <input type="hidden" name="class_id" value={course.id} />
          )}
          <Field label="Title">
            <Input name="title" required maxLength={200} placeholder="Title" />
          </Field>
          <Field label="Message">
            <Textarea
              name="message"
              required
              maxLength={5000}
              placeholder="Share something with your class..."
              rows={3}
            />
          </Field>
          {/* Attach a join link to turn this post into a meeting (with its own
              Q&A thread). Leave blank for a plain announcement. */}
          <details className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-slate-600">
              Add a meeting link (optional)
            </summary>
            <div className="mt-2">
              <Field label="Meeting URL" hint="Adds a Join button. Set a start time later via the meeting's Edit.">
                <Input name="url" type="url" maxLength={2000} placeholder="https://meet.google.com/..." />
              </Field>
            </div>
          </details>
          <details className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-slate-600">
              Attachments &amp; scheduling (optional)
            </summary>
            <div className="mt-2 space-y-2">
              <Field
                label="Attachment links"
                hint="One Google Drive / external link per line - PDFs and images preview inline."
              >
                <Textarea name="attachments" rows={2} placeholder={'https://drive.google.com/file/d/.../view'} />
              </Field>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Publish on" hint="Blank = publish now.">
                  <Input name="publish_at" type="date" />
                </Field>
                <Field label="Expires on" hint="Blank = never.">
                  <Input name="expires_at" type="date" />
                </Field>
              </div>
            </div>
          </details>
          <SubmitButton pendingLabel="Posting...">Post</SubmitButton>
        </form>
      )}

      {meet.meetLinks.length > 0 && (
        <MeetList
          meetLinks={meet.meetLinks}
          initialComments={meet.commentsByMeet}
          me={{ id: me.id, email: me.email, full_name: me.full_name, role: me.role }}
          classes={meet.classList}
          canManage={meet.canManage}
          isAdmin={meet.isAdmin}
        />
      )}

      <FilterBar clearHref="?" showClear={Boolean(data.streamQ)} applyLabel="Search">
        <FilterField label="Search posts" className="min-w-0 flex-1 sm:max-w-xs">
          <input
            type="search"
            name="streamQ"
            defaultValue={data.streamQ ?? ''}
            placeholder="Title or message..."
            className={cx(FILTER_CONTROL, 'w-full')}
          />
        </FilterField>
      </FilterBar>

      <ul className="space-y-3">
        {data.activeAnnouncements.map((a) => (
          <Card as="li" key={a.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                  {a.title}
                  {a.class_id === null && <Badge tone="slate">Academy-wide</Badge>}
                  {a.publish_at && Date.parse(a.publish_at) > now && <Badge tone="warning">Scheduled</Badge>}
                  {a.expires_at && Date.parse(a.expires_at) <= now && <Badge tone="danger">Expired</Badge>}
                </h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{a.message}</p>
                <AttachmentList attachments={a.attachments} />
                <p className="mt-2 text-xs text-slate-400">
                  <LocalTime iso={a.created_at} />
                  {a.publish_at && Date.parse(a.publish_at) > now && (
                    <>
                      {' · publishes '}
                      <LocalTime iso={a.publish_at} mode="date" />
                    </>
                  )}
                  {a.expires_at && (
                    <>
                      {' · expires '}
                      <LocalTime iso={a.expires_at} mode="date" />
                    </>
                  )}
                </p>
              </div>
              {data.canManageContent && (data.isAdmin || a.class_id === course.id) && (
                <div className="flex shrink-0 gap-2">
                  <EscapableDetails
                    className="relative text-xs"
                    summaryClassName="cursor-pointer btn btn-sm btn-soft"
                    summary="Edit"
                  >
                    <form
                      action={editAnnouncementAction}
                      className="absolute right-0 z-10 mt-2 w-64 max-w-[calc(100vw-2rem)] space-y-2 rounded-lg border bg-slate-50 p-2 shadow-md"
                    >
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="stream_class_id" value={course.id} />
                      <Field label="Title">
                        <Input name="title" defaultValue={a.title} required maxLength={200} />
                      </Field>
                      <Field label="Message">
                        <Textarea name="message" defaultValue={a.message} required maxLength={5000} rows={3} />
                      </Field>
                      <Field label="Attachment links (one per line)">
                        <Textarea
                          name="attachments"
                          defaultValue={a.attachments.map((x) => x.url).join('\n')}
                          rows={2}
                        />
                      </Field>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Publish on">
                          <Input
                            name="publish_at"
                            type="date"
                            defaultValue={a.publish_at ? a.publish_at.slice(0, 10) : ''}
                          />
                        </Field>
                        <Field label="Expires on">
                          <Input
                            name="expires_at"
                            type="date"
                            defaultValue={a.expires_at ? a.expires_at.slice(0, 10) : ''}
                          />
                        </Field>
                      </div>
                      <SubmitButton pendingLabel="Saving...">Save</SubmitButton>
                    </form>
                  </EscapableDetails>
                  <form action={archiveAnnouncementAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="stream_class_id" value={course.id} />
                    <ConfirmSubmit
                      className="btn btn-sm btn-warning"
                      title="Archive this post?"
                      message="It's hidden from the class but kept on record - you can restore it."
                      confirmLabel="Archive"
                    >
                      Archive
                    </ConfirmSubmit>
                  </form>
                </div>
              )}
            </div>
            <CommentThread
              entityType="announcement"
              entityId={a.id}
              me={{ id: me.id, role: me.role }}
              initialComments={data.commentsByAnnouncement.get(a.id) ?? []}
              placeholder="Ask a question or discuss..."
            />
          </Card>
        ))}
        {data.streamTotal === 0 && (
          <EmptyState as="li">
            {data.streamQ ? `No posts match "${data.streamQ}".` : 'Nothing posted to the class stream yet.'}
          </EmptyState>
        )}
      </ul>

      {data.streamTotalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            Page {data.streamPage} of {data.streamTotalPages} - {data.streamTotal} total
          </span>
          <div className="flex gap-2">
            {data.streamPage > 1 && (
              <Link href={classStreamPageUrl(data.streamPage - 1, data.streamQ)} className="btn btn-sm btn-soft">
                Previous
              </Link>
            )}
            {data.streamPage < data.streamTotalPages && (
              <Link href={classStreamPageUrl(data.streamPage + 1, data.streamQ)} className="btn btn-sm btn-soft">
                Next
              </Link>
            )}
          </div>
        </div>
      )}

      {data.canManage && (data.archivedAnnouncements.length > 0 || meet.archivedMeetLinks.length > 0) && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-medium text-slate-400 transition hover:text-primary">
            {data.archivedAnnouncements.length + meet.archivedMeetLinks.length} archived item
            {data.archivedAnnouncements.length + meet.archivedMeetLinks.length !== 1 ? 's' : ''}
          </summary>
          <ul className="mt-2 space-y-2">
            {data.archivedAnnouncements.map((a) => (
              <li key={a.id} className={ARCHIVED_ROW}>
                <span className="truncate text-slate-500">{a.title}</span>
                <form action={restoreAnnouncementAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="stream_class_id" value={course.id} />
                  <SubmitButton className="btn-sm btn-success" pendingLabel="...">
                    Restore
                  </SubmitButton>
                </form>
              </li>
            ))}
            {meet.archivedMeetLinks.map((m) => (
              <li key={m.id} className={ARCHIVED_ROW}>
                <span className="truncate text-slate-500">{m.title} (meeting)</span>
                <form action={restoreMeetLinkAction.bind(null, m.id, course.id)}>
                  <SubmitButton className="btn-sm btn-success" pendingLabel="...">
                    Restore
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
