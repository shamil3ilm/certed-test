'use client'

import { useState, useTransition } from 'react'
import { assertActionOk } from '../action-client'
import { Field, Input, Textarea } from '../form'
import { useUI } from '../Providers'
import { editAssignmentAction } from './manage-actions'

function toLocalInput(iso: string): string {
  const date = new Date(iso)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

export function EditAssignment({
  assignment,
}: {
  assignment: {
    id: string
    title: string
    description: string | null
    due_date: string
    attachment_drive_link: string | null
  }
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(assignment.title)
  const [description, setDescription] = useState(assignment.description ?? '')
  const [due, setDue] = useState(toLocalInput(assignment.due_date))
  const [brief, setBrief] = useState(assignment.attachment_drive_link ?? '')
  const [isPending, startTransition] = useTransition()
  const { toast } = useUI()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!title.trim() || !due) return

    const formData = new FormData()
    formData.set('id', assignment.id)
    formData.set('title', title.trim())
    formData.set('description', description)
    formData.set('due_date', new Date(due).toISOString())
    formData.set('attachment_drive_link', brief.trim())

    startTransition(async () => {
      try {
        assertActionOk(await editAssignmentAction(formData), 'Could not save changes')
        setOpen(false)
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Could not save changes', 'error')
      }
    })
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-sm btn-soft">
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
      <Field label="Brief link (optional)">
        <Input
          type="url"
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          placeholder="https://drive.google.com/..."
        />
      </Field>
      <div className="flex gap-2">
        <button disabled={isPending} className="btn btn-sm btn-primary">
          {isPending ? 'Saving...' : 'Save'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-sm btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  )
}
