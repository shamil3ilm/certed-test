import Link from 'next/link'
import { requireClassAccess } from '../access'
import { classStreamPageUrl, loadClassStreamViewData } from '@/lib/services/page-data/class-stream'
import { LocalTime } from '../../LocalTime'
import {
  createAnnouncementAction,
  archiveAnnouncementAction,
  restoreAnnouncementAction,
  editAnnouncementAction,
} from '../../announcements/actions'
import { MeetForm } from '../../meetings/MeetForm'
import { MeetList } from '../../meetings/MeetList'
import { restoreMeetLinkAction } from '../../meetings/actions'
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

export default async function ClassStreamPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams?: { streamPage?: string; streamQ?: string; error?: string }
}) {
  const { me, course } = await requireClassAccess(params.id)
  const data = await loadClassStreamViewData(me, course, searchParams)

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <SectionLabel>Stream</SectionLabel>

        {searchParams?.error && (
          <AlertBanner>That change couldn&apos;t be saved. Please check the details and try again.</AlertBanner>
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

        {data.canManage && (
          <form action={createAnnouncementAction} className={cx(CARD, 'space-y-2 p-4')}>
            <h3 className="font-medium text-slate-900">Post an announcement</h3>
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
            <SubmitButton pendingLabel="Posting...">Post</SubmitButton>
          </form>
        )}

        <ul className="space-y-3">
          {data.activeAnnouncements.map((a) => (
            <Card as="li" key={a.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                    {a.title}
                    {a.class_id === null && <Badge tone="slate">Academy-wide</Badge>}
                  </h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{a.message}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    <LocalTime iso={a.created_at} />
                  </p>
                </div>
                {data.canManage && (data.isAdmin || a.class_id === course.id) && (
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

        {data.canManage && data.archivedAnnouncements.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-xs font-medium text-slate-400 transition hover:text-primary">
              {data.archivedAnnouncements.length} archived post{data.archivedAnnouncements.length !== 1 ? 's' : ''}
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
            </ul>
          </details>
        )}
      </section>

      <section className="space-y-4">
        <SectionLabel>Class meet</SectionLabel>
        {data.canManage && <MeetForm classes={data.classList} canGlobal={data.isAdmin} />}
        <MeetList
          meetLinks={data.meetLinks}
          initialComments={data.commentsByMeet}
          me={{ id: me.id, email: me.email, full_name: me.full_name, role: me.role }}
          classes={data.classList}
          canManage={data.canManage}
          isAdmin={data.isAdmin}
        />

        {data.canManage && data.archivedMeetLinks.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-xs font-medium text-slate-400 transition hover:text-primary">
              {data.archivedMeetLinks.length} removed link{data.archivedMeetLinks.length !== 1 ? 's' : ''}
            </summary>
            <ul className="mt-2 space-y-2">
              {data.archivedMeetLinks.map((m) => (
                <li key={m.id} className={ARCHIVED_ROW}>
                  <span className="truncate text-slate-500">{m.title}</span>
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
      </section>
    </div>
  )
}
