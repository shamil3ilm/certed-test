'use client'

import { useState, useTransition } from 'react'
import { CARD, cx, ACADEMY_WIDE_LABEL } from '@/lib/ui'
import { Field, Input, Select, Textarea } from '../form'
import { assertActionOk } from '../action-client'
import { useUI } from '../Providers'
import { createMeetLinkAction } from './actions'

type ClassRow = { id: string; name: string }

export function MeetForm({ classes, canGlobal }: { classes: ClassRow[]; canGlobal: boolean }) {
  const { toast } = useUI()
  const [isPending, startTransition] = useTransition()
  const [classId, setClassId] = useState(classes[0]?.id ?? '')
  const single = classes.length === 1 && !canGlobal
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (!title.trim() || !url.trim()) return

    // Convert the optional datetime-local value to a strict ISO instant HERE (the
    // server requires ISO); an empty field submits as '' -> a null, always-available
    // link. Guard an unparseable value rather than sending garbage.
    let scheduledIso = ''
    if (scheduledAt) {
      const date = new Date(scheduledAt)
      if (Number.isNaN(date.getTime())) return
      scheduledIso = date.toISOString()
    }

    const formData = new FormData()
    formData.append('classId', classId)
    formData.append('title', title.trim())
    formData.append('url', url.trim())
    formData.append('description', description.trim())
    formData.append('scheduled_at', scheduledIso)

    startTransition(async () => {
      try {
        assertActionOk(await createMeetLinkAction(formData), 'Something went wrong')
        setTitle('')
        setUrl('')
        setDescription('')
        setScheduledAt('')
        toast('Meet link shared', 'success')
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : 'Something went wrong')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className={cx(CARD, 'space-y-4 p-5')}>
      <h2 className="text-lg font-semibold text-slate-900">Share a Meet Link</h2>

      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <div className={single ? 'space-y-1' : 'grid gap-4 sm:grid-cols-2'}>
        {!single && (
          <Field label="Class scope">
            <Select value={classId} onChange={(event) => setClassId(event.target.value)} required>
              {canGlobal && <option value="global">{ACADEMY_WIDE_LABEL}</option>}
              {classes.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Title">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Maths Doubt Class"
            required
          />
        </Field>
      </div>

      <Field label="Meet URL">
        <Input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://meet.google.com/..."
          required
        />
      </Field>

      <Field label="Scheduled time (optional)" hint="Leave blank for an always-available link. Locks after it ends.">
        <Input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
      </Field>

      <Field label="Description (optional)">
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Topics to cover, timings, worksheets to bring..."
          rows={2}
        />
      </Field>

      <button type="submit" disabled={isPending} className="btn btn-primary w-full justify-center sm:w-auto">
        {isPending ? 'Sharing...' : 'Share link'}
      </button>
    </form>
  )
}
