'use client'

import { useState, useTransition } from 'react'
import { checkDriveLink } from '@/lib/drive-link'
import { assertActionOk } from '../action-client'
import { createLinkResourceAction } from './actions'

type ClassRow = { id: string; name: string }

export function UploadForm({ classes }: { classes: ClassRow[] }) {
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState('')
  const [classId, setClassId] = useState(classes[0]?.id ?? '')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const single = classes.length === 1
  const linkCheck = checkDriveLink(url)

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!classId || !title.trim() || !url.trim()) return

    const formData = new FormData()
    formData.append('classId', classId)
    formData.append('title', title.trim())
    formData.append('url', url.trim())

    startTransition(async () => {
      try {
        assertActionOk(await createLinkResourceAction(formData), 'Something went wrong')
        setTitle('')
        setUrl('')
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : 'Something went wrong')
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="border-b border-slate-100 pb-3">
        <h2 className="text-base font-semibold text-slate-900">Share a resource</h2>
        <p className="mt-0.5 text-xs text-slate-500">Paste a Google Drive share link to the material.</p>
      </div>

      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <div className={single ? 'space-y-1' : 'grid gap-3 sm:grid-cols-2'}>
        {!single && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500">Class</label>
            <select
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              required
              disabled={isPending}
              className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-primary focus:bg-white focus:outline-none"
            >
              {classes.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">Resource title</label>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Chapter 4 Practice Questions"
            required
            disabled={isPending}
            className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-primary focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-500">Google Drive link</label>
        <input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://drive.google.com/..."
          required
          disabled={isPending}
          className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-primary focus:bg-white focus:outline-none"
        />
        {linkCheck === 'folder' && (
          <p className="text-xs text-amber-600">
            That looks like a Drive <span className="font-medium">folder</span> link - link the specific file so students open just this resource.
          </p>
        )}
        {linkCheck === 'not-drive' && (
          <p className="text-xs text-amber-600">
            That is not a Drive link - fine for Google Docs, YouTube, or a website. Just make sure it opens for students who are not signed in as you.
          </p>
        )}
        <p className="text-xs text-slate-400">
          Set the file sharing to <span className="font-medium text-slate-500">"Anyone with the link"</span> so students can open it - test it in a private/incognito window. Naming it <span className="font-medium text-slate-500">YYYY-MM-DD-topic</span> keeps your Drive tidy.
        </p>
      </div>

      <button type="submit" disabled={isPending} className="btn btn-primary">
        {isPending ? 'Sharing...' : 'Share link'}
      </button>
    </form>
  )
}
