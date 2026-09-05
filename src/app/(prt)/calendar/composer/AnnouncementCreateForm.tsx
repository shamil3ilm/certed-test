'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { ACADEMY_WIDE_LABEL } from '@/lib/ui'
import { Input, Select, Textarea } from '../../form'
import { assertActionOk } from '../../action-client'
import { createAnnouncementStatusAction } from '../../announcements/actions'
import type { Opt } from '../calendar-types'

export function AnnouncementCreateForm({
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
  const [classId, setClassId] = useState(isAdmin ? '' : (classes[0]?.id ?? ''))
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const formData = new FormData()
    formData.set('class_id', classId)
    formData.set('title', title.trim())
    formData.set('message', message.trim())

    startTransition(async () => {
      try {
        assertActionOk(await createAnnouncementStatusAction(formData), 'Could not post announcement')
        onSuccess()
      } catch (submitError) {
        const messageText = submitError instanceof Error ? submitError.message : 'Could not post announcement'
        setError(messageText)
        onError(messageText)
      }
    })
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-slate-600">
        This posts immediately to the selected class stream. The chosen calendar date is contextual only: {date}.
      </p>
      <label className="text-sm">
        Post to
        <Select value={classId} onChange={(event) => setClassId(event.target.value)} className="mt-1">
          {isAdmin && <option value="">{ACADEMY_WIDE_LABEL}</option>}
          {!isAdmin && classes.length === 0 && <option value="">No classes</option>}
          {classes.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="text-sm">
        Title
        <Input
          value={title}
          required
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Announcement title"
          className="mt-1"
        />
      </label>
      <label className="text-sm">
        Message
        <Textarea
          value={message}
          required
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Write the announcement students and tutors should see..."
          rows={4}
          className="mt-1"
        />
      </label>
      <div className="mt-1 flex gap-2">
        <button type="submit" disabled={isPending} className="btn btn-primary">
          {isPending ? 'Posting...' : 'Post announcement'}
        </button>
      </div>
    </form>
  )
}
