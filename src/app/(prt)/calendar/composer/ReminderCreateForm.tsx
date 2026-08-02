'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { assertActionOk } from '../../action-client'
import { createReminderAction } from '../../dashboard/actions'
import { defaultLocalDateTime, toIsoFromLocalDateTime } from '../calendar-config'

export function ReminderCreateForm({
  date,
  onSuccess,
  onError,
}: {
  date: string
  onSuccess: () => void
  onError: (message: string) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [remindAt, setRemindAt] = useState(defaultLocalDateTime(date))
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const remindAtIso = toIsoFromLocalDateTime(remindAt)
    if (!remindAtIso) {
      const message = 'Enter a valid reminder time'
      setError(message)
      onError(message)
      return
    }

    const formData = new FormData()
    formData.set('title', title.trim())
    formData.set('description', description.trim())
    formData.set('remind_at', remindAtIso)

    startTransition(async () => {
      try {
        assertActionOk(await createReminderAction(formData), 'Could not save reminder')
        onSuccess()
      } catch (submitError) {
        const message = submitError instanceof Error ? submitError.message : 'Could not save reminder'
        setError(message)
        onError(message)
      }
    })
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <label className="text-sm">
        Reminder title
        <input
          value={title}
          required
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What should you remember?"
          className="mt-1 block w-full"
        />
      </label>
      <label className="text-sm">
        Details
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Optional note"
          className="mt-1 block w-full"
        />
      </label>
      <label className="text-sm">
        Remind me at
        <input
          type="datetime-local"
          value={remindAt}
          required
          onChange={(event) => setRemindAt(event.target.value)}
          className="mt-1 block w-full"
        />
      </label>
      <div className="mt-1 flex gap-2">
        <button type="submit" disabled={isPending} className="btn btn-primary">
          {isPending ? 'Saving...' : 'Save reminder'}
        </button>
      </div>
    </form>
  )
}
