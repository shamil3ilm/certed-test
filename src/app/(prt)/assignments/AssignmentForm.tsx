'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Field, Input, Select, Textarea } from '../form'
import { useUI } from '../Providers'

type ClassRow = { id: string; name: string }

export function AssignmentForm({ classes }: { classes: ClassRow[] }) {
  const router = useRouter()
  const { toast } = useUI()
  const single = classes.length === 1
  const [classId, setClassId] = useState(single ? classes[0].id : '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [brief, setBrief] = useState('')
  const [topic, setTopic] = useState('')
  const [maxMarks, setMaxMarks] = useState('')
  const [due, setDue] = useState('') // datetime-local — the teacher's local wall-clock
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!classId || !title || !due) return
    setBusy(true)
    try {
      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_id: classId,
          title,
          description: description || undefined,
          due_date: new Date(due).toISOString(),
          attachment_drive_link: brief.trim() || undefined,
          topic: topic.trim() || undefined,
          max_marks: maxMarks ? Number(maxMarks) : undefined,
        }),
      }).then((r) => r.json())
      if (!res.success) throw new Error(res.error ?? 'failed')
      setTitle('')
      setDescription('')
      setBrief('')
      setTopic('')
      setMaxMarks('')
      setDue('')
      toast('Assignment created', 'success')
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not create assignment', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-medium text-slate-900">Create assignment</h2>
      {single ? null : (
        <Field label="Class">
          <Select value={classId} onChange={(e) => setClassId(e.target.value)} required>
            <option value="" disabled>Select class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chapter 4 worksheet" required />
      </Field>
      <Field label="Description (optional)">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </Field>
      <Field label="Brief / attachment (optional)" hint="Paste a Google Drive link to the question paper or brief.">
        <Input type="url" value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="https://drive.google.com/..." />
      </Field>
      <div className="flex flex-wrap gap-3">
        <Field label="Topic (optional)" className="min-w-[10rem] flex-1" hint="e.g. Algebra — groups classwork">
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Unit / chapter" />
        </Field>
        <Field label="Max marks (optional)" className="w-32">
          <Input type="number" min="0" step="0.5" value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} placeholder="e.g. 20" />
        </Field>
      </div>
      <Field label="Due">
        <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} required />
      </Field>
      <button disabled={busy} className="btn btn-primary">
        {busy ? 'Creating…' : 'Create'}
      </button>
    </form>
  )
}
