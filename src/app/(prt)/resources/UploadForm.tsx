'use client'
import { useState } from 'react'
import { useResumableUpload } from '@/lib/hooks/useResumableUpload'

type Course = { id: string; name: string }

export function UploadForm({ courses }: { courses: Course[] }) {
  const { upload, status, error } = useResumableUpload()
  const [title, setTitle] = useState('')
  const [courseId, setCourseId] = useState('')
  const [file, setFile] = useState<File | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !courseId || !title) return
    const res = await upload({ courseId, title, file })
    if (res) {
      setTitle('')
      setFile(null)
      location.reload()
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="font-medium">Upload a resource</h2>
      <select
        value={courseId}
        onChange={(e) => setCourseId(e.target.value)}
        required
        className="block w-full rounded border px-2 py-1"
      >
        <option value="">Select course</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        required
        className="block w-full rounded border px-2 py-1"
      />
      <input
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        required
        className="block w-full text-sm"
      />
      <button
        disabled={status === 'uploading'}
        className="btn btn-primary"
      >
        {status === 'uploading' ? 'Uploading…' : 'Upload'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  )
}
