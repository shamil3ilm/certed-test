'use client'

import { useState, useTransition } from 'react'
import type { Comment } from '@/lib/services/comments'
import type { MeetLink } from '@/lib/services/meet-links'
import { Badge, CARD, EmptyState, cx } from '@/lib/ui'
import { CommentThread } from '../CommentThread'
import { LocalTime } from '../LocalTime'
import { useUI } from '../Providers'
import { assertActionOk } from '../action-client'
import { deleteMeetLinkAction, editMeetLinkAction } from './actions'
import { isoToDatetimeLocal } from '@/lib/time/format'

type Profile = { id: string; email: string; full_name: string | null; role: string }

const MEET_GRACE_MS = 3 * 60 * 60 * 1000

export function MeetingsEmptyState() {
  return <EmptyState>No meeting links shared yet.</EmptyState>
}

export function MeetCard({
  link,
  classLabel,
  comments,
  me,
  canManage,
  now,
}: {
  link: MeetLink
  classLabel: string
  comments: Comment[]
  me: Profile
  canManage: boolean
  now: number
}) {
  const { confirm, toast } = useUI()
  const [isDeleting, startDeleteTransition] = useTransition()
  const [isSaving, startSaveTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const ended = link.scheduled_at != null && Date.parse(link.scheduled_at) + MEET_GRACE_MS < now
  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20'

  async function handleDelete() {
    const confirmed = await confirm({
      title: 'Remove this meeting link?',
      message: "It's hidden from the class but kept on record.",
      confirmLabel: 'Remove',
      variant: 'warning',
    })
    if (!confirmed) return

    startDeleteTransition(async () => {
      try {
        assertActionOk(await deleteMeetLinkAction(link.id), 'Could not remove meeting link')
        toast('Meeting link removed', 'success')
      } catch (deleteError) {
        toast(deleteError instanceof Error ? deleteError.message : 'Could not remove meeting link', 'error')
      }
    })
  }

  function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const rawScheduled = String(formData.get('scheduled_at') ?? '').trim()
    if (rawScheduled) {
      const date = new Date(rawScheduled)
      if (Number.isNaN(date.getTime())) return
      formData.set('scheduled_at', date.toISOString())
    } else {
      formData.set('scheduled_at', '')
    }
    formData.set('id', link.id)

    startSaveTransition(async () => {
      try {
        assertActionOk(await editMeetLinkAction(formData), 'Could not save changes')
        toast('Meeting link updated', 'success')
        setEditing(false)
      } catch (saveError) {
        toast(saveError instanceof Error ? saveError.message : 'Could not save changes', 'error')
      }
    })
  }

  return (
    <div className={cx(CARD, 'p-5 transition hover:shadow-md')}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={link.class_id ? 'primary' : 'slate'}>{classLabel}</Badge>
            {link.scheduled_at ? (
              ended ? (
                <Badge tone="danger">Ended</Badge>
              ) : (
                <span className="text-xs font-medium text-slate-500">
                  Starts <LocalTime iso={link.scheduled_at} />
                </span>
              )
            ) : (
              <span className="text-xs text-slate-400">
                Posted <LocalTime iso={link.created_at} mode="date" />
              </span>
            )}
          </div>
          <h3 className="mt-2 break-words text-base font-bold text-slate-900">{link.title}</h3>
          {link.description && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500">{link.description}</p>}
        </div>

        {canManage && !editing && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`Edit meeting link ${link.title}`}
              className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-primary/5 hover:text-primary"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              aria-label={`Remove meeting link ${link.title}`}
              className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              title="Delete link"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <form onSubmit={handleEditSubmit} className="mt-4 space-y-2 border-t border-slate-100 pt-4">
          <input
            name="title"
            defaultValue={link.title}
            required
            placeholder="Title"
            aria-label="Meeting title"
            className={inputClass}
          />
          <input
            name="url"
            type="url"
            defaultValue={link.url}
            required
            placeholder="Meet URL"
            aria-label="Meet URL"
            className={inputClass}
          />
          <input
            name="description"
            defaultValue={link.description ?? ''}
            placeholder="Description (optional)"
            aria-label="Meeting description"
            className={inputClass}
          />
          <label className="block text-xs font-medium text-slate-500">
            Scheduled time (optional)
            <input
              name="scheduled_at"
              type="datetime-local"
              defaultValue={link.scheduled_at ? isoToDatetimeLocal(link.scheduled_at) : ''}
              className={cx(inputClass, 'mt-1')}
            />
          </label>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={isSaving} className="btn btn-sm btn-primary">
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="btn btn-sm btn-ghost">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
          {ended ? (
            <span className="text-sm text-slate-400">This session has ended.</span>
          ) : (
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm btn-primary inline-flex items-center gap-1.5"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              Join meeting
            </a>
          )}
        </div>
      )}

      <CommentThread
        entityType="meet"
        entityId={link.id}
        me={{ id: me.id, role: me.role }}
        initialComments={comments}
        placeholder="Ask a question or discuss..."
      />
    </div>
  )
}
