'use client'

import { useTransition } from 'react'
import { deleteMeetLinkAction } from './actions'
import { CommentThread } from '../CommentThread'
import { useUI } from '../Providers'
import { LocalTime } from '../LocalTime'
import type { MeetLink } from '@/lib/services/meetLinks'
import type { Comment } from '@/lib/services/comments'

type Profile = { id: string; email: string; full_name: string | null; role: string }

export function MeetList({
  meetLinks,
  initialComments,
  me,
  classes,
  isAdmin,
}: {
  meetLinks: MeetLink[]
  initialComments: Map<string, Comment[]>
  me: Profile
  classes: { id: string; name: string }[]
  isAdmin: boolean
}) {
  const classMap = new Map(classes.map((c) => [c.id, c.name]))
  const canManage = me.role === 'admin' || me.role === 'teacher'
  const currentClassId = classes[0]?.id ?? null

  return (
    <div className="space-y-4">
      {meetLinks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
          No meeting links shared yet.
        </div>
      ) : (
        meetLinks.map((link) => (
          <MeetCard
            key={link.id}
            link={link}
            classLabel={classMap.get(link.class_id ?? '') ?? 'Academy-wide'}
            comments={initialComments.get(link.id) ?? []}
            me={me}
            // Global (null) links are admin-only; a class link is managed by its class's teacher.
            canManage={canManage && (isAdmin || link.class_id === currentClassId)}
          />
        ))
      )}
    </div>
  )
}

function MeetCard({
  link,
  classLabel,
  comments,
  me,
  canManage,
}: {
  link: MeetLink
  classLabel: string
  comments: Comment[]
  me: Profile
  canManage: boolean
}) {
  const { confirm, toast } = useUI()
  const [isDeleting, startDeleteTransition] = useTransition()
  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Remove this meeting link?',
      message: "It's hidden from the class but kept on record.",
      confirmLabel: 'Remove',
      variant: 'warning',
    })
    if (!ok) return
    startDeleteTransition(async () => {
      await deleteMeetLinkAction(link.id)
      toast('Meeting link removed', 'success')
    })
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              link.class_id ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-600'
            }`}>
              {classLabel}
            </span>
            <span className="text-xs text-slate-400">
              <LocalTime iso={link.created_at} mode="date" />
            </span>
          </div>
          <h3 className="mt-2 break-words text-base font-bold text-slate-900">{link.title}</h3>
          {link.description && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500">{link.description}</p>
          )}
        </div>

        {canManage && (
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="-m-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            title="Delete link"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-sm btn-primary inline-flex items-center gap-1.5"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Join Class
        </a>
      </div>

      <CommentThread
        entityType="meet"
        entityId={link.id}
        me={{ id: me.id, role: me.role }}
        initialComments={comments}
        placeholder="Ask a question or discuss…"
      />
    </div>
  )
}
