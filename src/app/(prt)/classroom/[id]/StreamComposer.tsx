'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Field, Input, Select, Textarea } from '../../form'
import { useUI } from '../../Providers'
import { CARD, cx } from '@/lib/ui'
import { createAnnouncementReturningId, createMeetPost } from './stream-actions'

/** Extensions the server accepts (see lib/attachments/validation). Pre-filters the
 *  OS dialog only - the upload route re-validates authoritatively. */
const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.zip'

/**
 * The class Stream composer. One form, two destinations: a post carrying a meeting
 * URL becomes a meet (join link), otherwise a plain announcement. Files attach to a
 * plain announcement via the academy's custodial storage - the post is created
 * first, then each file is uploaded to it (create-then-attach), so nothing is ever
 * shared from a personal Drive. Managers only; rendered inside the class page's
 * canManageContent guard.
 */
export function StreamComposer({ courseId, isAdmin }: { courseId: string; isAdmin: boolean }) {
  const router = useRouter()
  const { toast } = useUI()
  const [isPending, startTransition] = useTransition()
  const [classId, setClassId] = useState(courseId) // '' = academy-wide (admin only)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [url, setUrl] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [publishAt, setPublishAt] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const scopeId = isAdmin ? classId : courseId

  function reset() {
    setTitle('')
    setMessage('')
    setUrl('')
    setFiles([])
    setPublishAt('')
    setExpiresAt('')
    if (fileRef.current) fileRef.current.value = ''
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!title.trim() || !message.trim()) return

    startTransition(async () => {
      try {
        // A meeting URL routes to the meet service; a meeting has no custodial files.
        if (url.trim()) {
          const res = await createMeetPost({ classId: scopeId, title, message, url: url.trim() })
          if (!res.ok) {
            setError(res.error)
            return
          }
          toast('Meeting posted', 'success')
          reset()
          router.refresh()
          return
        }

        // Plain announcement: create it, then upload each file to it.
        const created = await createAnnouncementReturningId({
          classId: scopeId,
          title,
          message,
          publishAt: publishAt || undefined,
          expiresAt: expiresAt || undefined,
        })
        if (!created.ok) {
          setError(created.error)
          return
        }

        const failed: string[] = []
        for (const file of files) {
          const form = new FormData()
          form.append('file', file)
          form.append('owner', 'announcement')
          form.append('ownerId', created.announcementId)
          const res = await fetch('/api/attachments', { method: 'POST', body: form })
          const json = (await res.json().catch(() => null)) as { success?: boolean } | null
          if (!res.ok || !json?.success) failed.push(file.name)
        }

        if (failed.length > 0) {
          toast(
            `Posted, but ${failed.length} file(s) couldn't attach. Use "Add Attachment" on the post to retry.`,
            'error',
          )
        } else {
          toast('Posted to the class', 'success')
        }
        reset()
        router.refresh()
      } catch {
        setError('Could not post. Please try again in a moment.')
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className={cx(CARD, 'space-y-2 p-4')}>
      <h2 className="font-medium text-slate-900">Post to the class</h2>
      {isAdmin && (
        <Field label="Post to">
          <Select value={classId} onChange={(event) => setClassId(event.target.value)} disabled={isPending}>
            <option value={courseId}>This class</option>
            <option value="">Academy-wide (all classes)</option>
          </Select>
        </Field>
      )}
      <Field label="Title">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          maxLength={200}
          placeholder="Title"
          disabled={isPending}
        />
      </Field>
      <Field label="Message">
        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          required
          maxLength={5000}
          placeholder="Share something with your class..."
          rows={3}
          disabled={isPending}
        />
      </Field>

      <details className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-slate-600">Add a meeting link (optional)</summary>
        <div className="mt-2">
          <Field label="Meeting URL" hint="Adds a Join button. Set a start time later via the meeting's Edit.">
            <Input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              maxLength={2000}
              placeholder="https://meet.google.com/..."
              disabled={isPending}
            />
          </Field>
        </div>
      </details>

      <details className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-slate-600">
          Attachments &amp; scheduling (optional)
        </summary>
        <div className="mt-2 space-y-2">
          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Files</span>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              aria-label="Attach files"
              multiple
              disabled={isPending || Boolean(url.trim())}
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20 disabled:opacity-50"
            />
            <span className="block text-xs text-slate-400">
              {url.trim()
                ? 'A meeting post carries a join link, not files.'
                : 'Kept by the academy - PDF, Office docs, images or zip, up to 25 MB each.'}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Publish on" hint="Blank = publish now.">
              <Input
                type="date"
                value={publishAt}
                onChange={(event) => setPublishAt(event.target.value)}
                disabled={isPending || Boolean(url.trim())}
              />
            </Field>
            <Field label="Expires on" hint="Blank = never.">
              <Input
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                disabled={isPending || Boolean(url.trim())}
              />
            </Field>
          </div>
        </div>
      </details>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button type="submit" disabled={isPending} className="btn btn-primary">
        {isPending ? 'Posting...' : 'Post'}
      </button>
    </form>
  )
}
