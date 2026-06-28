'use client'

import { useState, useTransition } from 'react'
import { createMeetLinkAction } from './actions'

type Course = { id: string; name: string }

export function MeetForm({ courses, canGlobal }: { courses: Course[]; canGlobal: boolean }) {
  const [isPending, startTransition] = useTransition()
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!title.trim() || !url.trim()) return

    const formData = new FormData()
    formData.append('courseId', courseId)
    formData.append('title', title.trim())
    formData.append('url', url.trim())
    formData.append('description', description.trim())

    startTransition(async () => {
      try {
        await createMeetLinkAction(formData)
        setTitle('')
        setUrl('')
        setDescription('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Share a Meet Link</h2>
      
      {error && (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">Course Scope</label>
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            required
            className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-primary focus:bg-white focus:outline-none"
          >
            {canGlobal && <option value="global">Global (All Courses)</option>}
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Maths Doubt Class"
            required
            className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-850 focus:border-primary focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-500">Meet URL</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://meet.google.com/..."
          required
          className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-850 focus:border-primary focus:bg-white focus:outline-none"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-500">Description (Optional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Topics to cover, timings, worksheets to bring..."
          rows={2}
          className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-850 focus:border-primary focus:bg-white focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="btn btn-primary w-full justify-center sm:w-auto"
      >
        {isPending ? 'Sharing...' : 'Share link'}
      </button>
    </form>
  )
}
