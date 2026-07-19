'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { requestJson } from '../api-client'
import { Field, Input, Select, Textarea } from '../form'
import { useUI } from '../Providers'

type ClassRow = { id: string; name: string }

export function AssignmentForm({ classes }: { classes: ClassRow[] }) {
  const router = useRouter()
  const { toast } = useUI()
  const singleClass = classes.length === 1
  const [classId, setClassId] = useState(singleClass ? classes[0].id : '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [brief, setBrief] = useState('')
  const [topic, setTopic] = useState('')
  const [maxMarks, setMaxMarks] = useState('')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!classId || !title || !due) return

    setBusy(true)

    try {
      await requestJson('/api/assignments', {
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
      })

      setTitle('')
      setDescription('')
      setBrief('')
      setTopic('')
      setMaxMarks('')
      setDue('')
      toast('Assignment created', 'success')
      router.refresh()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not create assignment', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-medium text-slate-900">Create assignment</h2>
      {singleClass ? null : (
        <Field label="Class">
          <Select value={classId} onChange={(event) => setClassId(event.target.value)} required>
            <option value="" disabled>
              Select class
            </option>
            {classes.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Title">
        <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Chapter 4 worksheet" required />
      </Field>
      <Field label="Description (optional)">
        <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} />
      </Field>
      <Field label="Brief / attachment (optional)" hint="Paste a Google Drive link to the question paper or brief.">
        <Input type="url" value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="https://drive.google.com/..." />
      </Field>
      <div className="flex flex-wrap gap-3">
        <Field label="Topic (optional)" className="min-w-[10rem] flex-1" hint="e.g. Algebra - groups classwork">
          <Input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Unit / chapter" />
        </Field>
        <Field label="Max marks (optional)" className="w-32">
          <Input type="number" min="0" step="0.5" value={maxMarks} onChange={(event) => setMaxMarks(event.target.value)} placeholder="e.g. 20" />
        </Field>
      </div>
      <Field label="Due">
        <Input type="datetime-local" value={due} onChange={(event) => setDue(event.target.value)} required />
      </Field>
      <button disabled={busy} className="btn btn-primary">
        {busy ? 'Creating...' : 'Create'}
      </button>
    </form>
  )
}
