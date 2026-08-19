'use client'

import { useState, useTransition } from 'react'
import { assertActionOk } from '../action-client'
import { Field, Input, Textarea } from '../form'
import { editAssignmentAction } from './manage-actions'
import { isoToDatetimeLocal } from '@/lib/time/format'

export function EditAssignment({
  assignment,
}: {
  assignment: {
    id: string
    title: string
    description: string | null
    due_date: string
    attachment_drive_link: string | null
    topic: string | null
    max_marks: number | null
    enforce_deadline: boolean
  }
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(assignment.title)
  const [description, setDescription] = useState(assignment.description ?? '')
  const [due, setDue] = useState(isoToDatetimeLocal(assignment.due_date))
  const [brief, setBrief] = useState(assignment.attachment_drive_link ?? '')
  const [topic, setTopic] = useState(assignment.topic ?? '')
  const [maxMarks, setMaxMarks] = useState(assignment.max_marks != null ? String(assignment.max_marks) : '')
  const [enforceDeadline, setEnforceDeadline] = useState(assignment.enforce_deadline)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Re-seed every field from the CURRENT props each time the editor opens, not
  // once at mount: this instance is keyed by assignment.id and survives the
  // revalidate that a concurrent edit triggers, so opening without re-seeding
  // would pre-fill stale values and a save would revert the other edit.
  function openEditor() {
    setTitle(assignment.title)
    setDescription(assignment.description ?? '')
    setDue(isoToDatetimeLocal(assignment.due_date))
    setBrief(assignment.attachment_drive_link ?? '')
    setTopic(assignment.topic ?? '')
    setMaxMarks(assignment.max_marks != null ? String(assignment.max_marks) : '')
    setEnforceDeadline(assignment.enforce_deadline)
    setError(null)
    setOpen(true)
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    // Required fields are enforced natively; save errors surface inline below.
    setError(null)

    const formData = new FormData()
    formData.set('id', assignment.id)
    formData.set('title', title.trim())
    formData.set('description', description)
    formData.set('due_date', new Date(due).toISOString())
    formData.set('attachment_drive_link', brief.trim())
    formData.set('topic', topic.trim())
    formData.set('max_marks', maxMarks.trim())
    formData.set('enforce_deadline', enforceDeadline ? 'on' : '')

    startTransition(async () => {
      try {
        assertActionOk(await editAssignmentAction(formData), 'Could not save changes')
        setOpen(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save changes')
      }
    })
  }

  if (!open) {
    return (
      <button type="button" onClick={openEditor} className="btn btn-sm btn-soft">
        Edit
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="mt-3 w-full space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <Field label="Title">
        <Input value={title} onChange={(event) => setTitle(event.target.value)} required />
      </Field>
      <Field label="Description (optional)">
        <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} />
      </Field>
      <Field label="Due">
        <Input type="datetime-local" value={due} onChange={(event) => setDue(event.target.value)} required />
      </Field>
      <Field label="Topic (optional)">
        <Input value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={60} />
      </Field>
      <Field label="Max marks">
        <Input
          type="number"
          required
          min={1}
          max={9999.99}
          step="0.5"
          value={maxMarks}
          onChange={(event) => setMaxMarks(event.target.value)}
          placeholder="e.g. 20"
        />
      </Field>
      <Field label="Brief link (optional)" hint="Drive, Docs, Loom, YouTube, etc. Upload a PDF separately below.">
        <Input type="url" value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="https://..." />
      </Field>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={enforceDeadline}
          onChange={(event) => setEnforceDeadline(event.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        Close submissions after the due date (block late work)
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={isPending} className="btn btn-sm btn-primary">
          {isPending ? 'Saving...' : 'Save'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-sm btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  )
}
