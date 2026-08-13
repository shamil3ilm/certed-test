'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { ACADEMY_WIDE_LABEL } from '@/lib/ui'
import { Input, Select } from '../../form'
import { assertActionOk } from '../../action-client'
import { createMeetLinkAction } from '../../meetings/actions'
import { defaultLocalDateTime, toIsoFromLocalDateTime } from '../calendar-config'
import type { Opt } from '../calendar-types'

export function MeetCreateForm({
  date,
  classes,
  isAdmin,
  onSuccess,
  onError,
}: {
  date: string
  classes: Opt[]
  isAdmin: boolean
  onSuccess: () => void
  onError: (message: string) => void
}) {
  const [classId, setClassId] = useState(isAdmin ? 'global' : (classes[0]?.id ?? ''))
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [scheduledAt, setScheduledAt] = useState(defaultLocalDateTime(date))
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const scheduledIso = scheduledAt ? toIsoFromLocalDateTime(scheduledAt) : null
    if (scheduledAt && !scheduledIso) {
      const message = 'Enter a valid meeting time'
      setError(message)
      onError(message)
      return
    }

    const formData = new FormData()
    formData.set('classId', classId)
    formData.set('title', title.trim())
    formData.set('url', url.trim())
    formData.set('description', description.trim())
    formData.set('scheduled_at', scheduledIso ?? '')

    startTransition(async () => {
      try {
        assertActionOk(await createMeetLinkAction(formData), 'Could not share meeting link')
        onSuccess()
      } catch (submitError) {
        const message = submitError instanceof Error ? submitError.message : 'Could not share meeting link'
        setError(message)
        onError(message)
      }
    })
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <label className="text-sm">
        Share with
        <Select value={classId} onChange={(event) => setClassId(event.target.value)} className="mt-1">
          {isAdmin && <option value="global">{ACADEMY_WIDE_LABEL}</option>}
          {!isAdmin && classes.length === 0 && <option value="">No classes</option>}
          {classes.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="text-sm">
        Meeting title
        <Input
          value={title}
          required
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Maths live revision"
          className="mt-1"
        />
      </label>
      <label className="text-sm sm:col-span-2">
        Meeting link
        <Input
          type="url"
          value={url}
          required
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://meet.google.com/..."
          className="mt-1"
        />
      </label>
      <label className="text-sm">
        Meeting time
        <Input
          type="datetime-local"
          value={scheduledAt}
          onChange={(event) => setScheduledAt(event.target.value)}
          className="mt-1"
        />
      </label>
      <label className="text-sm">
        Note
        <Input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Optional note for attendees"
          className="mt-1"
        />
      </label>
      <div className="mt-1 flex gap-2 sm:col-span-2">
        <button type="submit" disabled={isPending} className="btn btn-primary">
          {isPending ? 'Sharing...' : 'Share meeting link'}
        </button>
      </div>
    </form>
  )
}
