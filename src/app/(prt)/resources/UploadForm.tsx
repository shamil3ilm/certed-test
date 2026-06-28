'use client'

import { useState, useTransition } from 'react'
import { useResumableUpload } from '@/lib/hooks/useResumableUpload'
import { createLinkResourceAction } from './actions'

type Course = { id: string; name: string }

export function UploadForm({ courses }: { courses: Course[] }) {
  const { upload, status: uploadStatus, error: uploadError } = useResumableUpload()
  const [isPending, startTransition] = useTransition()
  
  const [mode, setMode] = useState<'file' | 'link'>('file')
  const [title, setTitle] = useState('')
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!courseId || !title.trim()) return

    if (mode === 'file') {
      if (!file) return
      const res = await upload({ courseId, title: title.trim(), file })
      if (res) {
        setTitle('')
        setFile(null)
        location.reload()
      }
    } else {
      if (!url.trim()) return
      const formData = new FormData()
      formData.append('courseId', courseId)
      formData.append('title', title.trim())
      formData.append('url', url.trim())

      startTransition(async () => {
        try {
          await createLinkResourceAction(formData)
          setTitle('')
          setUrl('')
          location.reload()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Something went wrong')
        }
      })
    }
  }

  const isUploading = uploadStatus === 'uploading' || isPending

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h2 className="text-base font-semibold text-slate-900">Share a resource</h2>
        
        {/* Mode switcher tabs */}
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setMode('file')}
            disabled={isUploading}
            className={`rounded-md px-3 py-1 transition-colors ${
              mode === 'file' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Upload File
          </button>
          <button
            type="button"
            onClick={() => setMode('link')}
            disabled={isUploading}
            className={`rounded-md px-3 py-1 transition-colors ${
              mode === 'link' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Share Link
          </button>
        </div>
      </div>

      {(error || uploadError) && (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">
          {error || uploadError}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">Course</label>
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            required
            disabled={isUploading}
            className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-primary focus:bg-white focus:outline-none"
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">Resource Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Chapter 4 Practice Questions"
            required
            disabled={isUploading}
            className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-850 focus:border-primary focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {mode === 'file' ? (
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">Select File</label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
            disabled={isUploading}
            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
          />
        </div>
      ) : (
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">Link URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://notion.so/..."
            required
            disabled={isUploading}
            className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-850 focus:border-primary focus:bg-white focus:outline-none"
          />
        </div>
      )}

      <button
        type="submit"
        disabled={isUploading}
        className="btn btn-primary"
      >
        {isUploading
          ? mode === 'file'
            ? 'Uploading to Drive...'
            : 'Saving Link...'
          : mode === 'file'
          ? 'Upload to Drive'
          : 'Share Link'}
      </button>
    </form>
  )
}
