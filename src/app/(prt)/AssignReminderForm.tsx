'use client'

import { useState, type FormEvent } from 'react'
import { assertActionOk } from './action-client'
import { useUI } from './Providers'
import { assignReminderAction } from './dashboard/actions'

/**
 * A tutor or mentor sets a reminder for one student: something they are meant to do by a time, which
 * lands on the student's dashboard and is announced to them straight away and again when it falls due.
 *
 * `classes` are the student's classes the person assigning may act in; with more than one they pick which
 * the reminder belongs to (the service re-checks both, so this only narrows the choice).
 */
export function AssignReminderForm({
  studentId,
  studentName,
  classes,
}: {
  studentId: string
  studentName: string
  classes: Array<{ id: string; name: string }>
}) {
  const { toast } = useUI()
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)

  if (classes.length === 0) return null

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    // The datetime-local input yields "2026-12-30T09:00" (no seconds, no zone); the server requires ISO-8601.
    const remindAt = new Date(String(data.get('remind_at') ?? ''))
    if (Number.isNaN(remindAt.getTime())) {
      toast('Choose when the reminder is for.', 'error')
      return
    }
    data.set('remind_at', remindAt.toISOString())
    data.set('assigneeId', studentId)
    if (!data.get('classId')) data.set('classId', classes[0].id)

    setBusy(true)
    try {
      assertActionOk(await assignReminderAction(data), 'Could not assign the reminder')
      toast(`Reminder assigned to ${studentName}`, 'success')
      form.reset()
      setOpen(false)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not assign the reminder', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="mt-2 text-sm">
      <summary className="cursor-pointer text-xs font-medium text-primary transition hover:underline">
        Assign a reminder
      </summary>
      <form onSubmit={onSubmit} className="mt-2 space-y-2">
        {classes.length > 1 && (
          <select
            name="classId"
            aria-label="Class"
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            defaultValue={classes[0].id}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <input
          name="title"
          required
          maxLength={200}
          aria-label="Reminder title"
          placeholder="What should they do?"
          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
        />
        <textarea
          name="description"
          rows={2}
          maxLength={2000}
          aria-label="Reminder note"
          placeholder="A note for them (optional)"
          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
        />
        <input
          name="remind_at"
          type="datetime-local"
          required
          aria-label="Remind at"
          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
        />
        <button type="submit" disabled={busy} className="btn btn-sm btn-soft">
          {busy ? 'Assigning...' : 'Assign reminder'}
        </button>
      </form>
    </details>
  )
}
