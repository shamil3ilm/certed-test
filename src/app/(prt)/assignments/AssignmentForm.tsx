'use client'
import { useState } from 'react'

type Course = { id: string; name: string }

export function AssignmentForm({ courses }: { courses: Course[] }) {
  const [courseId, setCourseId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [due, setDue] = useState('') // datetime-local — the teacher's local wall-clock
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!courseId || !title || !due) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_id: courseId,
          title,
          description: description || undefined,
          // Convert the local input to an absolute UTC instant.
          due_date: new Date(due).toISOString(),
        }),
      }).then((r) => r.json())
      if (!res.success) throw new Error(res.error ?? 'failed')
      location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="font-medium">Create assignment</h2>
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
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        className="block w-full rounded border px-2 py-1"
      />
      <label className="block text-sm text-slate-500">
        Due
        <input
          type="datetime-local"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          required
          className="mt-1 block w-full rounded border px-2 py-1"
        />
      </label>
      <button disabled={busy} className="btn btn-primary">
        {busy ? 'Creating…' : 'Create'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  )
}
