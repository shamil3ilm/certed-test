'use client'

import { useState, useTransition, useRef } from 'react'
import { addResourceCommentAction } from './actions'
import type { ResourceComment } from '@/lib/repos/resourceComments'

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

export function ResourceCommentsSection({
  resourceId,
  initialComments,
  me,
}: {
  resourceId: string
  initialComments: ResourceComment[]
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
        resource_id: resourceId,
        author_id: me.id,
        content: val,
        created_at: new Date().toISOString(),
        author_name: 'You',
        author_role: me.role,
      },
    ])

    setText('')
    const fd = new FormData()
    fd.set('resourceId', resourceId)
    fd.set('content', val)

    startTransition(async () => {
      await addResourceCommentAction(fd)
    })
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
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
