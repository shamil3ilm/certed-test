'use client'

import { useState, useTransition, useRef } from 'react'
import { deleteMeetLinkAction, addMeetCommentAction } from './actions'
import type { MeetLink } from '@/lib/repos/meetLinks'
import type { MeetComment } from '@/lib/repos/meetComments'

type Profile = { id: string; email: string; full_name: string | null; role: string }

function roleColor(role?: string | null) {
  if (role === 'admin') return 'bg-violet-100 text-violet-800 border-violet-200'
  if (role === 'teacher') return 'bg-sky-100 text-sky-800 border-sky-200'
  return 'bg-emerald-100 text-emerald-800 border-emerald-200'
}

function roleBubble(role?: string | null) {
  if (role === 'admin') return 'bg-violet-50 border-violet-200'
  if (role === 'teacher') return 'bg-sky-50 border-sky-200'
  return 'bg-emerald-50 border-emerald-200'
}

function roleTag(role?: string | null) {
  if (role === 'teacher') return 'Tutor'
  if (role === 'admin') return 'Admin'
  return 'Student'
}

export function MeetList({
  meetLinks,
  initialComments,
  me,
  courses,
}: {
  meetLinks: MeetLink[]
  initialComments: Record<string, MeetComment[]>
  me: Profile
  courses: { id: string; name: string }[]
}) {
  const courseMap = new Map(courses.map((c) => [c.id, c.name]))
  const canManage = me.role === 'admin' || me.role === 'teacher'

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
            courseName={courseMap.get(link.course_id ?? '') ?? 'Global'}
            comments={initialComments[link.id] ?? []}
            me={me}
            canManage={canManage}
          />
        ))
      )}
    </div>
  )
}

function MeetCard({
  link,
  courseName,
  comments: initialComments,
  me,
  canManage,
}: {
  link: MeetLink
  courseName: string
  comments: MeetComment[]
  me: Profile
  canManage: boolean
}) {
  const [isDeleting, startDeleteTransition] = useTransition()
  const handleDelete = () => {
    if (!confirm('Are you sure you want to delete this meeting link?')) return
    startDeleteTransition(() => deleteMeetLinkAction(link.id))
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              link.course_id ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-600'
            }`}>
              {courseName}
            </span>
            <span className="text-xs text-slate-400">
              {new Date(link.created_at).toLocaleDateString()}
            </span>
          </div>
          <h3 className="mt-2 text-base font-bold text-slate-900">{link.title}</h3>
          {link.description && (
            <p className="mt-1 text-sm text-slate-500 whitespace-pre-wrap">{link.description}</p>
          )}
        </div>

        {canManage && (
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50"
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

      {/* Embedded Comments Thread */}
      <MeetCommentsSection
        meetLinkId={link.id}
        initialComments={initialComments}
        me={me}
      />
    </div>
  )
}

function MeetCommentsSection({
  meetLinkId,
  initialComments,
  me,
}: {
  meetLinkId: string
  initialComments: MeetComment[]
  me: Profile
}) {
  const [comments, setComments] = useState(initialComments)
  const [isPending, startTransition] = useTransition()
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const val = text.trim()
    if (!val) return

    // Optimistic UI update
    setComments((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        meet_link_id: meetLinkId,
        author_id: me.id,
        content: val,
        created_at: new Date().toISOString(),
        author_name: 'You',
        author_role: me.role,
      },
    ])

    setText('')
    const fd = new FormData()
    fd.set('meetLinkId', meetLinkId)
    fd.set('content', val)

    startTransition(async () => {
      await addMeetCommentAction(fd)
    })
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-primary transition-colors focus:outline-none"
      >
        <svg className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`} viewBox="0 0 16 16" fill="currentColor">
          <path d="M6 4l4 4-4 4V4z" />
        </svg>
        {comments.length === 0 ? 'Add a comment' : `${comments.length} comment${comments.length !== 1 ? 's' : ''}`}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {comments.map((c) => {
            const isMine = c.author_id === me.id
            return (
              <div key={c.id} className={`flex gap-2.5 ${isMine ? 'flex-row-reverse' : ''}`}>
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold border ${roleColor(c.author_role)}`}>
                  {(c.author_name ?? '?').slice(0, 1).toUpperCase()}
                </span>
                <div className={`max-w-[80%] ${isMine ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                  <span className="text-[10px] text-slate-400">
                    {isMine ? 'You' : c.author_name ?? 'Unknown'} · {roleTag(c.author_role)} ·{' '}
                    {new Date(c.created_at).toLocaleString()}
                  </span>
                  <div className={`rounded-2xl border px-3 py-2 text-sm leading-relaxed ${roleBubble(c.author_role)}`}>
                    {c.content}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />

          <form onSubmit={handleSubmit} className="flex gap-2 pt-1">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask a question or discuss..."
              disabled={isPending}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isPending || !text.trim()}
              className="rounded-xl bg-primary px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
