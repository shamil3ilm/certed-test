'use client'
import { useRef, useState, useTransition } from 'react'
import { addCommentAction } from './comment-actions'
import { roleTone, roleLabel } from './ui'
import { useUI } from './Providers'
import { LocalTime } from './LocalTime'
import type { Comment, CommentEntity } from '@/lib/repos/comments'

/**
 * The one comment thread used everywhere — assignment submissions, class
 * materials and Meet links. Collapsible, with optimistic posting. The parent
 * passes what the comments hang off (`entityType` + `entityId`); the server
 * action + RLS decide who may actually post.
 */
export function CommentThread({
  entityType,
  entityId,
  me,
  initialComments,
  placeholder = 'Write a comment…',
}: {
  entityType: CommentEntity
  entityId: string
  me: { id: string; role: string }
  initialComments: Comment[]
  placeholder?: string
}) {
  const [comments, setComments] = useState(initialComments)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(initialComments.length > 0)
  const [isPending, startTransition] = useTransition()
  const bottomRef = useRef<HTMLDivElement>(null)
  const { toast } = useUI()

  function send() {
    const val = text.trim()
    if (!val) return
    const tempId = `temp-${new Date().getTime()}`
    // Optimistic — the server confirms on revalidate; rolled back on failure.
    setComments((prev) => [
      ...prev,
      {
        id: tempId,
        entity_type: entityType,
        entity_id: entityId,
        author_id: me.id,
        content: val,
        created_at: new Date().toISOString(),
        author_name: 'You',
        author_role: me.role,
      },
    ])
    setText('')
    const fd = new FormData()
    fd.set('entity_type', entityType)
    fd.set('entity_id', entityId)
    fd.set('content', val)
    startTransition(async () => {
      try {
        await addCommentAction(fd)
      } catch {
        setComments((prev) => prev.filter((c) => c.id !== tempId))
        setText(val)
        toast('Comment failed to send', 'error')
      }
    })
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    send()
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded text-xs font-semibold text-slate-500 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        aria-expanded={open}
      >
        <svg aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`} viewBox="0 0 16 16" fill="currentColor">
          <path d="M6 4l4 4-4 4V4z" />
        </svg>
        {comments.length === 0
          ? 'Add a comment'
          : `${comments.length} comment${comments.length !== 1 ? 's' : ''}`}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {comments.map((c) => {
            const isMine = c.author_id === me.id
            const tone = roleTone(c.author_role)
            return (
              <div key={c.id} className={`flex gap-2.5 ${isMine ? 'flex-row-reverse' : ''}`}>
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[10px] font-bold ${tone.avatar}`}>
                  {(c.author_name ?? '?').slice(0, 1).toUpperCase()}
                </span>
                <div className={`flex max-w-[80%] flex-col gap-0.5 ${isMine ? 'items-end' : 'items-start'}`}>
                  <span className="text-[10px] text-slate-400">
                    {isMine ? 'You' : c.author_name ?? 'Unknown'} · {roleLabel(c.author_role)} ·{' '}
                    <LocalTime iso={c.created_at} />
                  </span>
                  <div className={`whitespace-pre-wrap rounded-2xl border px-3 py-2 text-sm leading-relaxed ${tone.bubble}`}>
                    {c.content}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />

          <form onSubmit={handleSubmit} className="flex gap-2 pt-1">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter inserts a newline. Ignore Enter while an
                // IME candidate is composing so it doesn't submit mid-word.
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  send()
                }
              }}
              rows={1}
              aria-label={placeholder}
              placeholder={placeholder}
              disabled={isPending}
              className="min-w-0 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
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
