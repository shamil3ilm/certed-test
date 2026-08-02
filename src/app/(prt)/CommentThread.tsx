'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import type { Comment, CommentEntity } from '@/lib/services/comments'
import { LocalTime } from './LocalTime'
import { addCommentAction, deleteCommentAction } from './comment-actions'
import { useUI } from './Providers'
import { assertActionOk } from './action-client'
import { createClientId, roleLabel, roleTone } from '@/lib/ui'

export function CommentThread({
  entityType,
  entityId,
  me,
  initialComments,
  placeholder = 'Write a comment...',
}: {
  entityType: CommentEntity
  entityId: string
  me: { id: string; role: string }
  initialComments: Comment[]
  placeholder?: string
}) {
  const serverSignature = initialComments.map((c) => c.id).join('|')

  return (
    <CommentThreadBody
      key={serverSignature}
      entityType={entityType}
      entityId={entityId}
      me={me}
      initialComments={initialComments}
      placeholder={placeholder}
    />
  )
}

function CommentThreadBody({
  entityType,
  entityId,
  me,
  initialComments,
  placeholder,
}: {
  entityType: CommentEntity
  entityId: string
  me: { id: string; role: string }
  initialComments: Comment[]
  placeholder: string
}) {
  const [comments, setComments] = useState(initialComments)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(initialComments.length > 0)
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState('')
  const textRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { toast } = useUI()

  // Clear the scroll timer only on unmount.
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    }
  }, [])

  function send() {
    const liveValue = textRef.current?.value ?? text
    const value = liveValue.trim()
    if (!value) return
    const tempId = createClientId('temp')

    setComments((current) => [
      ...current,
      {
        id: tempId,
        entity_type: entityType,
        entity_id: entityId,
        author_id: me.id,
        content: value,
        created_at: new Date().toISOString(),
        author_name: 'You',
        author_role: me.role,
      },
    ])
    setText('')

    const formData = new FormData()
    formData.set('entity_type', entityType)
    formData.set('entity_id', entityId)
    formData.set('content', value)

    startTransition(async () => {
      try {
        assertActionOk(await addCommentAction(formData), 'Comment failed to send')
        // Announce success to assistive tech - the failure path already toasts,
        // so a screen-reader user otherwise got no confirmation the post landed.
        setStatus('Comment posted.')
      } catch {
        setComments((current) => current.filter((comment) => comment.id !== tempId))
        setText(value)
        setStatus('')
        toast('Comment failed to send', 'error')
      }
    })

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    scrollTimeoutRef.current = setTimeout(() => {
      scrollTimeoutRef.current = null
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 50)
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    send()
  }

  function handleDelete(comment: Comment) {
    if (typeof window !== 'undefined' && !window.confirm('Delete this comment?')) return
    const snapshot = comments
    setComments((current) => current.filter((c) => c.id !== comment.id))
    const formData = new FormData()
    formData.set('id', comment.id)
    startTransition(async () => {
      try {
        assertActionOk(await deleteCommentAction(formData), 'Could not delete the comment')
        setStatus('Comment deleted.')
      } catch {
        setComments(snapshot)
        setStatus('')
        toast('Could not delete the comment', 'error')
      }
    })
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-10 items-center gap-1.5 rounded text-xs font-semibold text-slate-500 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        aria-expanded={open}
      >
        <svg
          aria-hidden="true"
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M6 4l4 4-4 4V4z" />
        </svg>
        {comments.length === 0 ? 'Add a comment' : `${comments.length} comment${comments.length !== 1 ? 's' : ''}`}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {comments.map((comment) => {
            const isMine = comment.author_id === me.id
            const tone = roleTone(comment.author_role)
            return (
              <div key={comment.id} className={`flex gap-2.5 ${isMine ? 'flex-row-reverse' : ''}`}>
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[10px] font-bold ${tone.avatar}`}
                >
                  {(comment.author_name ?? '?').slice(0, 1).toUpperCase()}
                </span>
                <div className={`flex max-w-[80%] flex-col gap-0.5 ${isMine ? 'items-end' : 'items-start'}`}>
                  <span className="text-[10px] text-slate-400">
                    {isMine ? 'You' : (comment.author_name ?? 'Unknown')} - {roleLabel(comment.author_role)} -{' '}
                    <LocalTime iso={comment.created_at} />
                  </span>
                  <div
                    className={`whitespace-pre-wrap rounded-2xl border px-3 py-2 text-sm leading-relaxed ${tone.bubble}`}
                  >
                    {comment.content}
                  </div>
                  {isMine && !comment.id.startsWith('temp-') && (
                    <button
                      type="button"
                      onClick={() => handleDelete(comment)}
                      disabled={isPending}
                      className="mt-0.5 text-[10px] text-slate-400 transition-colors hover:text-red-600 hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />

          <form onSubmit={handleSubmit} className="flex items-end gap-2 pt-1">
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-xs font-medium text-slate-500">Comment</span>
              <textarea
                ref={textRef}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    send()
                  }
                }}
                rows={1}
                aria-label={placeholder}
                placeholder={placeholder}
                disabled={isPending}
                className="min-w-0 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              />
            </label>
            <button type="submit" disabled={isPending || !text.trim()} className="btn btn-primary btn-sm">
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
